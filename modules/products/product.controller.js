const db = require('../../config/db');
const slugify = require('slugify');
const { canManageProduct } = require('../../utils/productPermission');

//Create products
exports.createProduct = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const currentUser = req.user;     
    let {
      name,
      description,
      short_description,
      gender,
      base_price,
      has_variants,
      is_active,
      is_featured,
      meta_title,
      meta_description,
      org_id, 
      category_id,
      subcategory_id,
      is_public 
    } = req.body;
    if (!name || !category_id || !subcategory_id) {
      return res.status(400).json({ message: 'Name, category_id, and subcategory_id are required' });
    }
    if (currentUser.role === 'ADMIN') {
      org_id = currentUser.org_id; 
    } else if (currentUser.role === 'SUPER') {
      org_id = org_id || null;
    }
    is_public = is_public ?? 0;
    const slug = slugify(name, { lower: true, strict: true });
    await connection.beginTransaction();
    const [subCheck] = await connection.query(
      'SELECT id FROM subcategories WHERE id = ? AND category_id = ? AND is_active = 1',
      [subcategory_id, category_id]
    );
    if (!subCheck.length) {
      await connection.rollback();
      return res.status(400).json({ message: 'Invalid subcategory mapping or category mismatch' });
    }
    const [catCheck] = await connection.query(
      'SELECT supports_gender FROM categories WHERE id = ?',
      [category_id]
    );
    if (catCheck.length > 0 && catCheck[0].supports_gender && !gender) {
      await connection.rollback();
      return res.status(400).json({ message: 'Gender is required for this category' });
    }
    const [result] = await connection.query(
      `INSERT INTO products 
      (org_id, category_id, subcategory_id, name, slug, description, short_description,
       gender, base_price, has_variants, is_active, is_featured, meta_title, meta_description, created_by, is_public)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        org_id,            
        category_id,
        subcategory_id,
        name,
        slug,
        description || null,
        short_description || null,
        gender || null,
        base_price || 0.00,
        has_variants ?? 1,
        is_active ?? 1,
        is_featured ?? 0,
        meta_title || null,
        meta_description || null,
        currentUser.id,
        is_public
      ]
    );
    await connection.commit();
    return res.status(201).json({
      message: 'Product created successfully',
      productId: result.insertId,
      slug: slug,
      is_public: is_public
    });
  } catch (err) {
    await connection.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Product slug already exists' });
    }
    console.error("CREATE PRODUCT ERROR:", err);
    return res.status(500).json({ message: 'Server error' });
  } finally {
    connection.release();
  }
};

// Get all products with Category and Subcategory Names
exports.getProducts = async (req, res) => {
  try {
    const currentUser = req.user;
    let query = `
      SELECT 
        p.*, 
        c.name AS category_name, 
        s.name AS subcategory_name,
        u.first_name AS creator_name
      FROM products p
      INNER JOIN categories c ON p.category_id = c.id
      INNER JOIN subcategories s ON p.subcategory_id = s.id
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.deleted_at IS NULL
    `;

    const queryParams = [];
    if (currentUser) {
      if (currentUser.role === 'ADMIN') {
        query += ` AND (p.org_id = ? OR p.is_public = 1)`;
        queryParams.push(currentUser.org_id);
      }
    } else {
      query += ` AND p.is_public = 1`;
    }

    query += ` ORDER BY p.created_at DESC`;

    const [products] = await db.query(query, queryParams);

    return res.json(products);
  } catch (err) {
    console.error("GET PRODUCTS ERROR:", err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Update Product
exports.updateProductWithVariants = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const currentUser = req.user;
    const { id } = req.params;
    let {
      name,
      slug,
      description,
      short_description,
      gender,
      base_price,
      has_variants,
      is_active,
      is_featured,
      meta_title,
      meta_description,
      org_id, 
      category_id,
      subcategory_id,
      is_public, 
      variants 
    } = req.body;

    const [products] = await connection.query(
      'SELECT * FROM products WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    if (!products.length) return res.status(404).json({ message: 'Product not found' });

    const product = products[0];

    if (currentUser.role === 'ADMIN' && product.org_id !== currentUser.org_id) {
      return res.status(403).json({ message: 'Not authorized to update this product' });
    }

    let finalOrgId = product.org_id;
    if (currentUser.role === 'SUPER') finalOrgId = org_id ?? product.org_id;
    else finalOrgId = currentUser.org_id;

    if (name && !slug) slug = slugify(name, { lower: true, strict: true });
    if (slug && slug !== product.slug) {
      const [existing] = await connection.query(
        'SELECT id FROM products WHERE slug = ? AND id != ? AND deleted_at IS NULL',
        [slug, id]
      );
      if (existing.length) return res.status(400).json({ message: 'Slug already exists' });
    }

    const finalCategoryId = category_id || product.category_id;
    const finalSubcategoryId = subcategory_id || product.subcategory_id;
    const [subCheck] = await connection.query(
      'SELECT id FROM subcategories WHERE id = ? AND category_id = ? AND is_active = 1',
      [finalSubcategoryId, finalCategoryId]
    );
    if (!subCheck.length) return res.status(400).json({ message: 'Invalid subcategory mapping' });

    const [catCheck] = await connection.query(
      'SELECT supports_gender FROM categories WHERE id = ?',
      [finalCategoryId]
    );
    const category = catCheck[0];
    if (category.supports_gender && !gender && !product.gender) {
      return res.status(400).json({ message: 'Gender required for this category' });
    }
    if (!category.supports_gender) gender = null;

    await connection.beginTransaction();


    await connection.query(
      `UPDATE products SET 
        name = ?, slug = ?, description = ?, short_description = ?, gender = ?, 
        base_price = ?, has_variants = ?, is_active = ?, is_featured = ?, 
        meta_title = ?, meta_description = ?, category_id = ?, subcategory_id = ?, 
        org_id = ?, is_public = ?
       WHERE id = ?`,
      [
        name || product.name,
        slug || product.slug,
        description ?? product.description,
        short_description ?? product.short_description,
        gender ?? (category.supports_gender ? product.gender : null),
        base_price ?? product.base_price,
        has_variants ?? product.has_variants,
        is_active ?? product.is_active,
        is_featured ?? product.is_featured,
        meta_title ?? product.meta_title,
        meta_description ?? product.meta_description,
        finalCategoryId,
        finalSubcategoryId,
        finalOrgId,
        is_public ?? product.is_public,
        id
      ]
    );

    if (variants && Array.isArray(variants)) {
      for (let v of variants) {
        if (v.id) {
          const [existingVariant] = await connection.query(
            'SELECT v.id, v.product_id FROM product_variants v WHERE v.id = ? AND v.product_id = ?',
            [v.id, id]
          );
          if (existingVariant.length) {
            await connection.query(
              `UPDATE product_variants SET color = ?, size = ?, sku = ?, price = ?, stock_quantity = ?, is_active = ?
               WHERE id = ?`,
              [
                v.color.toUpperCase(),
                v.size.toUpperCase(),
                v.sku.trim(),
                v.price,
                v.stock_quantity ?? 0,
                v.is_active ?? 1,
                v.id
              ]
            );
            if (v.imagesToDelete && v.imagesToDelete.length) {
              await connection.query(
                'DELETE FROM product_variant_images WHERE id IN (?) AND product_variant_id = ?',
                [v.imagesToDelete, v.id]
              );
            }
          }
        } else {
          const [insertResult] = await connection.query(
            `INSERT INTO product_variants (product_id, color, size, sku, price, stock_quantity, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              v.color.toUpperCase(),
              v.size.toUpperCase(),
              v.sku.trim(),
              v.price,
              v.stock_quantity ?? 0,
              v.is_active ?? 1
            ]
          );
          v.id = insertResult.insertId;
        }
      }
    }

    await connection.commit();

    return res.json({ message: 'Product and variants updated successfully' });

  } catch (err) {
    await connection.rollback();
    console.error("UPDATE PRODUCT WITH VARIANTS ERROR:", err);
    return res.status(500).json({ message: 'Server error' });
  } finally {
    connection.release();
  }
};

// Get a specific product with variants and their images
exports.getProductById = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { id } = req.params;
    const currentUser = req.user;

    const [products] = await connection.query(
      `SELECT 
         p.*, 
         c.name AS category_name, 
         s.name AS subcategory_name,
         u.first_name AS creator_name
       FROM products p
       INNER JOIN categories c ON p.category_id = c.id
       INNER JOIN subcategories s ON p.subcategory_id = s.id
       LEFT JOIN users u ON p.created_by = u.id
       WHERE p.id = ? AND p.deleted_at IS NULL`,
      [id]
    );

    if (!products.length) return res.status(404).json({ message: 'Product not found' });

    const product = products[0];
    if (currentUser) {
      if (currentUser.role === 'ADMIN' && product.org_id !== currentUser.org_id && product.is_public !== 1) {
        return res.status(403).json({ message: 'Not authorized to view this product' });
      }
    } else {
      if (product.is_public !== 1) {
        return res.status(403).json({ message: 'Not authorized to view this product' });
      }
    }

    const [variants] = await connection.query(
      `SELECT * FROM product_variants WHERE product_id = ? AND is_active = 1`,
      [id]
    );

    for (let variant of variants) {
      const [images] = await connection.query(
        `SELECT id, image_url, view_type FROM product_variant_images WHERE product_variant_id = ?`,
        [variant.id]
      );
      variant.images = images;
    }

    product.variants = variants;

    return res.json({ product });
  } catch (err) {
    console.error("GET PRODUCT BY ID ERROR:", err);
    return res.status(500).json({ message: 'Server error' });
  } finally {
    connection.release();
  }
};

// Delete Product (soft delete)
exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = req.user;

    // 1. Pehle product ki org_id check karo
    const [products] = await db.query('SELECT org_id FROM products WHERE id = ? AND deleted_at IS NULL', [id]);
    
    if (!products.length) return res.status(404).json({ message: 'Product not found' });

    // 2. Authorization Check
    if (currentUser.role === 'ADMIN' && products[0].org_id !== currentUser.org_id) {
      return res.status(403).json({ message: 'Not authorized to delete this organization\'s product' });
    }

    // 3. Soft Delete
    await db.query('UPDATE products SET deleted_at = NOW() WHERE id = ?', [id]);
    
    return res.json({ message: 'Product deleted successfully' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Get all products
exports.getProducts = async (req, res) => {
  try {
    const [products] = await db.query(`
      SELECT 
        p.*, c.name AS category_name, s.name AS subcategory_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN subcategories s ON p.subcategory_id = s.id
      WHERE p.deleted_at IS NULL
    `);
    return res.json(products);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Add product variant
exports.addVariant = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const currentUser = req.user;
    const { 
      product_id, 
      color, 
      size, 
      sku, 
      price, 
      stock_quantity, 
      is_active 
    } = req.body;

    if (!product_id || !color || !size || !sku || !price) {
      return res.status(400).json({ message: 'Product ID, color, size, sku, and price are required' });
    }

    const [products] = await connection.query(
      'SELECT id, org_id FROM products WHERE id = ? AND deleted_at IS NULL', 
      [product_id]
    );

    if (!products.length) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const product = products[0];

    if (currentUser.role === 'ADMIN' && product.org_id !== currentUser.org_id) {
      return res.status(403).json({ message: 'Not authorized to add variants to this organization\'s product' });
    }

    const [result] = await connection.query(
      `INSERT INTO product_variants 
      (product_id, color, size, sku, price, stock_quantity, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        product_id, 
        color.toUpperCase(), 
        size.toUpperCase(), 
        sku.trim(), 
        price, 
        stock_quantity || 0, 
        is_active ?? 1
      ]
    );

    return res.status(201).json({ 
      message: 'Variant added successfully', 
      variantId: result.insertId 
    });

  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      if (err.sqlMessage.includes('uniq_variant_sku')) {
        return res.status(400).json({ message: 'SKU already exists. Please use a unique SKU.' });
      }
      if (err.sqlMessage.includes('uniq_product_color_size')) {
        return res.status(400).json({ message: 'This color and size combination already exists for this product.' });
      }
    }
    
    console.error("ADD VARIANT ERROR:", err);
    return res.status(500).json({ message: 'Server error' });
  } finally {
    connection.release();
  }
};

// Add price tier
exports.addVariantPriceTier = async (req, res) => {
  try {
    const { product_variant_id, min_quantity, unit_price } = req.body;
    const currentUser = req.user;

    // 1. Join karke check karo ki variant jis product ka hai, uski org_id kya hai
    const [variantData] = await db.query(
      `SELECT p.org_id FROM product_variants v 
       JOIN products p ON v.product_id = p.id 
       WHERE v.id = ? AND p.deleted_at IS NULL`,
      [product_variant_id]
    );

    if (!variantData.length) return res.status(404).json({ message: 'Variant or Product not found' });

    // 2. Authorization Check
    if (currentUser.role === 'ADMIN' && variantData[0].org_id !== currentUser.org_id) {
      return res.status(403).json({ message: 'Not authorized to manage pricing for this organization' });
    }

    const [result] = await db.query(
      `INSERT INTO product_variant_price_tiers (product_variant_id, min_quantity, unit_price) VALUES (?, ?, ?)`,
      [product_variant_id, min_quantity, unit_price]
    );
    
    return res.status(201).json({ message: 'Price tier added', id: result.insertId });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Add product variant images (transaction-safe)
exports.addVariantImage = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const currentUser = req.user;
    const { product_variant_id, view_type } = req.body;
    if (!req.files || !req.files.length)
      return res.status(400).json({ message: 'Images required' });
    const [variantData] = await connection.query(
      `SELECT v.id, v.product_id, p.org_id, c.name AS category_name
       FROM product_variants v
       JOIN products p ON v.product_id = p.id
       JOIN categories c ON p.category_id = c.id
       WHERE v.id = ? AND p.deleted_at IS NULL`,
      [product_variant_id]
    );
    if (!variantData.length)
      return res.status(404).json({ message: 'Variant or Product not found' });
    const variant = variantData[0];
    if (currentUser.role === 'ADMIN' && variant.org_id !== currentUser.org_id) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    const categoryViewsMap = {
      CLOTHES: ['FRONT', 'BACK', 'SIDE'],
      STATIONERY: ['SINGLE'],
      MUGS: ['FRONT', 'ANGLE'],
      BAG: ['FRONT', 'BACK', 'SIDE'],
      DEFAULT: ['FRONT']
    };
    const categoryKey = variant.category_name.toUpperCase();
    const allowedViews = categoryViewsMap[categoryKey] || categoryViewsMap.DEFAULT;
    const viewUpper = view_type.toUpperCase();
    if (!allowedViews.includes(viewUpper)) {
      return res.status(400).json({ 
        message: `Invalid view_type for category ${variant.category_name}. Allowed: ${allowedViews.join(', ')}` 
      });
    }
    await connection.beginTransaction();
    const results = [];
    for (const file of req.files) {
      const image_url = file.path;
      const [dbResult] = await connection.query(
        `INSERT INTO product_variant_images (product_variant_id, image_url, view_type)
         VALUES (?, ?, ?)`,
        [product_variant_id, image_url, viewUpper]
      );
      results.push(dbResult.insertId);
    }

    await connection.commit();

    return res.status(201).json({
      message: 'Images uploaded successfully',
      ids: results
    });

  } catch (err) {
    await connection.rollback();
    console.error("ADD VARIANT IMAGE ERROR:", err);
    return res.status(500).json({ message: 'Server error' });
  } finally {
    connection.release();
  }
};