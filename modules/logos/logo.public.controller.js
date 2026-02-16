const db = require('../../config/db');

exports.getPublicLogos = async (req, res) => {
  try {
    const currentUser = req.user;

    let query = `
      SELECT id, title, org_id, created_at
      FROM logos
      WHERE deleted_at IS NULL
    `;

    const params = [];

    if (currentUser && currentUser.org_id) {
      query += `
        AND (
          org_id = ?
          OR org_id IS NULL
        )
      `;
      params.push(currentUser.org_id);
    } else {
      query += `
        AND org_id IS NULL
      `;
    }

    query += ` ORDER BY created_at DESC`;

    const [logos] = await db.query(query, params);

    // attach variants
    for (let logo of logos) {
      const [variants] = await db.query(
        `SELECT id, color, image_url 
         FROM logo_variants 
         WHERE logo_id = ?`,
        [logo.id]
      );

      logo.variants = variants;
    }

    return res.json(logos);

  } catch (err) {
    console.error("PUBLIC LOGO ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
};