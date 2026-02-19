const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const pool = require('../config/db');
const couponService = require('../modules/coupons/coupons.service');

exports.handleStripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('❌ Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
      case 'payment_intent.canceled':
        await handlePaymentCanceled(event.data.object);
        break;
      default:
        console.log(`ℹ️  Unhandled Stripe event type: ${event.type}`);
    }

    return res.status(200).json({ received: true });

  } catch (err) {
    console.error(`❌ Error processing Stripe event [${event.type}]:`, err);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
};

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handlePaymentSucceeded(paymentIntent) {
  const { id: paymentIntentId } = paymentIntent;
  console.log(`✅ payment_intent.succeeded: ${paymentIntentId}`);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT id, org_id, group_id, name, amount, payment_status, created_by
       FROM coupon_batches WHERE payment_intent_id = ?`,
      [paymentIntentId]
    );

    if (rows.length === 0) {
      console.warn(`⚠️  No coupon_batch found for payment_intent: ${paymentIntentId}`);
      return;
    }

    const batch = rows[0];

    // Idempotency guard
    if (batch.payment_status === 'paid') {
      console.log(`ℹ️  Batch ${batch.id} already paid — skipping duplicate webhook.`);
      return;
    }

    await connection.query(
      `UPDATE coupon_batches SET payment_status = 'paid', updated_at = NOW() WHERE id = ?`,
      [batch.id]
    );

    await connection.commit();

    // ── Log: payment succeeded ──
    await couponService.logTransaction({
      type: 'PAYMENT',
      status: 'succeeded',
      org_id: batch.org_id,
      coupon_batch_id: batch.id,
      created_by: batch.created_by,
      payment_intent_id: paymentIntentId,
      amount: batch.amount,
      description: `Payment confirmed for coupon batch "${batch.name}"`,
      metadata: { group_id: batch.group_id, payment_intent_id: paymentIntentId },
    });

    // Distribute coupons AFTER commit — passes createdBy & paymentIntentId for logging
    await couponService.distributeToGroup({
      batchId:         batch.id,
      orgId:           batch.org_id,
      groupId:         batch.group_id,
      batchName:       batch.name,
      amount:          batch.amount,
      createdBy:       batch.created_by,
      paymentIntentId: paymentIntentId,
    });

  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function handlePaymentFailed(paymentIntent) {
  const { id: paymentIntentId, last_payment_error } = paymentIntent;
  console.warn(`❌ payment_intent.payment_failed: ${paymentIntentId}`, last_payment_error?.message);

  const [rows] = await pool.query(
    `SELECT id, org_id, amount, name, created_by FROM coupon_batches WHERE payment_intent_id = ?`,
    [paymentIntentId]
  );

  await pool.query(
    `UPDATE coupon_batches SET payment_status = 'failed', updated_at = NOW()
     WHERE payment_intent_id = ?`,
    [paymentIntentId]
  );

  if (rows.length > 0) {
    const batch = rows[0];
    // ── Log: payment failed ──
    await couponService.logTransaction({
      type: 'PAYMENT',
      status: 'failed',
      org_id: batch.org_id,
      coupon_batch_id: batch.id,
      created_by: batch.created_by,
      payment_intent_id: paymentIntentId,
      amount: batch.amount,
      description: `Payment failed for coupon batch "${batch.name}"`,
      error_message: last_payment_error?.message || 'Payment failed',
      metadata: { payment_intent_id: paymentIntentId },
    });
  }
}

async function handlePaymentCanceled(paymentIntent) {
  const { id: paymentIntentId } = paymentIntent;
  console.warn(`⚠️  payment_intent.canceled: ${paymentIntentId}`);

  const [rows] = await pool.query(
    `SELECT id, org_id, amount, name, created_by FROM coupon_batches WHERE payment_intent_id = ?`,
    [paymentIntentId]
  );

  await pool.query(
    `UPDATE coupon_batches SET payment_status = 'failed', updated_at = NOW()
     WHERE payment_intent_id = ?`,
    [paymentIntentId]
  );

  if (rows.length > 0) {
    const batch = rows[0];
    await couponService.logTransaction({
      type: 'PAYMENT',
      status: 'failed',
      org_id: batch.org_id,
      coupon_batch_id: batch.id,
      created_by: batch.created_by,
      payment_intent_id: paymentIntentId,
      amount: batch.amount,
      description: `Payment canceled for coupon batch "${batch.name}"`,
      error_message: 'Payment was canceled',
      metadata: { payment_intent_id: paymentIntentId },
    });
  }
}