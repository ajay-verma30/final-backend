const db = require('../../config/db');
const cartService = require('./cart.services');

const getOrCreateCart = async (connection, user, sessionId) => {
  let cart;

  if (user) {
    const [existing] = await connection.query(
      `SELECT * FROM carts WHERE user_id = ? LIMIT 1`,
      [user.id]
    );

    if (existing.length) return existing[0];

    const [result] = await connection.query(
      `INSERT INTO carts (user_id, org_id) VALUES (?, ?)`,
      [user.id, user.org_id]
    );

    return { id: result.insertId };
  }

  // Guest cart
  const [existing] = await connection.query(
    `SELECT * FROM carts WHERE session_id = ? LIMIT 1`,
    [sessionId]
  );

  if (existing.length) return existing[0];

  const [result] = await connection.query(
    `INSERT INTO carts (session_id, org_id) VALUES (?, ?)`,
    [sessionId, null]
  );

  return { id: result.insertId };
};


exports.addToCart = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const user = req.user || null;
    const sessionId = req.headers['x-session-id'] || null;
    const { product_variant_id, quantity, customization_snapshot, preview_image_url } = req.body;

    if (!product_variant_id || !quantity) {
      return res.status(400).json({ message: "Variant & quantity required" });
    }

    await connection.beginTransaction();

    const cart = await cartService.getOrCreateCart(connection, user, sessionId);

    const [existing] = await connection.query(
      `SELECT * FROM cart_items
       WHERE cart_id = ? AND product_variant_id = ?`,
      [cart.id, product_variant_id]
    );

    if (existing.length) {
      await connection.query(
        `UPDATE cart_items
         SET quantity = quantity + ?
         WHERE id = ?`,
        [quantity, existing[0].id]
      );
    } else {
      await connection.query(
        `INSERT INTO cart_items
         (cart_id, product_variant_id, quantity,
          customization_snapshot, preview_image_url)
         VALUES (?, ?, ?, ?, ?)`,
        [
          cart.id,
          product_variant_id,
          quantity,
          customization_snapshot ? JSON.stringify(customization_snapshot) : null,
          preview_image_url || null
        ]
      );
    }

    await connection.commit();
    res.json({ message: "Added to cart" });

  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ message: "Server error" });
  } finally {
    connection.release();
  }
};


exports.getCart = async (req, res) => {
  try {
    const user = req.user || null;
    const sessionId = req.headers['x-session-id'] || null;

    let cartQuery;
    let param;

    if (user) {
      cartQuery = `SELECT * FROM carts WHERE user_id = ? LIMIT 1`;
      param = user.id;
    } else {
      cartQuery = `SELECT * FROM carts WHERE session_id = ? LIMIT 1`;
      param = sessionId;
    }

    const [cart] = await db.query(cartQuery, [param]);

    if (!cart.length) return res.json({ items: [] });

    const [items] = await db.query(
      `SELECT * FROM cart_items WHERE cart_id = ?`,
      [cart[0].id]
    );

    res.json({ cart: cart[0], items });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};


exports.updateCartItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { quantity } = req.body;

    await db.query(
      `UPDATE cart_items SET quantity = ? WHERE id = ?`,
      [quantity, itemId]
    );

    return res.json({ message: "Cart updated" });

  } catch (err) {
    console.error("UPDATE CART ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
};


exports.removeCartItem = async (req, res) => {
  try {
    const { itemId } = req.params;

    await db.query(
      `DELETE FROM cart_items WHERE id = ?`,
      [itemId]
    );

    return res.json({ message: "Item removed" });

  } catch (err) {
    console.error("REMOVE CART ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
};


exports.clearCart = async (req, res) => {
  try {
    const user = req.user;
    await db.query(
      `DELETE ci FROM cart_items ci
       JOIN carts c ON ci.cart_id = c.id
       WHERE c.user_id = ?`,
      [user.id]
    );

    return res.json({ message: "Cart cleared" });

  } catch (err) {
    console.error("CLEAR CART ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
};