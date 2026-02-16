const db = require('../../config/db');

exports.getPublicProducts = async (req, res) => {
  try {
    const currentUser = req.user;

    let query = `
      SELECT 
        p.id,
        p.name,
        p.slug,
        p.short_description,
        p.base_price,
        p.is_featured
      FROM products p
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

    return res.json(products);
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

    let query = `
      SELECT 
        p.id as product_id, p.name as product_name, p.slug, p.description, p.short_description,
        c.name as category_name, sc.name as subcategory_name,
        pv.id as variant_id, pv.color, pv.size, pv.price, pv.stock_quantity,
        pvi.id as image_id, pvi.image_url as product_image, pvi.view_type,
        cpd.id as design_id, cpd.position_x_percent, cpd.position_y_percent, 
        cpd.width_percent, cpd.height_percent,
        lv.id as logo_variant_id, lv.image_url as logo_image, 
        l.title as logo_name, l.is_public as logo_is_public, l.org_id as logo_org_id
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN subcategories sc ON p.subcategory_id = sc.id
      LEFT JOIN product_variants pv ON p.id = pv.product_id
      LEFT JOIN product_variant_images pvi ON pv.id = pvi.product_variant_id
      
      /* Yahan Join mein hi Security Filter hai: 
         Sirf vahi logos join honge jo public hain ya user ki org ke hain */
      LEFT JOIN custom_product_designs cpd ON pvi.id = cpd.product_variant_image_id
      LEFT JOIN logo_variants lv ON cpd.logo_variant_id = lv.id
      LEFT JOIN logos l ON lv.logo_id = l.id 
        AND (
          l.is_public = 1 
          OR l.org_id IS NULL 
          ${userOrgId ? 'OR l.org_id = ?' : ''}
        )
      
      WHERE p.slug = ? 
      AND p.is_active = 1 
      AND p.deleted_at IS NULL
    `;

    const params = [];
    if (userOrgId) params.push(userOrgId); 
    params.push(slug); 

    if (userOrgId) {
      query += ` AND (p.org_id = ? OR p.org_id IS NULL OR p.is_public = 1) `;
      params.push(userOrgId);
    } else {
      query += ` AND (p.org_id IS NULL OR p.is_public = 1) `;
    }

    const [rows] = await db.query(query, params);

    if (rows.length === 0) {
      return res.status(404).json({ message: "Product not found or access denied" });
    }

    const productDetail = {
      id: rows[0].product_id,
      name: rows[0].product_name,
      slug: rows[0].slug,
      description: rows[0].description,
      short_description: rows[0].short_description,
      category: rows[0].category_name,
      subcategory: rows[0].subcategory_name,
      variants: []
    };

    rows.forEach(row => {
      let variant = productDetail.variants.find(v => v.id === row.variant_id);
      if (row.variant_id && !variant) {
        variant = {
          id: row.variant_id,
          color: row.color,
          size: row.size,
          price: row.price,
          stock: row.stock_quantity,
          images: []
        };
        productDetail.variants.push(variant);
      }
      if (variant && row.image_id) {
        let img = variant.images.find(i => i.id === row.image_id);
        if (!img) {
          img = {
            id: row.image_id,
            url: row.product_image,
            view: row.view_type,
            placements: []
          };
          variant.images.push(img);
        }
        if (row.design_id) {
          img.placements.push({
            id: row.design_id,
            logo_variant_id: row.logo_variant_id,
            logo_name: row.logo_name,
            logo_url: row.logo_image,
            position: {
              x: row.position_x_percent,
              y: row.position_y_percent,
              w: row.width_percent,
              h: row.height_percent
            }
          });
        }
      }
    });

    return res.json(productDetail);

  } catch (err) {
    console.error("GET PRODUCT DETAIL ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
};