const db = require('../../config/db');
const slugify = require('slugify'); 

// Create subcategory
exports.createSubcategory = async (req, res) => {
  try {
    const { name, category_id, is_active = 1 } = req.body;

    if (!name || !category_id) {
        return res.status(400).json({ message: 'Name and category_id are required' });
    }

    const [categories] = await db.query(
        'SELECT id FROM categories WHERE id = ? AND is_active = 1', 
        [category_id]
    );
    
    if (!categories.length) {
        return res.status(400).json({ message: 'Invalid or inactive category_id' });
    }

    const slug = slugify(name, { lower: true, strict: true });
    const [result] = await db.query(
      'INSERT INTO subcategories (name, slug, category_id, is_active) VALUES (?, ?, ?, ?)',
      [name, slug, category_id, is_active]
    );

    return res.status(201).json({ 
      message: 'Subcategory created', 
      subcategoryId: result.insertId,
      slug: slug 
    });
    
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ message: 'Subcategory with this name already exists in this category' });
    }
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};


// Get subcategories
exports.getSubcategories = async (req, res) => {
  try {
    const [subcategories] = await db.query('SELECT * FROM subcategories WHERE is_active = 1');
    return res.json(subcategories);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};