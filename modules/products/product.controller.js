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
        p.id, 
        p.name AS title, 
        p.slug, 
        p.gender, 
        p.is_active,
        p.is_public,
        p.created_at, 
        p.updated_at,
        o.name AS organization_name,
        c.name AS category_name, 
        s.name AS subcategory_name,
        CONCAT(u.first_name, ' ', u.last_name) AS creator_name
      FROM products p
      LEFT JOIN organizations o ON p.org_id = o.id
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

    return res.json({
      message: "Products fetched successfully",
      data: products
    });

  } catch (err) {
    console.error("GET PRODUCTS ERROR:", err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Get a specific product with variants and their images
exports.getProductById = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { id } = req.params;
    const currentUser = req.user;

    // 1️⃣ Get Product
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
       WHERE p.id = ? 
       AND p.deleted_at IS NULL`,
      [id]
    );

    if (!products.length) {
      return res.status(404).json({ message: "Product not found" });
    }

    const product = products[0];

    // 2️⃣ Authorization
    if (currentUser) {
      if (
        currentUser.role === "ADMIN" &&
        product.org_id !== currentUser.org_id &&
        product.is_public !== 1
      ) {
        return res.status(403).json({ message: "Not authorized to view this product" });
      }
    } else {
      if (product.is_public !== 1) {
        return res.status(403).json({ message: "Not authorized to view this product" });
      }
    }

    // 3️⃣ Get Variants (IMPORTANT FIX HERE)
    const [variants] = await connection.query(
      `SELECT * FROM product_variants 
       WHERE product_id = ? 
       AND deleted_at IS NULL 
       AND is_active = 1`,
      [id]
    );

    // 4️⃣ Get Images + Price Tiers for each variant
    for (let variant of variants) {

      // Images (FIXED)
      const [images] = await connection.query(
        `SELECT id, image_url, view_type 
         FROM product_variant_images 
         WHERE product_variant_id = ? 
         AND deleted_at IS NULL`,
        [variant.id]
      );

      // Price Tiers (Added Properly)
      const [priceTiers] = await connection.query(
        `SELECT id, min_quantity, unit_price 
         FROM product_variant_price_tiers
         WHERE product_variant_id = ?
         AND deleted_at IS NULL`,
        [variant.id]
      );

      variant.images = images;
      variant.price_tiers = priceTiers;
    }

    product.variants = variants;

    return res.json({ product });

  } catch (err) {
    console.error("GET PRODUCT BY ID ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  } finally {
    connection.release();
  }
};

//update products
exports.updateProduct = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const { id } = req.params;
    const currentUser = req.user;

    let {
      name,
      description,
      short_description,
      gender,
      base_price,
      is_active,
      is_featured,
      is_public,
      category_id,
      subcategory_id,
      meta_title,
      meta_description,
      variants,
      delete_image_ids,
      delete_variant_ids
    } = req.body;

    // ✅ SAFE JSON PARSING (because form-data sends string)
    try {
      variants = variants ? JSON.parse(variants) : [];
      delete_image_ids = delete_image_ids ? JSON.parse(delete_image_ids) : [];
      delete_variant_ids = delete_variant_ids ? JSON.parse(delete_variant_ids) : [];
    } catch (parseErr) {
      return res.status(400).json({ 
        message: 'Invalid JSON format in variants or delete_image_ids',
        error: parseErr.message 
      });
    }

    // ✅ VALIDATION
    if (!id) {
      return res.status(400).json({ message: 'Product ID is required' });
    }

    if (base_price !== undefined && base_price !== null && base_price < 0) {
      return res.status(400).json({ message: 'Base price cannot be negative' });
    }

    if (variants && Array.isArray(variants)) {
      for (let variant of variants) {
        if (variant.price !== undefined && variant.price !== null && variant.price < 0) {
          return res.status(400).json({ message: 'Variant price cannot be negative' });
        }
        if (variant.stock_quantity !== undefined && variant.stock_quantity !== null && variant.stock_quantity < 0) {
          return res.status(400).json({ message: 'Stock quantity cannot be negative' });
        }
      }
    }

    await connection.beginTransaction();

    // 1️⃣ Check product existence
    const [existing] = await connection.query(
      'SELECT org_id FROM products WHERE id = ? AND deleted_at IS NULL',
      [id]
    );

    if (!existing.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Product not found' });
    }

    // ✅ AUTHORIZATION CHECK
    if (currentUser.role === 'ADMIN' && existing[0].org_id !== currentUser.org_id) {
      await connection.rollback();
      return res.status(403).json({ message: 'Not authorized to update this product' });
    }

    // 2️⃣ Update Product
    let slugUpdate = '';
    let slugParam = [];

    if (name) {
      const newSlug = slugify(name, { lower: true, strict: true });
      slugUpdate = ', slug = ?';
      slugParam = [newSlug];
    }

    // ✅ Parse boolean values from form-data (they come as strings)
    const parseBoolean = (val) => {
      if (val === undefined || val === null) return undefined;
      if (typeof val === 'boolean') return val;
      if (val === 'true' || val === 1 || val === '1') return 1;
      return 0;
    };

    const updateParams = [
      name,
      description,
      short_description,
      gender,
      base_price ? parseFloat(base_price) : undefined,
      parseBoolean(is_active),
      parseBoolean(is_featured),
      parseBoolean(is_public),
      category_id ? parseInt(category_id) : undefined,
      subcategory_id ? parseInt(subcategory_id) : undefined,
      meta_title,
      meta_description,
      ...slugParam,
      id
    ];

    await connection.query(
      `
      UPDATE products SET 
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        short_description = COALESCE(?, short_description),
        gender = COALESCE(?, gender),
        base_price = COALESCE(?, base_price),
        is_active = COALESCE(?, is_active),
        is_featured = COALESCE(?, is_featured),
        is_public = COALESCE(?, is_public),
        category_id = COALESCE(?, category_id),
        subcategory_id = COALESCE(?, subcategory_id),
        meta_title = COALESCE(?, meta_title),
        meta_description = COALESCE(?, meta_description),
        updated_at = NOW()
        ${slugUpdate}
      WHERE id = ?
      `,
      updateParams
    );

    // 3️⃣ Soft Delete Images
    if (delete_image_ids && delete_image_ids.length > 0) {
      await connection.query(
        'UPDATE product_variant_images SET deleted_at = NOW() WHERE id IN (?) AND deleted_at IS NULL',
        [delete_image_ids]
      );
    }

    // 4️⃣ Soft Delete Variants
    if (delete_variant_ids && delete_variant_ids.length > 0) {
      await connection.query(
        'UPDATE product_variants SET deleted_at = NOW() WHERE id IN (?) AND product_id = ? AND deleted_at IS NULL',
        [delete_variant_ids, id]
      );
      // Also delete associated price tiers and images
      await connection.query(
        'DELETE FROM product_variant_price_tiers WHERE product_variant_id IN (?)',
        [delete_variant_ids]
      );
      await connection.query(
        'UPDATE product_variant_images SET deleted_at = NOW() WHERE product_variant_id IN (?)',
        [delete_variant_ids]
      );
    }

    // 5️⃣ Handle Variants
    if (variants && variants.length > 0) {
      for (let i = 0; i < variants.length; i++) {
        const variant = variants[i];
        let currentVariantId = variant.id;

        // 🔹 Update existing
        if (currentVariantId && currentVariantId !== 'new') {
          await connection.query(
            `UPDATE product_variants SET 
              color = COALESCE(?, color),
              size = COALESCE(?, size),
              sku = COALESCE(?, sku),
              price = COALESCE(?, price),
              stock_quantity = COALESCE(?, stock_quantity),
              is_active = COALESCE(?, is_active),
              updated_at = NOW()
             WHERE id = ? AND product_id = ? AND deleted_at IS NULL`,
            [
              variant.color,
              variant.size,
              variant.sku,
              variant.price ? parseFloat(variant.price) : undefined,
              variant.stock_quantity !== undefined && variant.stock_quantity !== null ? parseInt(variant.stock_quantity) : undefined,
              parseBoolean(variant.is_active),
              currentVariantId,
              id
            ]
          );
        }
        // 🔹 Create new
        else {
          const [newVariant] = await connection.query(
            `INSERT INTO product_variants 
             (product_id, color, size, sku, price, stock_quantity, is_active, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
              id,
              variant.color || null,
              variant.size || null,
              variant.sku || null,
              variant.price ? parseFloat(variant.price) : 0,
              variant.stock_quantity ? parseInt(variant.stock_quantity) : 0,
              variant.is_active ? parseBoolean(variant.is_active) : 1
            ]
          );

          currentVariantId = newVariant.insertId;
        }

        // 🔹 Replace price tiers
        if (variant.price_tiers) {
          await connection.query(
            'DELETE FROM product_variant_price_tiers WHERE product_variant_id = ?',
            [currentVariantId]
          );

          if (variant.price_tiers.length > 0) {
            for (const tier of variant.price_tiers) {
              if (!tier.min_quantity || !tier.unit_price) continue;

              await connection.query(
                `INSERT INTO product_variant_price_tiers 
                 (product_variant_id, min_quantity, unit_price)
                 VALUES (?, ?, ?)`,
                [
                  currentVariantId,
                  parseInt(tier.min_quantity),
                  parseFloat(tier.unit_price)
                ]
              );
            }
          }
        }

        // 🔹 Handle Images
        // 🔹 Handle Images (Improved Logic)
if (req.files && req.files.length > 0) {
    // 1. Pehle check karo agar existing variant hai (ID use karo)
    // 2. Agar naya variant hai, toh loop index wala fallback use karo
    const variantKey = (variant.id && variant.id !== 'new') 
        ? `variant_images_${variant.id}` 
        : `variant_images_new_${i}`;

    const files = req.files.filter(f => f.fieldname === variantKey);
    
    console.log(`Processing ${files.length} files for variant key: ${variantKey}`);

    for (const file of files) {
        await connection.query(
            `INSERT INTO product_variant_images 
            (product_variant_id, image_url, view_type, created_at)
            VALUES (?, ?, ?, NOW())`,
            [
                currentVariantId, // Ye wahi ID hai jo update ya insert ke baad mili
                file.path,
                variant.view_type || 'FRONT'
            ]
        );
    }
}
      }
    }

    await connection.commit();

    console.log("PRODUCT UPDATE SUCCESS:", { id, variants: variants?.length || 0 });

    return res.json({
      message: 'Product updated successfully',
      productId: id,
      success: true
    });

  } catch (err) {
    await connection.rollback();
    console.error("UPDATE PRODUCT ERROR:", err);

    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Duplicate SKU or Slug found' });
    }

    if (err.code === 'ER_NO_REFERENCED_ROW') {
      return res.status(400).json({ message: 'Invalid category or subcategory ID' });
    }

    return res.status(500).json({ message: 'Server error', error: err.message });
  } finally {
    connection.release();
  }
};


// Delete Product (soft delete)
exports.deleteProduct = async (req, res) => {
  const connection = await db.getConnection(); // Transaction ke liye connection
  try {
    const { id } = req.params;
    const currentUser = req.user;
    await connection.beginTransaction(); 
    const [products] = await connection.query(
      'SELECT org_id FROM products WHERE id = ? AND deleted_at IS NULL', 
      [id]
    );

    if (!products.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Product not found' });
    }

    if (currentUser.role === 'ADMIN' && products[0].org_id !== currentUser.org_id) {
      await connection.rollback();
      return res.status(403).json({ message: 'Not authorized' });
    }

    const now = new Date();
    await connection.query(
      'UPDATE products SET deleted_at = ? WHERE id = ?', 
      [now, id]
    );
    await connection.query(
      'UPDATE product_variants SET deleted_at = ? WHERE product_id = ?', 
      [now, id]
    );

    await connection.commit(); 
    return res.json({ message: 'Product and all its variants deleted successfully' });

  } catch (err) {
    await connection.rollback(); 
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  } finally {
    connection.release(); 
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