const db = require('../../config/db');

// 1. Create Customization
exports.createCustomization = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const currentUser = req.user;
    let {
  name,
  product_id,
  product_variant_image_id,
  logo_variant_id,
  pos_x,
  pos_y,
  logo_width,
  logo_height,
  org_id
} = req.body;

if (!name || !product_id || !product_variant_image_id || !logo_variant_id || pos_x === undefined || pos_y === undefined) {
  return res.status(400).json({ message: 'Missing required fields for customization' });
}

    // RBAC: Set org_id based on role
    if (currentUser.role === 'ADMIN') {
      org_id = currentUser.org_id;
    } else if (currentUser.role === 'SUPER') {
      org_id = org_id || null;
    }

    await connection.beginTransaction();

   const [result] = await connection.query(
  `INSERT INTO product_customizations 
  (name, product_id, product_variant_image_id, logo_variant_id, pos_x, pos_y, logo_width, logo_height, org_id, created_by)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [
    req.body.name,
    product_id,
    product_variant_image_id,
    logo_variant_id,
    pos_x,
    pos_y,
    logo_width || 0,
    logo_height || null,
    org_id,
    currentUser.id
  ]
);

    await connection.commit();
    return res.status(201).json({
      message: 'Product customization saved successfully',
      customizationId: result.insertId
    });

  } catch (err) {
    await connection.rollback();
    console.error("CREATE CUSTOMIZATION ERROR:", err);
    return res.status(500).json({ message: 'Server error' });
  } finally {
    connection.release();
  }
};

// 4. Get Customization(s)
exports.getCustomizations = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const currentUser = req.user;
    const { id } = req.params; // optional (for single record)
    const { org_id } = req.query; // optional (for SUPER filtering)

    let query = `
      SELECT *
      FROM product_customizations
      WHERE deleted_at IS NULL
    `;

    let params = [];

    // If fetching single customization
    if (id) {
      query += ` AND id = ?`;
      params.push(id);
    }

    // RBAC logic
    if (currentUser.role === 'ADMIN') {
      query += ` AND org_id = ?`;
      params.push(currentUser.org_id);
    } else if (currentUser.role === 'SUPER' && org_id) {
      query += ` AND org_id = ?`;
      params.push(org_id);
    }

    const [rows] = await connection.query(query, params);

    if (id && !rows.length) {
      return res.status(404).json({ message: 'Customization not found' });
    }

    return res.json({
      message: 'Customizations fetched successfully',
      data: id ? rows[0] : rows
    });

  } catch (err) {
    console.error("GET CUSTOMIZATION ERROR:", err);
    return res.status(500).json({ message: 'Server error' });
  } finally {
    connection.release();
  }
};

// 2. Update Customization
exports.updateCustomization = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { id } = req.params;
    const currentUser = req.user;
    const { pos_x, pos_y, logo_width, logo_height } = req.body;

    await connection.beginTransaction();

    // 1️⃣ Check existence and authorization
    const [existing] = await connection.query(
      'SELECT org_id FROM product_customizations WHERE id = ? AND deleted_at IS NULL',
      [id]
    );

    if (!existing.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Customization not found' });
    }

    // RBAC logic
    if (currentUser.role === 'ADMIN' && existing[0].org_id !== currentUser.org_id) {
      await connection.rollback();
      return res.status(403).json({ message: 'Not authorized to update this customization' });
    }

    // 2️⃣ Update logic
    await connection.query(
      `UPDATE product_customizations SET 
        pos_x = COALESCE(?, pos_x),
        pos_y = COALESCE(?, pos_y),
        logo_width = COALESCE(?, logo_width),
        logo_height = COALESCE(?, logo_height),
        updated_at = NOW()
      WHERE id = ?`,
      [pos_x, pos_y, logo_width, logo_height, id]
    );

    await connection.commit();
    return res.json({ message: 'Customization updated successfully' });

  } catch (err) {
    await connection.rollback();
    console.error("UPDATE CUSTOMIZATION ERROR:", err);
    return res.status(500).json({ message: 'Server error' });
  } finally {
    connection.release();
  }
};

// 3. Delete Customization (Soft Delete)
exports.deleteCustomization = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { id } = req.params;
    const currentUser = req.user;

    await connection.beginTransaction();

    const [existing] = await connection.query(
      'SELECT org_id FROM product_customizations WHERE id = ? AND deleted_at IS NULL',
      [id]
    );

    if (!existing.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Customization not found' });
    }

    // RBAC logic
    if (currentUser.role === 'ADMIN' && existing[0].org_id !== currentUser.org_id) {
      await connection.rollback();
      return res.status(403).json({ message: 'Not authorized' });
    }

    await connection.query(
      'UPDATE product_customizations SET deleted_at = NOW() WHERE id = ?',
      [id]
    );

    await connection.commit();
    return res.json({ message: 'Customization deleted successfully' });

  } catch (err) {
    await connection.rollback();
    console.error("DELETE CUSTOMIZATION ERROR:", err);
    return res.status(500).json({ message: 'Server error' });
  } finally {
    connection.release();
  }
};