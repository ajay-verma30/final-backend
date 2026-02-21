const db = require('../../config/db');
const slugify = require('slugify');

exports.createCategory = async (req, res) => {
  try {
    // parent_id hata diya, parent_segment (Enum) add kiya
    const { name, parent_segment, org_id = null, supports_gender = 0, is_active = 1 } = req.body;

    if (!name || !parent_segment) {
      return res.status(400).json({ message: 'Category name and segment (MENS, WOMENS, etc.) are required' });
    }

    const slug = slugify(name, { lower: true, strict: true });

    // Query update: parent_id ki jagah parent_segment aur org_id
    const [result] = await db.query(
      `INSERT INTO categories 
       (name, slug, parent_segment, org_id, supports_gender, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, slug, parent_segment, org_id, supports_gender, is_active]
    );

    return res.status(201).json({
      message: 'Category created successfully',
      categoryId: result.insertId,
      slug
    });

  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Category slug already exists' });
    }
    console.error("CREATE CATEGORY ERROR:", err);
    return res.status(500).json({ message: 'Server error' });
  }
};



exports.getCategories = async (req, res) => {
  try {
    const currentUser = req.user;

    // Hum LEFT JOIN use karenge taaki assets milein toh theek, warna category toh aaye hi
    // GROUP_CONCAT ya JSON_ARRAYAGG (MySQL 5.7+) use karke assets ko list mein le sakte hain
    let query = `
      SELECT 
        c.id, 
        c.name, 
        c.org_id, 
        c.is_active, 
        c.supports_gender, 
        c.created_at,
        COALESCE(
          (SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', ca.id,
              'asset_type', ca.asset_type,
              'target_group', ca.target_group,
              'image_url', ca.image_url
            )
          ) FROM category_assets ca WHERE ca.category_id = c.id),
          JSON_ARRAY()
        ) AS assets
      FROM categories c
      WHERE 1=1 
    `;

    let params = [];

    if (currentUser.role === 'ADMIN') {
      query += ` AND (c.org_id = ? OR c.org_id IS NULL)`;
      params.push(currentUser.org_id);
    }

    const [categories] = await db.query(query, params);

    return res.json({ data: categories });

  } catch (err) {
    console.error("GET CATEGORY ERROR:", err);
    return res.status(500).json({ message: 'Server error' });
  }
};


exports.uploadCategorySizeChart = async (req, res) => {
  try {
    const { category_id, target_group = 'UNISEX' } = req.body;

    if (!category_id || !req.file) {
      return res.status(400).json({ message: 'Category ID and image required' });
    }

    await db.query(
      `INSERT INTO category_assets
       (category_id, asset_type, target_group, image_url, cloudinary_public_id)
       VALUES (?, 'SIZE_CHART', ?, ?, ?)`,
      [
        category_id,
        target_group,
        req.file.path,
        req.file.filename || null
      ]
    );

    return res.status(201).json({
      message: 'Size chart uploaded successfully'
    });

  } catch (err) {
    console.error("SIZE CHART ERROR:", err);
    return res.status(500).json({ message: 'Server error' });
  }
};


exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    // 🔹 Check exists
    const [category] = await db.query(
      'SELECT id FROM categories WHERE id = ?',
      [id]
    );

    if (!category.length) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // 🔹 Check if any product linked
    const [products] = await db.query(
      'SELECT id FROM products WHERE category_id = ? LIMIT 1',
      [id]
    );

    if (products.length > 0) {
      return res.status(400).json({
        message: 'Cannot delete category. Products are linked to it.'
      });
    }

    // 🔹 Safe to delete
    await db.query(
      'DELETE FROM categories WHERE id = ?',
      [id]
    );

    return res.json({
      message: 'Category deleted successfully'
    });

  } catch (err) {
    console.error("DELETE CATEGORY ERROR:", err);
    return res.status(500).json({ message: 'Server error' });
  }
};