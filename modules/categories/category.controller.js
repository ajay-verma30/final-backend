const db = require('../../config/db');
const slugify = require('slugify'); 

// Create category
exports.createCategory = async (req, res) => {
  try {
    const { name, parent_id = null, supports_gender = 0, is_active = 1 } = req.body;

    if (!name) return res.status(400).json({ message: 'Name is required' });

    const slug = slugify(name, { lower: true, strict: true });

    const [result] = await db.query(
      'INSERT INTO categories (name, slug, parent_id, supports_gender, is_active) VALUES (?, ?, ?, ?, ?)',
      [name, slug, parent_id, supports_gender, is_active]
    );

    return res.status(201).json({ 
      message: 'Category created', 
      categoryId: result.insertId,
      slug: slug 
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ message: 'Category name or slug already exists' });
    }
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};



// Get all categories
exports.getCategories = async (req, res) => {
  try {
    const [categories] = await db.query('SELECT * FROM categories WHERE is_active = 1');
    return res.json(categories);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};