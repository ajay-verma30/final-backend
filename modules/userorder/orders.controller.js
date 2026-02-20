const db = require('../../config/db');

// GET /api/user/orders
// Returns all orders for the authenticated user, each with their items
exports.getUserOrders = async (req, res) => {
  try {
    const user_id = req.user.id;

    // Fetch all orders for this user
    const [orders] = await db.query(
      `SELECT
         o.id,
         o.status,
         o.subtotal,
         o.total_price,
         o.currency,
         o.stripe_payment_intent_id,
         o.created_at
       FROM orders o
       WHERE o.ordered_by = ?
       ORDER BY o.created_at DESC`,
      [user_id]
    );

    if (orders.length === 0) {
      return res.status(200).json({ success: true, count: 0, data: [] });
    }

    // Fetch all order items for these orders in one query
    const orderIds = orders.map((o) => o.id);
    const [items] = await db.query(
      `SELECT
         oi.id,
         oi.order_id,
         oi.product_variant_id,
         oi.quantity,
         oi.unit_price,
         oi.total_price,
         p.name   AS product_name,
         pv.color,
         pv.size,
         pv.sku
       FROM order_items oi
       JOIN product_variants pv ON pv.id = oi.product_variant_id
       JOIN products p          ON p.id  = pv.product_id
       WHERE oi.order_id IN (?)
       ORDER BY oi.id ASC`,
      [orderIds]
    );

    // Group items by order_id and attach to their parent order
    const itemsByOrder = items.reduce((acc, item) => {
      if (!acc[item.order_id]) acc[item.order_id] = [];
      acc[item.order_id].push(item);
      return acc;
    }, {});

    const data = orders.map((order) => ({
      ...order,
      items: itemsByOrder[order.id] || [],
    }));

    return res.status(200).json({ success: true, count: data.length, data });

  } catch (err) {
    console.error("GET USER ORDERS ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
};