const db = require('../../config/db');

// 1. Save Custom Product
// Expects:
//   req.file                   — composited PNG (multipart)
//   req.body.product_id
//   req.body.product_variant_id
//   req.body.product_variant_image_id
//   req.body.logo_variant_ids  — JSON array string e.g. "[1, 3]"
exports.saveCustomProduct = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const {
      product_id,
      product_variant_id,
      product_variant_image_id,
      logo_variant_ids,        // "[1, 3]" — all logos applied to this design
    } = req.body;

    const user_id = req.user.id;
    const org_id  = req.user.org_id || null;

    if (!req.file) {
      return res.status(400).json({ message: "Customized product image is required" });
    }

    // Parse logo_variant_ids — accept both a JSON string and a plain array
    let logoIds = [];
    try {
      logoIds = typeof logo_variant_ids === 'string'
        ? JSON.parse(logo_variant_ids)
        : logo_variant_ids;
    } catch {
      return res.status(400).json({ message: "logo_variant_ids must be a valid JSON array" });
    }

    if (!Array.isArray(logoIds) || logoIds.length === 0) {
      return res.status(400).json({ message: "At least one logo_variant_id is required" });
    }

    const custom_url = req.file.path;

    await connection.beginTransaction();

    // Insert the single custom product record (no logo_variant_id column anymore)
    const [result] = await connection.query(
      `INSERT INTO user_custom_products
         (user_id, org_id, product_id, product_variant_id, product_variant_image_id, custom_url)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [user_id, org_id, product_id, product_variant_id, product_variant_image_id, custom_url]
    );

    const custom_product_id = result.insertId;

    // Bulk insert one row per logo into the child table
    const logoRows = logoIds.map((logo_variant_id) => [custom_product_id, logo_variant_id]);
    await connection.query(
      `INSERT INTO user_custom_product_logos (custom_product_id, logo_variant_id) VALUES ?`,
      [logoRows]
    );

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: "Custom product created successfully",
      id: custom_product_id,
      custom_url,
    });

  } catch (err) {
    await connection.rollback();
    console.error("SAVE CUSTOM PRODUCT ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  } finally {
    connection.release();
  }
};

// 2. Get User Custom Products
// Returns each custom product with an array of all logos applied to it
exports.getUserCustomProducts = async (req, res) => {
  try {
    const user_id = req.user.id;

    // Fetch the base custom product rows
    const [rows] = await db.query(
      `SELECT
         ucp.id,
         ucp.custom_url,
         ucp.created_at,
         p.name          AS product_name,
         p.base_price,
         pv.color,
         pv.size,
         pv.sku
       FROM user_custom_products ucp
       INNER JOIN products p          ON ucp.product_id         = p.id
       INNER JOIN product_variants pv ON ucp.product_variant_id = pv.id
       WHERE ucp.user_id = ?
       ORDER BY ucp.created_at DESC`,
      [user_id]
    );

    if (rows.length === 0) {
      return res.status(200).json({ success: true, count: 0, data: [] });
    }

    // Fetch all logos for these custom products in one query
    const customProductIds = rows.map((r) => r.id);
    const [logoRows] = await db.query(
      `SELECT
         ucpl.custom_product_id,
         lv.id            AS logo_variant_id,
         lv.color         AS logo_color,
         lv.image_url     AS logo_url,
         l.title          AS logo_title
       FROM user_custom_product_logos ucpl
       INNER JOIN logo_variants lv ON ucpl.logo_variant_id = lv.id
       INNER JOIN logos l          ON lv.logo_id           = l.id
       WHERE ucpl.custom_product_id IN (?)`,
      [customProductIds]
    );

    // Group logos by custom_product_id and attach to their parent row
    const logosByProduct = logoRows.reduce((acc, logo) => {
      if (!acc[logo.custom_product_id]) acc[logo.custom_product_id] = [];
      acc[logo.custom_product_id].push({
        logo_variant_id: logo.logo_variant_id,
        logo_color:      logo.logo_color,
        logo_url:        logo.logo_url,
        logo_title:      logo.logo_title,
      });
      return acc;
    }, {});

    const data = rows.map((row) => ({
      ...row,
      logos: logosByProduct[row.id] || [],
    }));

    return res.status(200).json({
      success: true,
      count: data.length,
      data,
    });

  } catch (err) {
    console.error("GET CUSTOM PRODUCTS ERROR:", err);
    return res.status(500).json({ message: "Server error while fetching customizations" });
  }
};