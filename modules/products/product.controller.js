const db = require('../../config/db');
const slugify = require('slugify');
const { canManageProduct } = require('../../utils/productPermission');

// =============================================
// CREATE PRODUCT
// =============================================
exports.createProduct = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const currentUser = req.user;
    let {
      name, description, short_description, gender, base_price,
      category_id, subcategory_id, is_public, is_active, is_featured, org_id,
      meta_title, meta_description
    } = req.body;

    if (!name || !category_id || !subcategory_id) {
      return res.status(400).json({ message: 'Name, category, and subcategory are required' });
    }

    const slug = slugify(name, { lower: true, strict: true });
    const finalOrgId = currentUser.role === 'ADMIN' ? currentUser.org_id : (org_id || null);

    await connection.beginTransaction();

    const [productResult] = await connection.query(
      `INSERT INTO products 
      (org_id, category_id, subcategory_id, name, slug, description, short_description,
       gender, base_price, created_by, is_public, is_active, is_featured, meta_title, meta_description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        finalOrgId, category_id, subcategory_id, name, slug,
        description || null, short_description || null, gender || null,
        base_price || 0, currentUser.id, is_public ?? 0,
        is_active ?? 1, is_featured ?? 0, meta_title || null, meta_description || null
      ]
    );

    const productId = productResult.insertId;

    if (req.files && req.files.length > 0) {
      const imageEntries = req.files.map((file, index) => [
        productId,
        file.path,
        index === 0 ? 1 : 0,
        'FRONT'
      ]);

      await connection.query(
        `INSERT INTO product_images (product_id, image_url, is_primary, view_type) VALUES ?`,
        [imageEntries]
      );
    }

    await connection.commit();

    return res.status(201).json({
      message: 'Product created successfully',
      productId,
      slug
    });

  } catch (err) {
    await connection.rollback();
    console.error("CREATE PRODUCT ERROR:", err.message, err.code);

    if (err.code === 'ER_DUP_ENTRY') {
      if (err.sqlMessage && err.sqlMessage.includes('slug')) {
        return res.status(400).json({ message: 'Is naam ka product already exist karta hai. Alag naam try karein.' });
      }
      return res.status(400).json({ message: 'Duplicate entry: ' + (err.sqlMessage || '') });
    }
    if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW') {
      return res.status(400).json({ message: 'Invalid category ya subcategory. Please valid values select karein.' });
    }
    if (err.code === 'ER_BAD_NULL_ERROR') {
      return res.status(400).json({ message: 'Required field missing: ' + (err.sqlMessage || '') });
    }

    return res.status(500).json({ message: err.message || 'Server error' });
  } finally {
    connection.release();
  }
};


// =============================================
// GET ALL PRODUCTS
// =============================================
exports.getProducts = async (req, res) => {
  try {
    const currentUser = req.user;

    if (!currentUser) {
      return res.status(401).json({ message: "Unauthorized: Dashboard access required" });
    }

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

    if (currentUser.role === 'SUPER') {
      console.log("Super user access: Fetching all records");
    } else if (currentUser.role === 'ADMIN') {
      query += ` AND p.org_id = ?`;
      queryParams.push(currentUser.org_id);
    } else {
      query += ` AND p.org_id = ? AND p.is_public = 1`;
      queryParams.push(currentUser.org_id);
    }

    query += ` ORDER BY p.created_at DESC`;

    const [products] = await db.query(query, queryParams);

    return res.json({
      message: "Products fetched successfully",
      count: products.length,
      data: products
    });

  } catch (err) {
    console.error("GET PRODUCTS ERROR:", err);
    return res.status(500).json({ message: 'Server error' });
  }
};


// =============================================
// GET PRODUCT BY ID
// =============================================
exports.getProductById = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { id } = req.params;
    const currentUser = req.user;

    // 1. Product detail
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

    if (!products.length) {
      return res.status(404).json({ message: "Product not found" });
    }

    const product = products[0];

    // 2. Authorization
    if (currentUser) {
      if (
        currentUser.role === "ADMIN" &&
        product.org_id !== currentUser.org_id &&
        product.is_public !== 1
      ) {
        return res.status(403).json({ message: "Not authorized to view this product" });
      }
    } else if (product.is_public !== 1) {
      return res.status(403).json({ message: "Not authorized to view this product" });
    }

    // 3. Default product images
    const [defaultImages] = await connection.query(
      `SELECT id, image_url, is_primary, view_type 
       FROM product_images 
       WHERE product_id = ? 
       ORDER BY is_primary DESC, id ASC`,
      [id]
    );
    product.images = defaultImages;

    // 4. Variants with images, price tiers, AND sizes
    const [variants] = await connection.query(
      `SELECT * FROM product_variants 
       WHERE product_id = ? AND deleted_at IS NULL AND is_active = 1`,
      [id]
    );

    for (let variant of variants) {
      // Variant images
      const [variantImages] = await connection.query(
        `SELECT id, image_url, view_type FROM product_variant_images 
         WHERE product_variant_id = ? AND deleted_at IS NULL`,
        [variant.id]
      );

      // Price tiers
      const [priceTiers] = await connection.query(
        `SELECT id, min_quantity, unit_price FROM product_variant_price_tiers
         WHERE product_variant_id = ? AND deleted_at IS NULL`,
        [variant.id]
      );

      // ✅ Sizes from product_variant_sizes
      const [sizes] = await connection.query(
        `SELECT id, size, sku, stock_quantity, is_active
         FROM product_variant_sizes
         WHERE product_variant_id = ? AND deleted_at IS NULL AND is_active = 1
         ORDER BY id ASC`,
        [variant.id]
      );

      variant.images      = variantImages;
      variant.price_tiers = priceTiers;
      variant.sizes       = sizes;
    }

    product.variants = variants;

    // 5. Customizations
    const [customizations] = await connection.query(
      `SELECT 
          pc.id, pc.name, pc.pos_x, pc.pos_y, pc.logo_width, pc.logo_height,
          lv.image_url AS logo_image_url
       FROM product_customizations pc
       INNER JOIN logo_variants lv ON pc.logo_variant_id = lv.id
       WHERE pc.product_id = ? AND pc.deleted_at IS NULL`,
      [id]
    );

    product.customizations = customizations;

    return res.json({ product });

  } catch (err) {
    console.error("GET PRODUCT BY ID ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  } finally {
    connection.release();
  }
};


// =============================================
// UPDATE PRODUCT
// =============================================
exports.updateProduct = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const { id } = req.params;
    const currentUser = req.user;

    let {
      name, description, short_description, gender, base_price,
      is_active, is_featured, is_public, category_id, subcategory_id,
      meta_title, meta_description,
      variants,
      delete_image_ids,
      delete_variant_ids,
      delete_size_ids       // ✅ NEW
    } = req.body;

    // Safe JSON parsing (form-data sends strings)
    try {
      variants           = variants          ? JSON.parse(variants)          : [];
      delete_image_ids   = delete_image_ids  ? JSON.parse(delete_image_ids)  : [];
      delete_variant_ids = delete_variant_ids? JSON.parse(delete_variant_ids): [];
      delete_size_ids    = delete_size_ids   ? JSON.parse(delete_size_ids)   : []; // ✅ NEW
    } catch (parseErr) {
      return res.status(400).json({
        message: 'Invalid JSON in request body fields',
        error: parseErr.message
      });
    }

    if (!id) return res.status(400).json({ message: 'Product ID is required' });

    if (base_price !== undefined && base_price !== null && base_price < 0) {
      return res.status(400).json({ message: 'Base price cannot be negative' });
    }

    if (variants && Array.isArray(variants)) {
      for (let variant of variants) {
        if (variant.price !== undefined && variant.price !== null && variant.price < 0) {
          return res.status(400).json({ message: 'Variant price cannot be negative' });
        }
        // ✅ Validate sizes within variants
        if (variant.sizes && Array.isArray(variant.sizes)) {
          for (let sz of variant.sizes) {
            if (sz.stock_quantity !== undefined && sz.stock_quantity < 0) {
              return res.status(400).json({ message: 'Size stock_quantity cannot be negative' });
            }
          }
        }
      }
    }

    await connection.beginTransaction();

    // Check product existence
    const [existing] = await connection.query(
      'SELECT org_id FROM products WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    if (!existing.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Product not found' });
    }

    // Authorization
    if (currentUser.role === 'ADMIN' && existing[0].org_id !== currentUser.org_id) {
      await connection.rollback();
      return res.status(403).json({ message: 'Not authorized to update this product' });
    }

    // Slug update
    let slugUpdate = '';
    let slugParam = [];
    if (name) {
      const newSlug = slugify(name, { lower: true, strict: true });
      slugUpdate = ', slug = ?';
      slugParam = [newSlug];
    }

    const parseBoolean = (val) => {
      if (val === undefined || val === null) return undefined;
      if (typeof val === 'boolean') return val ? 1 : 0;
      if (val === 'true' || val === 1 || val === '1') return 1;
      return 0;
    };

    // Update product core fields
    const updateParams = [
      name, description, short_description, gender,
      base_price ? parseFloat(base_price) : undefined,
      parseBoolean(is_active), parseBoolean(is_featured), parseBoolean(is_public),
      category_id ? parseInt(category_id) : undefined,
      subcategory_id ? parseInt(subcategory_id) : undefined,
      meta_title, meta_description,
      ...slugParam,
      id
    ];

    await connection.query(
      `UPDATE products SET 
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
      WHERE id = ?`,
      updateParams
    );

    // Soft delete: product images
    if (delete_image_ids.length > 0) {
      await connection.query(
        'UPDATE product_variant_images SET deleted_at = NOW() WHERE id IN (?) AND deleted_at IS NULL',
        [delete_image_ids]
      );
    }

    // ✅ NEW: Soft delete specific sizes
    if (delete_size_ids.length > 0) {
      await connection.query(
        'UPDATE product_variant_sizes SET deleted_at = NOW() WHERE id IN (?) AND deleted_at IS NULL',
        [delete_size_ids]
      );
    }

    // Soft delete variants (and cascade their sizes)
    if (delete_variant_ids.length > 0) {
      await connection.query(
        'UPDATE product_variants SET deleted_at = NOW() WHERE id IN (?) AND product_id = ? AND deleted_at IS NULL',
        [delete_variant_ids, id]
      );
      // ✅ Soft delete sizes for these variants
      await connection.query(
        'UPDATE product_variant_sizes SET deleted_at = NOW() WHERE product_variant_id IN (?) AND deleted_at IS NULL',
        [delete_variant_ids]
      );
      await connection.query(
        'DELETE FROM product_variant_price_tiers WHERE product_variant_id IN (?)',
        [delete_variant_ids]
      );
      await connection.query(
        'UPDATE product_variant_images SET deleted_at = NOW() WHERE product_variant_id IN (?)',
        [delete_variant_ids]
      );
    }

    // Handle variants
    if (variants && variants.length > 0) {
      for (let i = 0; i < variants.length; i++) {
        const variant = variants[i];
        let currentVariantId = variant.id;

        // Update existing variant
        if (currentVariantId && currentVariantId !== 'new') {
          await connection.query(
            `UPDATE product_variants SET 
              color = COALESCE(?, color),
              sku = COALESCE(?, sku),
              price = COALESCE(?, price),
              is_active = COALESCE(?, is_active),
              updated_at = NOW()
             WHERE id = ? AND product_id = ? AND deleted_at IS NULL`,
            [
              variant.color,
              variant.sku,
              variant.price ? parseFloat(variant.price) : undefined,
              parseBoolean(variant.is_active),
              currentVariantId,
              id
            ]
          );
        }
        // Create new variant
        else {
          const [newVariant] = await connection.query(
            `INSERT INTO product_variants 
             (product_id, color, sku, price, is_active, size, stock_quantity, created_at)
             VALUES (?, ?, ?, ?, ?, NULL, NULL, NOW())`,
            [
              id,
              variant.color || null,
              variant.sku || null,
              variant.price ? parseFloat(variant.price) : 0,
              variant.is_active ? parseBoolean(variant.is_active) : 1
            ]
          );
          currentVariantId = newVariant.insertId;
        }

        // ✅ NEW: Handle sizes for this variant
        if (variant.sizes && Array.isArray(variant.sizes)) {
          for (const sz of variant.sizes) {
            if (!sz.size) continue;

            if (sz.id && sz.id !== 'new') {
              // Update existing size
              await connection.query(
                `UPDATE product_variant_sizes SET
                  size = COALESCE(?, size),
                  sku = COALESCE(?, sku),
                  stock_quantity = COALESCE(?, stock_quantity),
                  is_active = COALESCE(?, is_active),
                  updated_at = NOW()
                 WHERE id = ? AND product_variant_id = ? AND deleted_at IS NULL`,
                [
                  sz.size ? sz.size.toUpperCase() : undefined,
                  sz.sku  ? sz.sku.trim()         : undefined,
                  sz.stock_quantity !== undefined  ? parseInt(sz.stock_quantity) : undefined,
                  parseBoolean(sz.is_active),
                  sz.id,
                  currentVariantId
                ]
              );
            } else {
              // Insert new size — INSERT IGNORE to handle duplicate silently
              await connection.query(
                `INSERT IGNORE INTO product_variant_sizes
                 (product_variant_id, size, sku, stock_quantity, is_active)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                  currentVariantId,
                  sz.size.toUpperCase(),
                  sz.sku ? sz.sku.trim() : null,
                  sz.stock_quantity ? parseInt(sz.stock_quantity) : 0,
                  sz.is_active !== undefined ? parseBoolean(sz.is_active) : 1
                ]
              );
            }
          }
        }

        // Replace price tiers
        if (variant.price_tiers) {
          await connection.query(
            'DELETE FROM product_variant_price_tiers WHERE product_variant_id = ?',
            [currentVariantId]
          );
          for (const tier of variant.price_tiers) {
            if (!tier.min_quantity || !tier.unit_price) continue;
            await connection.query(
              `INSERT INTO product_variant_price_tiers (product_variant_id, min_quantity, unit_price)
               VALUES (?, ?, ?)`,
              [currentVariantId, parseInt(tier.min_quantity), parseFloat(tier.unit_price)]
            );
          }
        }

        // Handle variant images
        if (req.files && req.files.length > 0) {
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
              [currentVariantId, file.path, variant.view_type || 'FRONT']
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


// =============================================
// DELETE PRODUCT (soft delete)
// =============================================
exports.deleteProduct = async (req, res) => {
  const connection = await db.getConnection();
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

    // Get variant IDs first for cascading
    const [variantRows] = await connection.query(
      'SELECT id FROM product_variants WHERE product_id = ?',
      [id]
    );
    const variantIds = variantRows.map(v => v.id);

    await connection.query('UPDATE products SET deleted_at = ? WHERE id = ?', [now, id]);
    await connection.query(
      'UPDATE product_variants SET deleted_at = ? WHERE product_id = ?',
      [now, id]
    );

    // ✅ Soft delete all sizes linked to these variants
    if (variantIds.length > 0) {
      await connection.query(
        'UPDATE product_variant_sizes SET deleted_at = ? WHERE product_variant_id IN (?)',
        [now, variantIds]
      );
    }

    await connection.commit();
    return res.json({ message: 'Product, variants, and sizes deleted successfully' });

  } catch (err) {
    await connection.rollback();
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  } finally {
    connection.release();
  }
};


// =============================================
// ADD VARIANT
// =============================================
exports.addVariant = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const currentUser = req.user;
    // size & stock_quantity removed — now managed via product_variant_sizes
    const { product_id, color, sku, price, is_active } = req.body;

    if (!product_id || !color || !price) {
      return res.status(400).json({ message: 'product_id, color, and price are required' });
    }

    const [products] = await connection.query(
      'SELECT id, org_id FROM products WHERE id = ? AND deleted_at IS NULL',
      [product_id]
    );

    if (!products.length) {
      return res.status(404).json({ message: 'Product not found' });
    }

    if (currentUser.role === 'ADMIN' && products[0].org_id !== currentUser.org_id) {
      return res.status(403).json({ message: "Not authorized to add variants to this organization's product" });
    }

    const [result] = await connection.query(
      `INSERT INTO product_variants 
       (product_id, color, sku, price, is_active, size, stock_quantity)
       VALUES (?, ?, ?, ?, ?, NULL, NULL)`,
      [
        product_id,
        color.toUpperCase(),
        sku ? sku.trim() : null,
        price,
        is_active ?? 1
      ]
    );

    return res.status(201).json({
      message: 'Variant added successfully',
      variantId: result.insertId
    });

  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      if (err.sqlMessage && err.sqlMessage.includes('uniq_variant_sku')) {
        return res.status(400).json({ message: 'SKU already exists. Please use a unique SKU.' });
      }
      if (err.sqlMessage && err.sqlMessage.includes('uniq_product_color')) {
        return res.status(400).json({ message: 'Is product ka yeh color already exist karta hai.' });
      }
    }
    console.error("ADD VARIANT ERROR:", err.message, err.code);
    return res.status(500).json({ message: err.message || 'Server error' });
  } finally {
    connection.release();
  }
};


// =============================================
// ✅ NEW: ADD VARIANT SIZE
// POST /variants/sizes
// =============================================
exports.addVariantSize = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const currentUser = req.user;
    const { product_variant_id, size, sku, stock_quantity, is_active } = req.body;

    if (!product_variant_id || !size || !sku) {
      return res.status(400).json({ message: 'product_variant_id, size, and sku are required' });
    }

    // Auth check via join
    const [variantData] = await connection.query(
      `SELECT p.org_id FROM product_variants v
       JOIN products p ON v.product_id = p.id
       WHERE v.id = ? AND v.deleted_at IS NULL AND p.deleted_at IS NULL`,
      [product_variant_id]
    );

    if (!variantData.length) {
      return res.status(404).json({ message: 'Variant not found' });
    }

    if (currentUser.role === 'ADMIN' && variantData[0].org_id !== currentUser.org_id) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const [result] = await connection.query(
      `INSERT INTO product_variant_sizes
       (product_variant_id, size, sku, stock_quantity, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      [
        product_variant_id,
        size.toUpperCase(),
        sku.trim(),
        stock_quantity || 0,
        is_active ?? 1
      ]
    );

    return res.status(201).json({
      message: 'Size added successfully',
      sizeId: result.insertId
    });

  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      if (err.sqlMessage.includes('uniq_variant_size')) {
        return res.status(400).json({ message: 'This size already exists for this variant.' });
      }
      if (err.sqlMessage.includes('uniq_size_sku')) {
        return res.status(400).json({ message: 'SKU already exists. Please use a unique SKU.' });
      }
    }
    console.error("ADD VARIANT SIZE ERROR:", err);
    return res.status(500).json({ message: 'Server error' });
  } finally {
    connection.release();
  }
};


// =============================================
// ✅ NEW: UPDATE VARIANT SIZE
// PUT /variants/sizes/:sizeId
// =============================================
exports.updateVariantSize = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const currentUser = req.user;
    const { sizeId } = req.params;
    const { size, sku, stock_quantity, is_active } = req.body;

    const [sizeData] = await connection.query(
      `SELECT pvs.id, p.org_id FROM product_variant_sizes pvs
       JOIN product_variants pv ON pvs.product_variant_id = pv.id
       JOIN products p ON pv.product_id = p.id
       WHERE pvs.id = ? AND pvs.deleted_at IS NULL`,
      [sizeId]
    );

    if (!sizeData.length) {
      return res.status(404).json({ message: 'Size not found' });
    }

    if (currentUser.role === 'ADMIN' && sizeData[0].org_id !== currentUser.org_id) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const parseBoolean = (val) => {
      if (val === undefined || val === null) return undefined;
      if (typeof val === 'boolean') return val ? 1 : 0;
      if (val === 'true' || val === 1 || val === '1') return 1;
      return 0;
    };

    await connection.query(
      `UPDATE product_variant_sizes SET
        size = COALESCE(?, size),
        sku = COALESCE(?, sku),
        stock_quantity = COALESCE(?, stock_quantity),
        is_active = COALESCE(?, is_active),
        updated_at = NOW()
       WHERE id = ? AND deleted_at IS NULL`,
      [
        size ? size.toUpperCase() : undefined,
        sku  ? sku.trim()         : undefined,
        stock_quantity !== undefined ? parseInt(stock_quantity) : undefined,
        parseBoolean(is_active),
        sizeId
      ]
    );

    return res.json({ message: 'Size updated successfully' });

  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Duplicate size or SKU.' });
    }
    console.error("UPDATE VARIANT SIZE ERROR:", err);
    return res.status(500).json({ message: 'Server error' });
  } finally {
    connection.release();
  }
};


// =============================================
// ✅ NEW: DELETE VARIANT SIZE (soft delete)
// DELETE /variants/sizes/:sizeId
// =============================================
exports.deleteVariantSize = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const currentUser = req.user;
    const { sizeId } = req.params;

    const [sizeData] = await connection.query(
      `SELECT pvs.id, p.org_id FROM product_variant_sizes pvs
       JOIN product_variants pv ON pvs.product_variant_id = pv.id
       JOIN products p ON pv.product_id = p.id
       WHERE pvs.id = ? AND pvs.deleted_at IS NULL`,
      [sizeId]
    );

    if (!sizeData.length) {
      return res.status(404).json({ message: 'Size not found' });
    }

    if (currentUser.role === 'ADMIN' && sizeData[0].org_id !== currentUser.org_id) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    await connection.query(
      'UPDATE product_variant_sizes SET deleted_at = NOW() WHERE id = ?',
      [sizeId]
    );

    return res.json({ message: 'Size deleted successfully' });

  } catch (err) {
    console.error("DELETE VARIANT SIZE ERROR:", err);
    return res.status(500).json({ message: 'Server error' });
  } finally {
    connection.release();
  }
};


// =============================================
// ADD VARIANT PRICE TIER
// =============================================
exports.addVariantPriceTier = async (req, res) => {
  try {
    const { product_variant_id, min_quantity, unit_price } = req.body;
    const currentUser = req.user;

    const [variantData] = await db.query(
      `SELECT p.org_id FROM product_variants v 
       JOIN products p ON v.product_id = p.id 
       WHERE v.id = ? AND p.deleted_at IS NULL`,
      [product_variant_id]
    );

    if (!variantData.length) return res.status(404).json({ message: 'Variant or Product not found' });

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


// =============================================
// ADD VARIANT IMAGE
// =============================================
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

    const ALLOWED_VIEW_TYPES = ['FRONT', 'BACK', 'SIDE'];
    const viewUpper = view_type.toUpperCase();

    if (!ALLOWED_VIEW_TYPES.includes(viewUpper)) {
      return res.status(400).json({
        message: `Invalid view_type. Allowed: ${ALLOWED_VIEW_TYPES.join(', ')}`
      });
    }

    await connection.beginTransaction();
    const results = [];

    for (const file of req.files) {
      const [dbResult] = await connection.query(
        `INSERT INTO product_variant_images (product_variant_id, image_url, view_type)
         VALUES (?, ?, ?)`,
        [product_variant_id, file.path, viewUpper]
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