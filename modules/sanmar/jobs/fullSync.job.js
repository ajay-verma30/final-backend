// ═══════════════════════════════════════════════════════
//  Full Sync Job
//  Pehli baar ya manual trigger pe poora catalog import karo
//  Usage: node fullSync.job.js
// ═══════════════════════════════════════════════════════

const db                = require('../../../config/db');
const config            = require('../config/sanmar.config');
const { getProductByStyle }  = require('../services/sanmar.catalog');
const { getPricingByStyle }  = require('../services/sanmar.pricing');
const { getInventoryByStyleColor } = require('../services/sanmar.inventory');
const {
  mapProduct,
  mapVariant,
  mapSize,
  mapImages,
  groupRowsByColor,
} = require('../mappers/sanmar.mapper');

// ─────────────────────────────────────────────────────
//  Yahan woh styles daalo jo import karne hain
//  Baad mein yeh DB se ya config file se bhi aa sakta hai
// ─────────────────────────────────────────────────────
const STYLES_TO_IMPORT = [
  // Port & Company basics
  'PC61', 'PC54', 'PC55',
  // Sport-Tek
  'ST350', 'ST500',
  // Aur styles add karte raho...
];

// ─────────────────────────────────────────────────────
//  Helper: delay (rate limiting ke liye)
// ─────────────────────────────────────────────────────
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ─────────────────────────────────────────────────────
//  Helper: category/subcategory ID lo slug se
// ─────────────────────────────────────────────────────
async function getCategoryIds(categorySlug, subcategorySlug) {
  const [cats] = await db.query(
    'SELECT id FROM categories WHERE slug = ? LIMIT 1',
    [categorySlug]
  );
  if (!cats.length) throw new Error(`Category not found: ${categorySlug}`);

  const [subcats] = await db.query(
    'SELECT id FROM subcategories WHERE slug = ? AND category_id = ? LIMIT 1',
    [subcategorySlug, cats[0].id]
  );
  if (!subcats.length) throw new Error(`Subcategory not found: ${subcategorySlug}`);

  return { categoryId: cats[0].id, subcategoryId: subcats[0].id };
}

// ─────────────────────────────────────────────────────
//  Ek style ka complete sync
// ─────────────────────────────────────────────────────
async function syncStyle(style, createdBy) {
  console.log(`\n[Sync] Starting style: ${style}`);

  // 1. Product data fetch karo
  const rows = await getProductByStyle(style);
  if (!rows.length) {
    console.warn(`[Sync] No data found for style: ${style}`);
    return;
  }

  const firstRow = rows[0];

  // 2. Category IDs lo (tumhari categories table se)
  //    Baad mein yeh mapping improve kar sakte ho
  let categoryId, subcategoryId;
  try {
    const ids = await getCategoryIds('t-shirts', 'plain-tshirts'); // placeholder
    categoryId    = ids.categoryId;
    subcategoryId = ids.subcategoryId;
  } catch {
    // Agar category nahi mili toh pehli available category use karo
    const [cats] = await db.query('SELECT id FROM categories LIMIT 1');
    const [subs] = await db.query('SELECT id FROM subcategories LIMIT 1');
    categoryId    = cats[0]?.id;
    subcategoryId = subs[0]?.id;
  }

  // 3. Product upsert karo
  const productData = mapProduct(firstRow, categoryId, subcategoryId, createdBy);

  const [existingProduct] = await db.query(
    'SELECT id FROM products WHERE sanmar_style = ? AND deleted_at IS NULL',
    [style]
  );

  let productId;
  if (existingProduct.length) {
    // Update
    productId = existingProduct[0].id;
    await db.query(
      `UPDATE products SET name=?, description=?, brand_name=?, gender=?, 
       updated_at=NOW() WHERE id=?`,
      [productData.name, productData.description, productData.brand_name,
       productData.gender, productId]
    );
    console.log(`[Sync] Updated product: ${style} (id: ${productId})`);
  } else {
    // Insert
    const [result] = await db.query(
      `INSERT INTO products 
        (org_id, category_id, subcategory_id, name, slug, description, 
         short_description, gender, base_price, has_variants, is_active, 
         is_public, created_by, brand_name, sanmar_style)
       VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        productData.category_id, productData.subcategory_id,
        productData.name, productData.slug, productData.description,
        productData.short_description, productData.gender,
        productData.base_price, productData.has_variants,
        productData.is_active, productData.is_public,
        productData.created_by,
        productData.brand_name, productData.sanmar_style,
      ]
    );
    productId = result.insertId;
    console.log(`[Sync] Inserted product: ${style} (id: ${productId})`);
  }

  // 4. Pricing fetch karo
  const pricingRows = await getPricingByStyle(style);
  // Map karo: color+size → pricing
  const pricingMap = new Map();
  pricingRows.forEach(p => {
    pricingMap.set(`${p.color}__${p.size}`, p);
  });

  // 5. Rows ko color ke hisaab se group karo
  const colorMap = groupRowsByColor(rows);

  for (const [color, { colorRow, sizes }] of colorMap) {

    // 6. Variant (color level) upsert karo
    const firstPricing = pricingMap.get(`${colorRow.color}__${sizes[0]?.size}`) || {};
    const variantData  = mapVariant(colorRow, productId, firstPricing.piecePrice || 0);

    const [existingVariant] = await db.query(
      'SELECT id FROM product_variants WHERE product_id = ? AND color = ? AND deleted_at IS NULL',
      [productId, variantData.color]
    );

    let variantId;
    if (existingVariant.length) {
      variantId = existingVariant[0].id;
      await db.query(
        `UPDATE product_variants 
         SET catalog_color=?, color_swatch_url=?, sanmar_inventory_key=?, 
             price=?, updated_at=NOW()
         WHERE id=?`,
        [variantData.catalog_color, variantData.color_swatch_url,
         variantData.sanmar_inventory_key, variantData.price, variantId]
      );
    } else {
      const [vResult] = await db.query(
        `INSERT INTO product_variants 
          (product_id, color, catalog_color, color_swatch_url, 
           sanmar_inventory_key, price, is_active)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [
          productId, variantData.color, variantData.catalog_color,
          variantData.color_swatch_url, variantData.sanmar_inventory_key,
          variantData.price,
        ]
      );
      variantId = vResult.insertId;
    }

    // 7. Images upsert karo
    const images = mapImages(colorRow, variantId);
    for (const img of images) {
      const [existImg] = await db.query(
        'SELECT id FROM product_variant_images WHERE product_variant_id=? AND view_type=? AND deleted_at IS NULL',
        [variantId, img.view_type]
      );
      if (!existImg.length) {
        await db.query(
          'INSERT INTO product_variant_images (product_variant_id, image_url, view_type) VALUES (?,?,?)',
          [variantId, img.image_url, img.view_type]
        );
      } else {
        await db.query(
          'UPDATE product_variant_images SET image_url=? WHERE id=?',
          [img.image_url, existImg[0].id]
        );
      }
    }

    // 8. Sizes upsert karo
    for (const sizeRow of sizes) {
      const sizeData = mapSize(sizeRow, variantId);
      const pricing  = pricingMap.get(`${colorRow.color}__${sizeRow.size}`);

      const [existSize] = await db.query(
        'SELECT id FROM product_variant_sizes WHERE product_variant_id=? AND size=? AND deleted_at IS NULL',
        [variantId, sizeData.size]
      );

      if (existSize.length) {
        await db.query(
          'UPDATE product_variant_sizes SET sku=?, size_index=?, updated_at=NOW() WHERE id=?',
          [sizeData.sku, sizeData.size_index, existSize[0].id]
        );
      } else {
        await db.query(
          `INSERT INTO product_variant_sizes 
            (product_variant_id, size, sku, stock_quantity, size_index, is_active)
           VALUES (?, ?, ?, 0, ?, 1)`,
          [variantId, sizeData.size, sizeData.sku, sizeData.size_index]
        );
      }

      // 9. Price tiers upsert karo
      if (pricing) {
        const tiers = [
          { min_quantity: 1, unit_price: pricing.piecePrice, sale_price: pricing.salePrice, case_size: null },
        ];
        if (pricing.casePrice && pricing.caseSize > 1) {
          tiers.push({ min_quantity: pricing.caseSize, unit_price: pricing.casePrice, sale_price: null, case_size: pricing.caseSize });
        }

        for (const tier of tiers) {
          await db.query(
            `INSERT INTO product_variant_price_tiers 
              (product_variant_id, min_quantity, unit_price, sale_price, case_size)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE 
               unit_price=VALUES(unit_price), 
               sale_price=VALUES(sale_price),
               updated_at=NOW()`,
            [variantId, tier.min_quantity, tier.unit_price, tier.sale_price, tier.case_size]
          );
        }
      }
    }

    // Inventory bhi fetch karo
    try {
      const inventoryRows = await getInventoryByStyleColor(style, colorRow.color);
      for (const invRow of inventoryRows) {
        const sizeUpper = (invRow.size || '').toUpperCase();
        const totalQty  = parseInt(invRow.qty || 0, 10);

        await db.query(
          `UPDATE product_variant_sizes 
           SET stock_quantity = ?
           WHERE product_variant_id = ? AND size = ? AND deleted_at IS NULL`,
          [totalQty, variantId, sizeUpper]
        );
      }
    } catch (err) {
      console.warn(`[Sync] Inventory fetch failed for ${style}/${color}:`, err.message);
    }

    console.log(`  ✓ Color: ${color} (${sizes.length} sizes)`);
  }
}

// ─────────────────────────────────────────────────────
//  Main — saare styles ko batch mein process karo
// ─────────────────────────────────────────────────────
async function runFullSync() {
  // Sync log start karo
  const [logResult] = await db.query(
    `INSERT INTO sanmar_sync_logs (sync_type, status, started_at) VALUES ('FULL', 'RUNNING', NOW())`
  );
  const syncLogId = logResult.insertId;

  // SUPER user ka ID lo (created_by ke liye)
  const [superUser] = await db.query(
    "SELECT id FROM users WHERE role='SUPER' AND deleted_at IS NULL LIMIT 1"
  );
  const createdBy = superUser[0]?.id || 1;

  let synced = 0;
  const errors = [];

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  SanMar Full Sync — ${STYLES_TO_IMPORT.length} styles`);
  console.log(`${'═'.repeat(50)}`);

  for (const style of STYLES_TO_IMPORT) {
    try {
      await syncStyle(style, createdBy);
      synced++;
    } catch (err) {
      console.error(`[Sync] FAILED for ${style}:`, err.message);
      errors.push({ style, error: err.message });
    }

    // Rate limiting — SanMar pe zyada load mat daalo
    await sleep(config.sync.delayBetweenRequests);
  }

  // Sync log update karo
  await db.query(
    `UPDATE sanmar_sync_logs 
     SET status=?, styles_synced=?, errors=?, finished_at=NOW()
     WHERE id=?`,
    [
      errors.length ? 'FAILED' : 'SUCCESS',
      synced,
      JSON.stringify(errors),
      syncLogId,
    ]
  );

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  Sync Complete: ${synced} synced, ${errors.length} errors`);
  console.log(`${'═'.repeat(50)}\n`);
}

// Direct run karo
runFullSync()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Full sync crashed:', err);
    process.exit(1);
  });

module.exports = { syncStyle, runFullSync };