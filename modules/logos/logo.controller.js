const db = require('../../config/db');

// Create Logo
exports.createLogo = async (req, res) => {
  try {
    const currentUser = req.user;
    let { title, org_id, is_public, color } = req.body;

    if (!title) 
      return res.status(400).json({ message: 'Title is required' });

    if (currentUser.role === 'ADMIN') {
      org_id = currentUser.org_id;
    } else if (currentUser.role === 'SUPER') {
      org_id = org_id || null;
    }

    is_public = is_public ?? 0;

    const [result] = await db.query(
      'INSERT INTO logos (org_id, title, is_public, created_by) VALUES (?, ?, ?, ?)',
      [org_id, title, is_public, currentUser.id]
    );

    const logoId = result.insertId;

    // If image was uploaded, auto-create the first variant
    if (req.file) {
      await db.query(
        'INSERT INTO logo_variants (logo_id, color, image_url) VALUES (?, ?, ?)',
        [logoId, color || 'Original', req.file.path]
      );
    }

    return res.status(201).json({
      message: 'Logo created successfully',
      logoId
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};


// Get All Logos (With Filter)
exports.getLogos = async (req, res) => {
  try {
    const currentUser = req.user;

    // MIN ya ANY_VALUE use karne se MySQL strict mode error nahi dega
    let query = `
      SELECT 
        l.*, 
        MIN(lv.id) as variant_id, 
        MIN(lv.image_url) as image_url, 
        MIN(lv.color) as variant_color
      FROM logos l
      LEFT JOIN logo_variants lv ON l.id = lv.logo_id
      WHERE l.deleted_at IS NULL
    `;
    
    let queryParams = [];

    if (currentUser.role === 'ADMIN') {
      query += ' AND (l.org_id = ? OR l.is_public = 1)';
      queryParams.push(currentUser.org_id);
    }

    query += ' GROUP BY l.id ORDER BY l.created_at DESC';

    const [logos] = await db.query(query, queryParams);
    return res.json(logos);

  } catch (err) {
    console.error("GET LOGOS ERROR:", err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Get Specific Logo by ID (With Variants)
exports.getLogoById = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = req.user;

    // 1. Logo ki main details fetch karo
    const [logo] = await db.query(
      `SELECT l.*, o.name as organization_name 
       FROM logos l 
       LEFT JOIN organizations o ON l.org_id = o.id 
       WHERE l.id = ? AND l.deleted_at IS NULL`,
      [id]
    );

    if (logo.length === 0) {
      return res.status(404).json({ message: 'Logo not found' });
    }

    // 2. Security Check: ADMIN sirf apne org ka logo dekh sake
    if (currentUser.role === 'ADMIN' && logo[0].org_id !== currentUser.org_id) {
      return res.status(403).json({ message: 'Not authorized to view this logo' });
    }

    // 3. Us logo ke saare variants fetch karo
    const [variants] = await db.query(
      'SELECT id, color, image_url, created_at FROM logo_variants WHERE logo_id = ?',
      [id]
    );

    // Data combine karke bhejo
    return res.json({
      ...logo[0],
      variants: variants
    });

  } catch (err) {
    console.error("GET LOGO BY ID ERROR:", err);
    return res.status(500).json({ message: 'Server error' });
  }
};


// Update Logo
exports.updateLogo = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = req.user;
    let { title, org_id, is_public } = req.body;

    const [existing] = await db.query(
      'SELECT * FROM logos WHERE id = ? AND deleted_at IS NULL',
      [id]
    );

    if (!existing.length)
      return res.status(404).json({ message: 'Logo not found' });

    if (
      currentUser.role === 'ADMIN' &&
      existing[0].org_id !== currentUser.org_id
    ) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    let finalOrgId = existing[0].org_id;

    if (currentUser.role === 'SUPER') {
      finalOrgId = org_id !== undefined ? org_id : existing[0].org_id;
    }

    await db.query(
      `UPDATE logos 
       SET title = ?, org_id = ?, is_public = ?
       WHERE id = ?`,
      [
        title || existing[0].title,
        finalOrgId,
        is_public ?? existing[0].is_public,
        id
      ]
    );

    return res.json({ message: 'Logo updated successfully' });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};


// Delete Logo (Soft Delete)
exports.deleteLogo = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = req.user;
    const [existing] = await db.query('SELECT org_id FROM logos WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!existing.length) return res.status(404).json({ message: 'Logo not found' });
    if (currentUser.role === 'ADMIN' && existing[0].org_id !== currentUser.org_id) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    await db.query('UPDATE logos SET deleted_at = NOW() WHERE id = ?', [id]);
    return res.json({ message: 'Logo deleted successfully' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};


// Add Logo Variant (Image Upload)
exports.addLogoVariant = async (req, res) => {
  try {
    const currentUser = req.user;
    const { logo_id, color } = req.body;
    if (!req.file) return res.status(400).json({ message: 'Logo image is required' });
    const [logo] = await db.query('SELECT org_id FROM logos WHERE id = ? AND deleted_at IS NULL', [logo_id]);
    if (!logo.length) return res.status(404).json({ message: 'Parent logo not found' });
    if (currentUser.role === 'ADMIN' && logo[0].org_id !== currentUser.org_id) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    const [result] = await db.query(
      'INSERT INTO logo_variants (logo_id, color, image_url) VALUES (?, ?, ?)',
      [logo_id, color, req.file.path]
    );
    return res.status(201).json({ message: 'Logo variant added', variantId: result.insertId });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};


// Delete Specific Logo Variant
exports.deleteLogoVariant = async (req, res) => {
  try {
    const { variantId } = req.params;
    const currentUser = req.user;

    // 1. Pehle check karo variant exist karta hai aur kis logo ka hai
    const [variant] = await db.query(
      'SELECT lv.*, l.org_id FROM logo_variants lv JOIN logos l ON lv.logo_id = l.id WHERE lv.id = ?',
      [variantId]
    );

    if (!variant.length) return res.status(404).json({ message: 'Variant not found' });

    // 2. Security Check
    if (currentUser.role === 'ADMIN' && variant[0].org_id !== currentUser.org_id) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // 3. Delete from DB
    await db.query('DELETE FROM logo_variants WHERE id = ?', [variantId]);

    return res.json({ message: 'Variant deleted successfully' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};