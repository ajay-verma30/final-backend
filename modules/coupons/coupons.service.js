const pool = require('../../config/db');
const emailService = require('../../src/services/email.service');
const crypto = require('crypto');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const generateCouponCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const segment = (len) =>
    Array.from(crypto.randomBytes(len))
      .map((b) => chars[b % chars.length])
      .join('');
  return `${segment(4)}-${segment(4)}-${segment(4)}`;
};

const generateUniqueCodes = async (connection, count) => {
  const codes = new Set();
  while (codes.size < count) codes.add(generateCouponCode());

  const codeArray = [...codes];
  const [existing] = await connection.query(
    `SELECT coupon_code FROM coupons WHERE coupon_code IN (?)`,
    [codeArray]
  );

  if (existing.length > 0) {
    const taken = new Set(existing.map((r) => r.coupon_code));
    const safe = codeArray.filter((c) => !taken.has(c));
    while (safe.length < count) {
      const newCode = generateCouponCode();
      if (!taken.has(newCode)) safe.push(newCode);
    }
    return safe.slice(0, count);
  }

  return codeArray;
};

// ─── Transaction Logger ───────────────────────────────────────────────────────
// Central helper so every log call looks the same and never throws.

const logTransaction = async ({
  type, status, org_id, coupon_batch_id = null, created_by,
  payment_intent_id = null, amount = null, currency = 'usd',
  description = null, error_message = null, metadata = null,
}) => {
  try {
    await pool.query(
      `INSERT INTO transactions
         (type, status, org_id, coupon_batch_id, created_by,
          payment_intent_id, amount, currency, description, error_message, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        type, status, org_id, coupon_batch_id, created_by,
        payment_intent_id, amount, currency, description, error_message,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );
  } catch (err) {
    // Logging should never crash the main flow
    console.error('⚠️  Failed to log transaction:', err.message);
  }
};

// ─── 1. Get Batches (Role Based) ─────────────────────────────────────────────

exports.getBatches = async (role, orgId = null) => {
  let query = `
    SELECT 
      cb.id, cb.name as batch_name, cb.description, cb.amount,
      cb.payment_status, cb.created_at,
      o.name as organization_name,
      u.first_name, u.last_name,
      ug.name as group_name
    FROM coupon_batches cb
    JOIN organizations o ON cb.org_id = o.id
    JOIN users u ON cb.created_by = u.id
    LEFT JOIN user_groups ug ON cb.group_id = ug.id
  `;

  const params = [];
  if (role === 'ADMIN' && orgId) {
    query += ` WHERE cb.org_id = ?`;
    params.push(orgId);
  }
  query += ` ORDER BY cb.created_at DESC`;

  const [rows] = await pool.query(query, params);
  return rows;
};

// ─── 2. Initiate Payment ──────────────────────────────────────────────────────
// Creates Stripe PaymentIntent + inserts coupon_batch row as 'pending'.
// Logs a PAYMENT/initiated transaction immediately.

exports.initiateCouponPayment = async (data, currentUser) => {
  const { name, description, amount, group_id, org_id } = data;

  // Create Stripe PaymentIntent
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(Number(amount) * 100),
    currency: 'usd',
    automatic_payment_methods: { enabled: true },
    metadata: {
      org_id: String(org_id),
      group_id: String(group_id),
      batch_name: name,
      description: description || '',
      created_by: String(currentUser.id),
      type: 'COUPON_PAYMENT',
    },
  });

  // Insert batch as 'pending'
  const [result] = await pool.query(
    `INSERT INTO coupon_batches
       (org_id, group_id, name, description, amount, payment_status, payment_intent_id, created_by)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [org_id, group_id, name, description, amount, paymentIntent.id, currentUser.id]
  );

  const batchId = result.insertId;

  // ── Log: payment initiated ──
  await logTransaction({
    type: 'PAYMENT',
    status: 'initiated',
    org_id,
    coupon_batch_id: batchId,
    created_by: currentUser.id,
    payment_intent_id: paymentIntent.id,
    amount,
    description: `Payment initiated for coupon batch "${name}"`,
    metadata: { group_id, batch_name: name },
  });

  return { batchId, clientSecret: paymentIntent.client_secret };
};

// ─── 3. Distribute Coupons (called by webhook after payment_intent.succeeded) ─

exports.distributeToGroup = async ({ batchId, orgId, groupId, batchName, amount, createdBy, paymentIntentId }) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [groupUsers] = await connection.query(
      `SELECT u.id as user_id, u.email, u.first_name 
       FROM users u
       JOIN user_group_members gm ON u.id = gm.user_id 
       WHERE gm.group_id = ? AND u.deleted_at IS NULL`,
      [groupId]
    );

    if (groupUsers.length === 0) throw new Error('NO_USERS_IN_GROUP');

    const codes = await generateUniqueCodes(connection, groupUsers.length);

    const couponValues = groupUsers.map((user, i) => [
      orgId, user.user_id, batchId, groupId, amount, codes[i],
    ]);

    await connection.query(
      `INSERT INTO coupons (org_id, user_id, coupon_batch_id, group_id, amount, coupon_code)
       VALUES ?`,
      [couponValues]
    );

    await connection.commit();

    // ── Log: distribution succeeded ──
    await logTransaction({
      type: 'COUPON_DISTRIBUTION',
      status: 'succeeded',
      org_id: orgId,
      coupon_batch_id: batchId,
      created_by: createdBy,
      payment_intent_id: paymentIntentId,
      amount,
      description: `${groupUsers.length} coupons distributed for batch "${batchName}"`,
      metadata: { group_id: groupId, total_coupons: groupUsers.length },
    });

    // Fire-and-forget emails
    Promise.all(
      groupUsers.map((user, i) =>
        emailService.sendCouponEmail(user.email, user.first_name, amount, batchName, codes[i])
      )
    ).catch((err) => console.error('Email distribution error:', err));

    console.log(`✅ Distributed ${groupUsers.length} coupons for batch ${batchId}`);
    return { totalCoupons: groupUsers.length };

  } catch (err) {
    await connection.rollback();

    // ── Log: distribution failed ──
    await logTransaction({
      type: 'COUPON_DISTRIBUTION',
      status: 'failed',
      org_id: orgId,
      coupon_batch_id: batchId,
      created_by: createdBy,
      payment_intent_id: paymentIntentId,
      amount,
      description: `Coupon distribution failed for batch "${batchName}"`,
      error_message: err.message,
      metadata: { group_id: groupId },
    });

    throw err;
  } finally {
    connection.release();
  }
};

// ─── 4. Log Payment Status Update (called directly by webhook) ───────────────
// Exported so webhook can log succeeded/failed without duplicating logic here.

exports.logTransaction = logTransaction;

// ─── 5. Get User's Own Coupons (End-user view) ───────────────────────────────

exports.getCouponsByUserId = async (userId) => {
  const [rows] = await pool.query(
    `SELECT c.*, b.name as batch_name 
     FROM coupons c 
     JOIN coupon_batches b ON c.coupon_batch_id = b.id 
     WHERE c.user_id = ? AND c.is_used = 0`,
    [userId]
  );
  return rows;
};