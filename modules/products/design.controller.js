const db = require('../../config/db');

exports.saveBulkLogoPlacements = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const currentUser = req.user;
    const { placements } = req.body; // Ab hum ek array expect kar rahe hain

    if (!placements || !Array.isArray(placements) || placements.length === 0) {
      return res.status(400).json({ message: 'No placements data provided' });
    }

    if (currentUser.role !== 'SUPER' && currentUser.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    await connection.beginTransaction();

    const warnings = [];

    for (const item of placements) {
      const {
        product_variant_id,
        logo_variant_id,
        product_variant_image_id,
        position_x_percent,
        position_y_percent,
        width_percent,
        height_percent
      } = item;

      // 1. Visibility Check (Warning logic)
      const [statusCheck] = await connection.query(`
        SELECT p.is_public as p_pub, l.is_public as l_pub, l.title as l_title
        FROM product_variants pv
        JOIN products p ON pv.product_id = p.id
        JOIN logo_variants lv ON lv.id = ?
        JOIN logos l ON lv.logo_id = l.id
        WHERE pv.id = ?
      `, [logo_variant_id, product_variant_id]);

      if (statusCheck.length > 0 && statusCheck[0].p_pub === 1 && statusCheck[0].l_pub === 0) {
        warnings.push(`Logo "${statusCheck[0].l_title}" is private but placed on a public product.`);
      }

      // 2. UPSERT Logic (Check if this logo is already on this specific image view)
      const [existing] = await connection.query(
        `SELECT id FROM custom_product_designs 
         WHERE product_variant_image_id = ? AND logo_variant_id = ?`,
        [product_variant_image_id, logo_variant_id]
      );

      if (existing.length > 0) {
        await connection.query(
          `UPDATE custom_product_designs SET 
            position_x_percent = ?, position_y_percent = ?, 
            width_percent = ?, height_percent = ?
           WHERE id = ?`,
          [position_x_percent, position_y_percent, width_percent, height_percent, existing[0].id]
        );
      } else {
        await connection.query(
          `INSERT INTO custom_product_designs 
          (product_variant_id, logo_variant_id, product_variant_image_id, 
           position_x_percent, position_y_percent, width_percent, height_percent, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [product_variant_id, logo_variant_id, product_variant_image_id, 
           position_x_percent, position_y_percent, width_percent, height_percent, currentUser.id]
        );
      }
    }

    await connection.commit();
    return res.status(200).json({ 
      message: `${placements.length} placements processed successfully`, 
      warnings: warnings.length > 0 ? warnings : null 
    });

  } catch (err) {
    await connection.rollback();
    console.error("BULK SAVE ERROR:", err);
    return res.status(500).json({ message: 'Server error' });
  } finally {
    connection.release();
  }
};


// Get all placements for a specific Product (End User Dropdown API)
exports.getProductPlacements = async (req, res) => {
  try {
    const { productId } = req.params;

    const query = `
      SELECT 
        cpd.id AS placement_id,
        cpd.position_x_percent, cpd.position_y_percent, 
        cpd.width_percent, cpd.height_percent,
        lv.id AS logo_variant_id, lv.image_url AS logo_image, lv.color AS logo_color,
        l.title AS logo_name,
        pvi.id AS product_image_id, pvi.image_url AS product_base_image, pvi.view_type
      FROM custom_product_designs cpd
      JOIN logo_variants lv ON cpd.logo_variant_id = lv.id
      JOIN logos l ON lv.logo_id = l.id
      JOIN product_variant_images pvi ON cpd.product_variant_image_id = pvi.id
      JOIN product_variants pv ON cpd.product_variant_id = pv.id
      WHERE pv.product_id = ?
    `;

    const [results] = await db.query(query, [productId]);
    return res.json(results);
  } catch (err) {
    console.error("GET PLACEMENTS ERROR:", err);
    return res.status(500).json({ message: 'Server error' });
  }
};



// Quick update for coordinates only
exports.updatePlacementCoordinates = async (req, res) => {
  try {
    const { id } = req.params;
    const { x, y, w, h } = req.body;
    const currentUser = req.user;

    if (currentUser.role !== 'SUPER') {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    await db.query(
      `UPDATE custom_product_designs 
       SET position_x_percent = ?, position_y_percent = ?, width_percent = ?, height_percent = ?
       WHERE id = ?`,
      [x, y, w, h, id]
    );

    return res.json({ message: 'Coordinates updated' });
  } catch (err) {
    console.error("UPDATE COORDS ERROR:", err);
    return res.status(500).json({ message: 'Server error' });
  }
};


// Delete a specific placement
exports.deletePlacement = async (req, res) => {
  try {
    const { id } = req.params; 
    const currentUser = req.user;

    if (currentUser.role !== 'SUPER') {
      return res.status(403).json({ message: 'Only Super Users can delete placements' });
    }

    const [result] = await db.query(
      'DELETE FROM custom_product_designs WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Placement not found' });
    }

    return res.json({ message: 'Placement deleted successfully' });
  } catch (err) {
    console.error("DELETE PLACEMENT ERROR:", err);
    return res.status(500).json({ message: 'Server error' });
  }
};