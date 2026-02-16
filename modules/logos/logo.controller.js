const db = require('../../config/db');

// Create Logo
exports.createLogo = async (req, res) => {
  try {
    const currentUser = req.user;
    let { title, org_id, is_public } = req.body;

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

    return res.status(201).json({
      message: 'Logo entry created',
      logoId: result.insertId
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

    let query = 'SELECT * FROM logos WHERE deleted_at IS NULL';
    let queryParams = [];

    if (currentUser.role === 'ADMIN') {
      query += ' AND org_id = ?';
      queryParams.push(currentUser.org_id);
    }

    query += ' ORDER BY created_at DESC';

    const [logos] = await db.query(query, queryParams);

    return res.json(logos);

  } catch (err) {
    console.error(err);
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