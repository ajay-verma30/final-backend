const db = require('../../config/db');

exports.getPublicProducts = async (req, res) => {
  try {
    const currentUser = req.user; 

    let query = `
      SELECT 
        p.id,
        p.name,
        p.slug,
        p.description,
        p.base_price,
        p.gender,
        c.id AS category_id,
        c.name AS category_name,
        sc.id AS sub_category_id,
        sc.name AS sub_category_name,
        p.is_featured,
        p.org_id,
        -- 📸 Product ki primary image fetch kar rahe hain
        (SELECT pi.image_url 
         FROM product_images pi 
         WHERE pi.product_id = p.id 
         ORDER BY pi.is_primary DESC, pi.id ASC 
         LIMIT 1) as main_image
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN subcategories sc ON p.subcategory_id = sc.id
      WHERE p.deleted_at IS NULL
      AND p.is_active = 1
    `;

    const params = [];

    if (currentUser && currentUser.org_id) {
      query += `
        AND (
          p.org_id = ? 
          OR p.org_id IS NULL 
          OR p.is_public = 1
        )
      `;
      params.push(currentUser.org_id);
    } else {
      query += `
        AND (
          p.org_id IS NULL 
          OR p.is_public = 1
        )
      `;
    }

    query += ` ORDER BY p.created_at DESC`;

    const [products] = await db.query(query, params);

    return res.status(200).json({
      success: true,
      count: products.length,
      data: products
    });

  } catch (err) {
    console.error("PUBLIC PRODUCTS ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

//public product details
exports.getPublicProductDetail = async (req, res) => {
  try {
    const { slug } = req.params;
    const currentUser = req.user;
    const userOrgId = currentUser ? currentUser.org_id : null;

    // 1. Fetch Basic Product, Category, and Subcategory Details
    const [productRows] = await db.query(`
      SELECT 
        p.id, p.name, p.slug, p.description, p.gender, p.base_price, p.org_id,
        c.id as cat_id, c.slug as cat_slug,
        sc.id as subcat_id, sc.category_id as subcat_cat_id, sc.slug as subcat_slug
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN subcategories sc ON p.subcategory_id = sc.id
      WHERE p.slug = ? AND p.is_active = 1 AND p.deleted_at IS NULL
      AND (p.is_public = 1 OR p.org_id IS NULL ${userOrgId ? 'OR p.org_id = ?' : ''})
    `, userOrgId ? [slug, userOrgId] : [slug]);

    if (productRows.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    const product = productRows[0];
    const productId = product.id;

    // 2. Parallel Queries for all related tables (Better Performance)
    const [
      [images],          // product_images
      [variants],        // product_variants + price_tiers
      [catAssets],       // category_assets
      [customizations]   // product_customizations + logos + logo_variants
    ] = await Promise.all([
      // A. Product Images
      db.query(`SELECT id, image_url, is_primary FROM product_images WHERE product_id = ?`, [productId]),
      
      // B. Variants + Images + Price Tiers (Grouped logic in JS later)
      db.query(`
        SELECT 
          pv.id, pv.color, pv.size, pv.price as variant_price, pv.sku, pv.stock_quantity,
          pvi.id as img_id, pvi.image_url as img_url, pvi.view_type,
          pt.id as tier_id, pt.min_quantity, pt.unit_price
        FROM product_variants pv
        LEFT JOIN product_variant_images pvi ON pv.id = pvi.product_variant_id AND pvi.deleted_at IS NULL
        LEFT JOIN product_variant_price_tiers pt ON pv.id = pt.product_variant_id AND pt.deleted_at IS NULL
        WHERE pv.product_id = ? AND pv.is_active = 1 AND pv.deleted_at IS NULL
      `, [productId]),

      // C. Category Assets
      db.query(`SELECT id, category_id, image_url FROM category_assets WHERE category_id = ?`, [product.cat_id]),

      // D. Customizations + Logo Details
      db.query(`
        SELECT 
          pc.id, pc.name as custom_name, pc.product_variant_image_id, pc.logo_variant_id,
          pc.pos_x, pc.pos_y, pc.logo_width, pc.logo_height, pc.org_id,
          lv.id as lv_id, lv.color as logo_color, lv.image_url as logo_url,
          l.id as logo_id, l.title as logo_title, l.org_id as logo_org_id
        FROM product_customizations pc
        LEFT JOIN logo_variants lv ON pc.logo_variant_id = lv.id
        LEFT JOIN logos l ON lv.logo_id = l.id
        WHERE pc.product_id = ? AND pc.deleted_at IS NULL
      `, [productId])
    ]);

    // 3. Mapping Data into nested JSON structure
    const result = {
      ...product,
      category: { id: product.cat_id, slug: product.cat_slug, assets: catAssets },
      subcategory: { id: product.subcat_id, category_id: product.subcat_cat_id, slug: product.subcat_slug },
      product_images: images,
      variants: [],
      customizations: customizations
    };

    // Helper to group variants, images, and tiers correctly
    variants.forEach(row => {
      let v = result.variants.find(item => item.id === row.id);
      if (!v) {
        v = { 
          id: row.id, color: row.color, size: row.size, 
          variant_price: row.variant_price, sku: row.sku, 
          stock: row.stock_quantity, images: [], price_tiers: [] 
        };
        result.variants.push(v);
      }
      
      // Add variant image if not already added
      if (row.img_id && !v.images.find(i => i.id === row.img_id)) {
        v.images.push({ id: row.img_id, url: row.img_url, view_type: row.view_type });
      }
      
      // Add price tier if not already added
      if (row.tier_id && !v.price_tiers.find(t => t.id === row.tier_id)) {
        v.price_tiers.push({ id: row.tier_id, min_qty: row.min_quantity, unit_price: row.unit_price });
      }
    });

    return res.status(200).json({ success: true, data: result });

  } catch (err) {
    console.error("PUBLIC PRODUCT DETAIL ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
};