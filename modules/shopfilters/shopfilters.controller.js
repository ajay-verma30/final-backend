const db = require('../../config/db');

exports.getShopFilters = async (req, res) => {
  try {
    const [categories] = await db.query(`
      SELECT 
        id,
        name,
        slug,
        parent_segment,
        gender,
        supports_gender
      FROM categories
      WHERE is_active = 1
      ORDER BY parent_segment, name
    `);

    const [subcategories] = await db.query(`
      SELECT 
        s.id,
        s.name,
        s.slug,
        s.category_id,
        c.parent_segment,
        c.gender,
        c.supports_gender
      FROM subcategories s
      INNER JOIN categories c ON s.category_id = c.id
      WHERE s.is_active = 1 AND c.is_active = 1
      ORDER BY s.name
    `);

    return res.json({
      data: {
        categories,
        subcategories,
      }
    });

  } catch (err) {
    console.error("GET SHOP FILTERS ERROR:", err);
    return res.status(500).json({ message: 'Server error' });
  }
};