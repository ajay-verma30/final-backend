// ═══════════════════════════════════════════════════════
//  SanMar Mapper
//  SanMar API response → Tumhara DB format
// ═══════════════════════════════════════════════════════

// SanMar gender values → tumhara ENUM
const GENDER_MAP = {
  'Men':    'MEN',
  'Women':  'WOMEN',
  'Unisex': 'UNISEX',
  'Youth':  'UNISEX',
  'Boys':   'MEN',
  'Girls':  'WOMEN',
};

// SanMar category → tumhari categories table slug
// Baad mein extend karo jab saare categories DB mein ho
const CATEGORY_SLUG_MAP = {
  'T-Shirts':       't-shirts',
  'Polos':          'polos',
  'Sweatshirts':    'sweatshirts',
  'Outerwear':      'outerwear',
  'Headwear':       'headwear',
  'Bags':           'bags',
  'Woven Shirts':   'woven-shirts',
  'Activewear':     'activewear',
};

// SanMar size order — size_index ke liye
const SIZE_ORDER = ['OSFA','XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL','LT','XLT','2XLT','3XLT'];

function getSizeIndex(size) {
  const idx = SIZE_ORDER.indexOf(size?.toUpperCase());
  return idx >= 0 ? idx : 99; // Unknown sizes ko end mein daalo
}

// ─────────────────────────────────────────────────────
//  Product mapper
//  SanMar listResponse row → products table row
// ─────────────────────────────────────────────────────
function mapProduct(row, categoryId, subcategoryId, createdBy) {
  const style = row.style || row.STYLE;
  const name  = row.product_title || row.productTitle || style;
  const brand = row.brand_name    || row.brandName    || '';
  const gender = GENDER_MAP[row.gender] || 'UNISEX';

  return {
    // DB columns
    name,
    slug:              style.toLowerCase(),
    description:       row.product_description || row.productDescription || null,
    short_description: row.product_description
                         ? row.product_description.substring(0, 500)
                         : null,
    gender,
    base_price:        0.00,          // base_price = 0, actual price variant mein hoga
    has_variants:      1,
    is_active:         1,
    is_public:         1,             // SanMar products sabko dikhenge
    category_id:       categoryId,
    subcategory_id:    subcategoryId,
    created_by:        createdBy,

    // SanMar specific columns (ALTER TABLE se add kiye the)
    brand_name:        brand,
    sanmar_style:      style,
  };
}

// ─────────────────────────────────────────────────────
//  Variant mapper (color level)
//  → product_variants table
// ─────────────────────────────────────────────────────
function mapVariant(row, productId, piecePrice) {
  return {
    product_id:             productId,
    color:                  (row.color || row.catalog_color || '').toUpperCase(),
    catalog_color:          row.catalog_color || row.catalogColor || null,
    color_swatch_url:       row.color_swatch_url || row.colorSwatchUrl || null,
    sanmar_inventory_key:   row.inventory_key   || row.inventoryKey   || null,
    price:                  piecePrice || 0.00,
    is_active:              1,

    // sku at variant level = null (sizes mein hoga)
    sku: null,
  };
}

// ─────────────────────────────────────────────────────
//  Size mapper
//  → product_variant_sizes table
// ─────────────────────────────────────────────────────
function mapSize(row, variantId) {
  const size = row.size || row.SIZE || '';
  return {
    product_variant_id: variantId,
    size:               size.toUpperCase(),
    sku:                row.unique_key || row.uniqueKey || row.sku || '',
    stock_quantity:     0,   // inventory sync mein update hoga
    size_index:         getSizeIndex(size),
    is_active:          1,
  };
}

// ─────────────────────────────────────────────────────
//  Image mapper
//  → product_variant_images table
// ─────────────────────────────────────────────────────
function mapImages(row, variantId) {
  const images = [];

  const front = row.front_model_image_url || row.frontModelImageUrl
              || row.front_flat_image_url  || row.frontFlatImageUrl;
  const back  = row.back_model_image_url  || row.backModelImageUrl
              || row.back_flat_image_url   || row.backFlatImageUrl;
  const side  = row.side_image_url        || row.sideImageUrl;

  if (front) images.push({ product_variant_id: variantId, image_url: front, view_type: 'FRONT' });
  if (back)  images.push({ product_variant_id: variantId, image_url: back,  view_type: 'BACK'  });
  if (side)  images.push({ product_variant_id: variantId, image_url: side,  view_type: 'SIDE'  });

  return images;
}

// ─────────────────────────────────────────────────────
//  Full style processor
//  SanMar ki listResponse (array of rows) ko process karo
//  Group by color, phir sizes collect karo
// ─────────────────────────────────────────────────────
function groupRowsByColor(rows) {
  const colorMap = new Map();

  rows.forEach(row => {
    const color = (row.color || row.catalog_color || '').toUpperCase();
    if (!colorMap.has(color)) {
      colorMap.set(color, { colorRow: row, sizes: [] });
    }
    colorMap.get(color).sizes.push(row);
  });

  return colorMap;
}

module.exports = {
  mapProduct,
  mapVariant,
  mapSize,
  mapImages,
  groupRowsByColor,
  getSizeIndex,
  CATEGORY_SLUG_MAP,
  GENDER_MAP,
};