const db = require('../../config/db');

// ─── Helper: get or create a cart for the authenticated user ──────────────────
async function getOrCreateCart(connection, user_id, org_id) {
  const [rows] = await connection.query(
    `SELECT id FROM carts WHERE user_id = ? LIMIT 1`,
    [user_id]
  );
  if (rows.length > 0) return rows[0].id;

  const [result] = await connection.query(
    `INSERT INTO carts (user_id, org_id) VALUES (?, ?)`,
    [user_id, org_id ?? 0]
  );
  return result.insertId;
}

// ─── 1. Add to Cart ───────────────────────────────────────────────────────────
//
// Plain product body:
//   product_variant_id       required
//   quantity                 required
//
// Customized product body:
//   product_variant_id       required
//   quantity                 required
//   custom_product_id        id returned by /api/user/custom/save
//   custom_url               cloudinary URL of the composited design
//   logo_variant_ids         array of logo variant ids that were applied  e.g. [1, 3]
//   product_variant_image_id the image the logos were placed on
//
exports.addToCart = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const {
      product_variant_id,
      quantity,
      // customization fields — all optional, only present for customized products
      custom_product_id,
      custom_url,
      logo_variant_ids,         // array e.g. [1, 3]
      product_variant_image_id,
    } = req.body;

    if (!product_variant_id || !quantity) {
      return res.status(400).json({ message: "product_variant_id and quantity are required" });
    }

    const user_id = req.user.id;
    const org_id  = req.user.org_id || null;

    await connection.beginTransaction();

    const cart_id = await getOrCreateCart(connection, user_id, org_id);

    // Build snapshot only for customized products
    let customization_snapshot = null;
    let preview_image_url      = null;

    if (custom_product_id) {
      customization_snapshot = JSON.stringify({
        custom_product_id,
        logo_variant_ids: logo_variant_ids ?? [],   // array of all logos applied
        product_variant_image_id,
      });
      preview_image_url = custom_url || null;
    }

    // Check if an identical item already exists — increment qty if so.
    // Customized items are matched by custom_product_id (each design is unique).
    // Plain items are matched by variant with no snapshot.
    let existingItemId = null;

    if (custom_product_id) {
      const [existing] = await connection.query(
        `SELECT id FROM cart_items
         WHERE cart_id = ?
           AND product_variant_id = ?
           AND JSON_UNQUOTE(JSON_EXTRACT(customization_snapshot, '$.custom_product_id')) = ?
         LIMIT 1`,
        [cart_id, product_variant_id, String(custom_product_id)]
      );
      if (existing.length > 0) existingItemId = existing[0].id;
    } else {
      const [existing] = await connection.query(
        `SELECT id FROM cart_items
         WHERE cart_id = ?
           AND product_variant_id = ?
           AND customization_snapshot IS NULL
         LIMIT 1`,
        [cart_id, product_variant_id]
      );
      if (existing.length > 0) existingItemId = existing[0].id;
    }

    if (existingItemId) {
      await connection.query(
        `UPDATE cart_items SET quantity = quantity + ? WHERE id = ?`,
        [quantity, existingItemId]
      );
    } else {
      await connection.query(
        `INSERT INTO cart_items
           (cart_id, product_variant_id, quantity, customization_snapshot, preview_image_url)
         VALUES (?, ?, ?, ?, ?)`,
        [cart_id, product_variant_id, quantity, customization_snapshot, preview_image_url]
      );
    }

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: "Item added to cart",
    });

  } catch (err) {
    await connection.rollback();
    console.error("ADD TO CART ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  } finally {
    connection.release();
  }
};

// ─── 2. Get Cart ──────────────────────────────────────────────────────────────
exports.getCart = async (req, res) => {
  try {
    const user_id = req.user.id;

    const [items] = await db.query(
      `SELECT
         ci.id,
         ci.quantity,
         ci.customization_snapshot,
         ci.preview_image_url,
         pv.id            AS variant_id,
         pv.color,
         pv.size,
         pv.sku,
         pv.price         AS variant_price,
         p.id             AS product_id,
         p.name           AS product_name,
         p.base_price,
         p.slug           AS product_slug
       FROM carts c
       JOIN cart_items ci  ON ci.cart_id          = c.id
       JOIN product_variants pv ON pv.id          = ci.product_variant_id
       JOIN products p          ON p.id           = pv.product_id
       WHERE c.user_id = ?
       ORDER BY ci.created_at DESC`,
      [user_id]
    );

    return res.status(200).json({
      success: true,
      count: items.length,
      data: items,
    });

  } catch (err) {
    console.error("GET CART ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// ─── 3. Remove Cart Item ──────────────────────────────────────────────────────
exports.removeCartItem = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const user_id    = req.user.id;
    const { item_id } = req.params;

    // Security: only delete if the item belongs to this user's cart
    const [result] = await connection.query(
      `DELETE ci FROM cart_items ci
       JOIN carts c ON c.id = ci.cart_id
       WHERE ci.id = ? AND c.user_id = ?`,
      [item_id, user_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Cart item not found" });
    }

    await connection.commit();
    return res.status(200).json({ success: true, message: "Item removed" });

  } catch (err) {
    await connection.rollback();
    console.error("REMOVE CART ITEM ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  } finally {
    connection.release();
  }
};

// ─── 4. Update Cart Item Quantity ─────────────────────────────────────────────
exports.updateCartItem = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const user_id     = req.user.id;
    const { item_id } = req.params;
    const { quantity } = req.body;

    if (!quantity || quantity < 1) {
      return res.status(400).json({ message: "quantity must be at least 1" });
    }

    const [result] = await connection.query(
      `UPDATE cart_items ci
       JOIN carts c ON c.id = ci.cart_id
       SET ci.quantity = ?
       WHERE ci.id = ? AND c.user_id = ?`,
      [quantity, item_id, user_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Cart item not found" });
    }

    await connection.commit();
    return res.status(200).json({ success: true, message: "Quantity updated" });

  } catch (err) {
    await connection.rollback();
    console.error("UPDATE CART ITEM ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  } finally {
    connection.release();
  }
};