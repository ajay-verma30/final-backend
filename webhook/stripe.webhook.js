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
    console.error('Webhook signature verification failed:', err.message);
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
        console.log(`Unhandled Stripe event type: ${event.type}`);
    }
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error(`Error processing Stripe event [${event.type}]:`, err);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
};

// ─── Route by metadata.type ───────────────────────────────────────────────────

async function handlePaymentSucceeded(paymentIntent) {
  const type = paymentIntent.metadata?.type;

  if (type === 'ORDER') {
    await handleOrderPaymentSucceeded(paymentIntent);
  } else {
    await handleCouponPaymentSucceeded(paymentIntent);
  }
}

async function handlePaymentFailed(paymentIntent) {
  const type = paymentIntent.metadata?.type;

  if (type === 'ORDER') {
    await handleOrderPaymentFailed(paymentIntent);
  } else {
    await handleCouponPaymentFailed(paymentIntent);
  }
}

async function handlePaymentCanceled(paymentIntent) {
  const type = paymentIntent.metadata?.type;

  if (type === 'ORDER') {
    await handleOrderPaymentFailed(paymentIntent); // treat canceled same as failed for orders
  } else {
    await handleCouponPaymentCanceled(paymentIntent);
  }
}

// ─── ORDER handlers ───────────────────────────────────────────────────────────

async function handleOrderPaymentSucceeded(paymentIntent) {
  const { id: paymentIntentId, metadata } = paymentIntent;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Find the pending order by payment_intent_id
    const [orders] = await connection.query(
      `SELECT id, org_id, ordered_by, total_price, status
       FROM orders WHERE stripe_payment_intent_id = ?`,
      [paymentIntentId]
    );

    if (orders.length === 0) {
      console.warn(`No order found for payment_intent: ${paymentIntentId}`);
      return;
    }

    const order = orders[0];

    // Idempotency guard
    if (order.status === 'PAID') {
      console.log(`Order ${order.id} already PAID — skipping duplicate webhook.`);
      return;
    }

    // Mark order as PAID
    await connection.query(
      `UPDATE orders SET status = 'PAID', updated_at = NOW()
       WHERE id = ?`,
      [order.id]
    );

    // Update transaction to succeeded
    await connection.query(
      `UPDATE transactions SET status = 'succeeded', updated_at = NOW()
       WHERE payment_intent_id = ? AND type = 'PAYMENT'`,
      [paymentIntentId]
    );

    // Clear the user's cart now that order is confirmed
    await connection.query(
      `DELETE ci FROM cart_items ci
       JOIN carts c ON c.id = ci.cart_id
       WHERE c.user_id = ?`,
      [order.ordered_by]
    );

    await connection.commit();
    console.log(`Order ${order.id} marked as PAID. Cart cleared for user ${order.ordered_by}.`);

  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function handleOrderPaymentFailed(paymentIntent) {
  const { id: paymentIntentId, last_payment_error } = paymentIntent;

  await pool.query(
    `UPDATE orders SET status = 'FAILED', updated_at = NOW()
     WHERE stripe_payment_intent_id = ?`,
    [paymentIntentId]
  );

  await pool.query(
    `UPDATE transactions
     SET status = 'failed',
         error_message = ?,
         updated_at = NOW()
     WHERE payment_intent_id = ? AND type = 'PAYMENT'`,
    [last_payment_error?.message || 'Payment failed or canceled', paymentIntentId]
  );

  console.warn(`Order payment failed/canceled for intent: ${paymentIntentId}`);
}

// ─── COUPON handlers (unchanged from original) ────────────────────────────────

async function handleCouponPaymentSucceeded(paymentIntent) {
  const { id: paymentIntentId } = paymentIntent;
  console.log(`payment_intent.succeeded (coupon): ${paymentIntentId}`);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT id, org_id, group_id, name, amount, payment_status, created_by
       FROM coupon_batches WHERE payment_intent_id = ?`,
      [paymentIntentId]
    );

    if (rows.length === 0) {
      console.warn(`No coupon_batch found for payment_intent: ${paymentIntentId}`);
      return;
    }

    const batch = rows[0];

    if (batch.payment_status === 'paid') {
      console.log(`Batch ${batch.id} already paid — skipping duplicate webhook.`);
      return;
    }

    await connection.query(
      `UPDATE coupon_batches SET payment_status = 'paid', updated_at = NOW() WHERE id = ?`,
      [batch.id]
    );

    await connection.commit();

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

async function handleCouponPaymentFailed(paymentIntent) {
  const { id: paymentIntentId, last_payment_error } = paymentIntent;
  console.warn(`payment_intent.payment_failed (coupon): ${paymentIntentId}`);

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
      description: `Payment failed for coupon batch "${batch.name}"`,
      error_message: last_payment_error?.message || 'Payment failed',
      metadata: { payment_intent_id: paymentIntentId },
    });
  }
}

async function handleCouponPaymentCanceled(paymentIntent) {
  const { id: paymentIntentId } = paymentIntent;
  console.warn(`payment_intent.canceled (coupon): ${paymentIntentId}`);

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