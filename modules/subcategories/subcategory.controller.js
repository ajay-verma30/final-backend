const db = require('../../config/db');
const slugify = require('slugify'); 

// Create subcategory
exports.createSubCategory = async (req, res) => {
  try {
    const { category_id, name, is_active = 1 } = req.body;

    if (!category_id || !name) {
      return res.status(400).json({ message: 'Category ID and name are required' });
    }

    // 🔹 Check category exists
    const [category] = await db.query(
      'SELECT id FROM categories WHERE id = ?',
      [category_id]
    );

    if (!category.length) {
      return res.status(404).json({ message: 'Category not found' });
    }

    const slug = slugify(name, { lower: true, strict: true });

    await db.query(
      `INSERT INTO subcategories 
       (category_id, name, slug, is_active)
       VALUES (?, ?, ?, ?)`,
      [category_id, name, slug, is_active]
    );

    return res.status(201).json({
      message: 'Subcategory created successfully'
    });

  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Subcategory already exists in this category' });
    }

    console.error("CREATE SUBCATEGORY ERROR:", err);
    return res.status(500).json({ message: 'Server error' });
  }
};



// 1. Get ALL Subcategories with Category Name (For Table/List View)
exports.getSubCategories = async (req, res) => {
  try {
    const currentUser = req.user;

    // JOIN use karke categories table se 'name' nikal rahe hain
    let query = `
      SELECT 
        s.id, 
        s.name, 
        s.category_id, 
        c.name AS category_name, 
        s.is_active, 
        s.created_at
      FROM subcategories s
      INNER JOIN categories c ON s.category_id = c.id
      WHERE 1=1
    `;
    
    let params = [];

    // Role-based filtering (Admin ke liye uski org ka data)
    if (currentUser.role === 'ADMIN') {
      query += ` AND (c.org_id = ? OR c.org_id IS NULL)`;
      params.push(currentUser.org_id);
    }

    const [subcategories] = await db.query(query, params);

    return res.json({ data: subcategories });
  } catch (err) {
    console.error("GET SUBCATEGORIES ERROR:", err);
    return res.status(500).json({ message: 'Server error' });
  }
};



// Get subcategories by Category ID (Dropdown ke liye)
exports.getSubcategoriesByCategory = async (req, res) => {
  const { categoryId } = req.params;
  try {
    const [subcategories] = await db.query(
      'SELECT id, name FROM subcategories WHERE category_id = ? AND is_active = 1',
      [categoryId]
    );
    // Frontend res.data.data expect kar raha hai, toh usi format mein bhejo
    return res.json({ data: subcategories });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};


exports.deleteSubCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const [subcategory] = await db.query(
      'SELECT id FROM subcategories WHERE id = ?',
      [id]
    );

    if (!subcategory.length) {
      return res.status(404).json({ message: 'Subcategory not found' });
    }

    // 🔹 Check product dependency
    const [products] = await db.query(
      'SELECT id FROM products WHERE subcategory_id = ? LIMIT 1',
      [id]
    );

    if (products.length > 0) {
      return res.status(400).json({
        message: 'Cannot delete subcategory. Products are linked to it.'
      });
    }

    await db.query(
      'DELETE FROM subcategories WHERE id = ?',
      [id]
    );

    return res.json({
      message: 'Subcategory deleted successfully'
    });

  } catch (err) {
    console.error("DELETE SUBCATEGORY ERROR:", err);
    return res.status(500).json({ message: 'Server error' });
  }
};
