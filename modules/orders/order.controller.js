const db = require('../../config/db');

exports.createOrder = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const currentUser = req.user;
    const { items } = req.body;

    if (!items || !items.length) {
      return res.status(400).json({ message: "Order items required" });
    }

    await connection.beginTransaction();

    let subtotal = 0;

    // 1️⃣ Calculate subtotal
    for (let item of items) {
      const [variant] = await connection.query(
        `SELECT price 
         FROM product_variants 
         WHERE id = ? AND is_active = 1`,
        [item.product_variant_id]
      );

      if (!variant.length) {
        throw new Error("Invalid or inactive variant");
      }

      subtotal += variant[0].price * item.quantity;
    }

    const totalPrice = subtotal;

    // 2️⃣ Create Order
    const [orderResult] = await connection.query(
      `INSERT INTO orders 
       (org_id, ordered_by, subtotal, discount_amount, total_price)
       VALUES (?, ?, ?, ?, ?)`,
      [
        currentUser.org_id,
        currentUser.id,
        subtotal,
        0,
        totalPrice
      ]
    );

    const orderId = orderResult.insertId;

    // 3️⃣ Insert Order Items + Customizations
    for (let item of items) {

      const [variant] = await connection.query(
        `SELECT price FROM product_variants WHERE id = ?`,
        [item.product_variant_id]
      );

      const unitPrice = variant[0].price;
      const itemTotal = unitPrice * item.quantity;

      const [orderItem] = await connection.query(
        `INSERT INTO order_items
         (order_id, product_variant_id, quantity, unit_price, total_price)
         VALUES (?, ?, ?, ?, ?)`,
        [orderId, item.product_variant_id, item.quantity, unitPrice, itemTotal]
      );

      const orderItemId = orderItem.insertId;

      if (item.customizations) {
        for (let custom of item.customizations) {

          await connection.query(
            `INSERT INTO order_item_customizations
            (order_item_id, placement_id, logo_variant_id,
             position_snapshot, preview_image_url)
            VALUES (?, ?, ?, ?, ?)`,
            [
              orderItemId,
              custom.placement_id || null,
              custom.logo_variant_id || null,
              JSON.stringify(custom.position_snapshot),
              custom.preview_image_url
            ]
          );
        }
      }
    }

    await connection.commit();

    return res.status(201).json({
      message: "Order created successfully",
      orderId,
      subtotal,
      totalPrice
    });

  } catch (err) {
    await connection.rollback();
    console.error("ORDER CREATE ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  } finally {
    connection.release();
  }
};


exports.getMyOrders = async (req, res) => {
  try {
    const currentUser = req.user;

    const [orders] = await db.query(
      `SELECT * FROM orders
       WHERE ordered_by = ?
       ORDER BY created_at DESC`,
      [currentUser.id]
    );

    return res.json(orders);

  } catch (err) {
    console.error("GET MY ORDERS ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
};


exports.getOrderDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = req.user;

    const [order] = await db.query(
      `SELECT * FROM orders WHERE id = ?`,
      [id]
    );

    if (!order.length) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order[0].ordered_by !== currentUser.id) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const [items] = await db.query(
      `SELECT * FROM order_items WHERE order_id = ?`,
      [id]
    );

    for (let item of items) {
      const [customizations] = await db.query(
        `SELECT * FROM order_item_customizations
         WHERE order_item_id = ?`,
        [item.id]
      );

      item.customizations = customizations;
    }

    order[0].items = items;

    return res.json(order[0]);

  } catch (err) {
    console.error("ORDER DETAILS ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
};


exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    await db.query(
      `UPDATE orders SET status = ? WHERE id = ?`,
      [status, id]
    );

    return res.json({ message: "Order status updated" });

  } catch (err) {
    console.error("UPDATE ORDER STATUS ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
};