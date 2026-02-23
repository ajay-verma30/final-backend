const db = require('../../config/db');

// ── Create Customization ──────────────────────────────────────────────────────
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
      rotation = 0,   // NEW: default 0 degrees
      org_id
    } = req.body;

    if (!name || !product_id || !product_variant_image_id || !logo_variant_id || pos_x === undefined || pos_y === undefined) {
      return res.status(400).json({ message: 'Missing required fields for customization' });
    }

    // Validate rotation is a valid number
    const parsedRotation = parseFloat(rotation);
    if (isNaN(parsedRotation)) {
      return res.status(400).json({ message: 'rotation must be a valid number (degrees)' });
    }

    // Normalize rotation to -180 to 180 range (optional but clean)
    const normalizedRotation = ((parsedRotation % 360) + 360) % 360;
    // Convert to -180..180
    const finalRotation = normalizedRotation > 180 ? normalizedRotation - 360 : normalizedRotation;

    // RBAC: Set org_id based on role
    if (currentUser.role === 'ADMIN') {
      org_id = currentUser.org_id;
    } else if (currentUser.role === 'SUPER') {
      org_id = org_id || null;
    }

    await connection.beginTransaction();

    const [result] = await connection.query(
      `INSERT INTO product_customizations 
       (name, product_id, product_variant_image_id, logo_variant_id, pos_x, pos_y, logo_width, logo_height, rotation, org_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        product_id,
        product_variant_image_id,
        logo_variant_id,
        pos_x,
        pos_y,
        logo_width || 0,
        logo_height || null,
        finalRotation,
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


// ── Get Customization(s) ──────────────────────────────────────────────────────
exports.getCustomizations = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const currentUser = req.user;
    const { id } = req.params;
    const { org_id } = req.query;

    let query = `
      SELECT 
        id, name, product_id, product_variant_image_id,
        logo_variant_id, pos_x, pos_y, logo_width, logo_height,
        rotation,
        org_id, created_by, created_at, updated_at
      FROM product_customizations
      WHERE deleted_at IS NULL
    `;

    let params = [];

    if (id) {
      query += ` AND id = ?`;
      params.push(id);
    }

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


// ── Update Customization ──────────────────────────────────────────────────────
exports.updateCustomization = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { id } = req.params;
    const currentUser = req.user;
    const { pos_x, pos_y, logo_width, logo_height, rotation } = req.body;

    // Validate rotation if provided
    let finalRotation = undefined;
    if (rotation !== undefined) {
      const parsed = parseFloat(rotation);
      if (isNaN(parsed)) {
        return res.status(400).json({ message: 'rotation must be a valid number (degrees)' });
      }
      const normalized = ((parsed % 360) + 360) % 360;
      finalRotation = normalized > 180 ? normalized - 360 : normalized;
    }

    await connection.beginTransaction();

    const [existing] = await connection.query(
      'SELECT org_id FROM product_customizations WHERE id = ? AND deleted_at IS NULL',
      [id]
    );

    if (!existing.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Customization not found' });
    }

    if (currentUser.role === 'ADMIN' && existing[0].org_id !== currentUser.org_id) {
      await connection.rollback();
      return res.status(403).json({ message: 'Not authorized to update this customization' });
    }

    await connection.query(
      `UPDATE product_customizations SET 
        pos_x      = COALESCE(?, pos_x),
        pos_y      = COALESCE(?, pos_y),
        logo_width = COALESCE(?, logo_width),
        logo_height= COALESCE(?, logo_height),
        rotation   = COALESCE(?, rotation),
        updated_at = NOW()
      WHERE id = ?`,
      [pos_x, pos_y, logo_width, logo_height, finalRotation ?? null, id]
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


// ── Delete Customization (Soft Delete) ────────────────────────────────────────
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