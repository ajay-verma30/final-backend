const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const db = require('../../config/db');

exports.createPaymentIntent = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const user_id = req.user.id;
    const org_id  = req.user.org_id;

    if (!org_id) {
      return res.status(400).json({
        message: "Your account is not linked to an organisation. Please contact support.",
      });
    }

    // ── 1. Fetch the user's cart ─────────────────────────────────────────────
    const [cartRows] = await connection.query(
      `SELECT
         ci.id             AS cart_item_id,
         ci.quantity,
         ci.customization_snapshot,
         ci.preview_image_url,
         pv.id             AS product_variant_id,
         pv.price          AS variant_price,
         p.id              AS product_id,
         p.base_price,
         p.name            AS product_name
       FROM carts c
       JOIN cart_items ci       ON ci.cart_id           = c.id
       JOIN product_variants pv ON pv.id                = ci.product_variant_id
       JOIN products p          ON p.id                 = pv.product_id
       WHERE c.user_id = ?`,
      [user_id]
    );

    if (cartRows.length === 0) {
      return res.status(400).json({ message: "Your cart is empty" });
    }

    // ── 2. Calculate totals ──────────────────────────────────────────────────
    const subtotal    = cartRows.reduce((sum, item) => {
      const unit = (parseFloat(item.base_price) || 0) + (parseFloat(item.variant_price) || 0);
      return sum + unit * item.quantity;
    }, 0);

    const shipping    = subtotal >= 99 ? 0 : 9.99;
    const total       = parseFloat((subtotal + shipping).toFixed(2));
    const amountCents = Math.round(total * 100);

    // ── 3. Check for an existing reusable PENDING order ──────────────────────
    const [existingOrders] = await connection.query(
      `SELECT id, stripe_payment_intent_id, total_price, subtotal
       FROM orders
       WHERE ordered_by = ? AND status = 'PENDING'
       ORDER BY created_at DESC
       LIMIT 1`,
      [user_id]
    );

    if (existingOrders.length > 0) {
      const existing = existingOrders[0];
      try {
        const existingIntent = await stripe.paymentIntents.retrieve(
          existing.stripe_payment_intent_id
        );
        const reusableStatuses = [
          'requires_payment_method',
          'requires_confirmation',
          'requires_action',
        ];
        if (reusableStatuses.includes(existingIntent.status)) {
          return res.status(200).json({
            success:      true,
            clientSecret: existingIntent.client_secret,
            order_id:     existing.id,
            total:        parseFloat(existing.total_price),
            subtotal:     parseFloat(existing.subtotal),
            shipping:     parseFloat(existing.total_price) - parseFloat(existing.subtotal),
          });
        }
      } catch (e) {
        // Intent no longer valid — fall through to create a fresh one
        console.warn("Could not retrieve existing PaymentIntent, creating new one:", e.message);
      }
    }

    // ── 4. Build idempotency key from user + cart fingerprint ────────────────
    // Same cart contents always maps to the same key — Stripe deduplicates on it.
    // Any change to cart (qty, items) produces a new key → new PaymentIntent.
    const cartFingerprint = cartRows
      .map(item => `${item.product_variant_id}:${item.quantity}`)
      .sort()
      .join('|');

    const idempotencyKey = `pi_${user_id}_${Buffer.from(cartFingerprint).toString('base64')}`;

    // ── 5. Create Stripe PaymentIntent (with idempotency key) ────────────────
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount:   amountCents,
        currency: 'usd',
        metadata: {
          type:    'ORDER',
          user_id: String(user_id),
          org_id:  String(org_id),
        },
      },
      {
        idempotencyKey, // ← Stripe returns the same intent if key matches
      }
    );

    // ── 6. Create pending order ──────────────────────────────────────────────
    await connection.beginTransaction();

    const [orderResult] = await connection.query(
      `INSERT INTO orders
         (org_id, ordered_by, subtotal, total_price, currency, status, stripe_payment_intent_id)
       VALUES (?, ?, ?, ?, 'USD', 'PENDING', ?)`,
      [org_id, user_id, subtotal, total, paymentIntent.id]
    );

    const order_id = orderResult.insertId;

    // ── 7. Insert order items ────────────────────────────────────────────────
    for (const item of cartRows) {
      const unit_price  = (parseFloat(item.base_price) || 0) + (parseFloat(item.variant_price) || 0);
      const total_price = parseFloat((unit_price * item.quantity).toFixed(2));

      await connection.query(
        `INSERT INTO order_items (order_id, product_variant_id, quantity, unit_price, total_price)
         VALUES (?, ?, ?, ?, ?)`,
        [order_id, item.product_variant_id, item.quantity, unit_price, total_price]
      );
    }

    // ── 8. Log initiated transaction ─────────────────────────────────────────
    await connection.query(
      `INSERT INTO transactions
         (type, status, org_id, created_by, payment_intent_id, amount, currency, description, metadata)
       VALUES ('PAYMENT', 'initiated', ?, ?, ?, ?, 'usd', ?, ?)`,
      [
        org_id,
        user_id,
        paymentIntent.id,
        total,
        `Order #${order_id} payment initiated`,
        JSON.stringify({ order_id, item_count: cartRows.length }),
      ]
    );

    await connection.commit();

    return res.status(201).json({
      success:      true,
      clientSecret: paymentIntent.client_secret,
      order_id,
      total,
      subtotal,
      shipping,
    });

  } catch (err) {
    await connection.rollback();
    console.error("CREATE PAYMENT INTENT ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  } finally {
    connection.release();
  }
};