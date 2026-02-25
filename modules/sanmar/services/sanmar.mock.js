// ═══════════════════════════════════════════════════════
//  SanMar Mock Data
//  Credentials milne tak is data se testing hogi
//  Real SanMar API response ka exact format follow karta hai
// ═══════════════════════════════════════════════════════

const MOCK_PRODUCTS = {

  PC61: {
    style: 'PC61',
    product_title: 'Essential Tee',
    brand_name: 'Port & Company',
    gender: 'Unisex',
    product_description: 'Our best-selling tee. A classic that everyone needs.',
    colors: [
      {
        color: 'White',
        catalog_color: 'WHITE',
        color_swatch_url: 'https://www.sanmar.com/swatches/PC61_White.jpg',
        inventory_key: 'PC61_White',
        front_model_image_url: 'https://www.sanmar.com/images/PC61_White_Front.jpg',
        back_model_image_url:  'https://www.sanmar.com/images/PC61_White_Back.jpg',
        sizes: [
          { size: 'S',   unique_key: 'PC61-WHT-S',   qty: 450 },
          { size: 'M',   unique_key: 'PC61-WHT-M',   qty: 620 },
          { size: 'L',   unique_key: 'PC61-WHT-L',   qty: 580 },
          { size: 'XL',  unique_key: 'PC61-WHT-XL',  qty: 390 },
          { size: '2XL', unique_key: 'PC61-WHT-2XL', qty: 210 },
          { size: '3XL', unique_key: 'PC61-WHT-3XL', qty: 80  },
        ],
        pricing: { piece_price: 4.98, case_price: 4.48, case_size: 72, sale_price: null },
      },
      {
        color: 'Black',
        catalog_color: 'BLACK',
        color_swatch_url: 'https://www.sanmar.com/swatches/PC61_Black.jpg',
        inventory_key: 'PC61_Black',
        front_model_image_url: 'https://www.sanmar.com/images/PC61_Black_Front.jpg',
        back_model_image_url:  'https://www.sanmar.com/images/PC61_Black_Back.jpg',
        sizes: [
          { size: 'S',   unique_key: 'PC61-BLK-S',   qty: 320 },
          { size: 'M',   unique_key: 'PC61-BLK-M',   qty: 510 },
          { size: 'L',   unique_key: 'PC61-BLK-L',   qty: 490 },
          { size: 'XL',  unique_key: 'PC61-BLK-XL',  qty: 275 },
          { size: '2XL', unique_key: 'PC61-BLK-2XL', qty: 180 },
          { size: '3XL', unique_key: 'PC61-BLK-3XL', qty: 60  },
        ],
        pricing: { piece_price: 4.98, case_price: 4.48, case_size: 72, sale_price: null },
      },
      {
        color: 'Navy',
        catalog_color: 'NAVY',
        color_swatch_url: 'https://www.sanmar.com/swatches/PC61_Navy.jpg',
        inventory_key: 'PC61_Navy',
        front_model_image_url: 'https://www.sanmar.com/images/PC61_Navy_Front.jpg',
        back_model_image_url:  'https://www.sanmar.com/images/PC61_Navy_Back.jpg',
        sizes: [
          { size: 'S',   unique_key: 'PC61-NVY-S',   qty: 290 },
          { size: 'M',   unique_key: 'PC61-NVY-M',   qty: 430 },
          { size: 'L',   unique_key: 'PC61-NVY-L',   qty: 410 },
          { size: 'XL',  unique_key: 'PC61-NVY-XL',  qty: 220 },
          { size: '2XL', unique_key: 'PC61-NVY-2XL', qty: 140 },
        ],
        pricing: { piece_price: 4.98, case_price: 4.48, case_size: 72, sale_price: null },
      },
    ],
  },

  ST350: {
    style: 'ST350',
    product_title: 'PosiCharge Competitor Tee',
    brand_name: 'Sport-Tek',
    gender: 'Men',
    product_description: 'Snag-resistant, moisture-wicking tee built for performance.',
    colors: [
      {
        color: 'True Royal',
        catalog_color: 'TRUE ROYAL',
        color_swatch_url: 'https://www.sanmar.com/swatches/ST350_TrueRoyal.jpg',
        inventory_key: 'ST350_TrueRoyal',
        front_model_image_url: 'https://www.sanmar.com/images/ST350_Royal_Front.jpg',
        back_model_image_url:  'https://www.sanmar.com/images/ST350_Royal_Back.jpg',
        sizes: [
          { size: 'XS',  unique_key: 'ST350-ROY-XS',  qty: 90  },
          { size: 'S',   unique_key: 'ST350-ROY-S',   qty: 240 },
          { size: 'M',   unique_key: 'ST350-ROY-M',   qty: 380 },
          { size: 'L',   unique_key: 'ST350-ROY-L',   qty: 350 },
          { size: 'XL',  unique_key: 'ST350-ROY-XL',  qty: 195 },
          { size: '2XL', unique_key: 'ST350-ROY-2XL', qty: 120 },
          { size: '3XL', unique_key: 'ST350-ROY-3XL', qty: 45  },
          { size: '4XL', unique_key: 'ST350-ROY-4XL', qty: 20  },
        ],
        pricing: { piece_price: 7.49, case_price: 6.99, case_size: 36, sale_price: null },
      },
      {
        color: 'Black',
        catalog_color: 'BLACK',
        color_swatch_url: 'https://www.sanmar.com/swatches/ST350_Black.jpg',
        inventory_key: 'ST350_Black',
        front_model_image_url: 'https://www.sanmar.com/images/ST350_Black_Front.jpg',
        back_model_image_url:  'https://www.sanmar.com/images/ST350_Black_Back.jpg',
        sizes: [
          { size: 'S',   unique_key: 'ST350-BLK-S',   qty: 310 },
          { size: 'M',   unique_key: 'ST350-BLK-M',   qty: 420 },
          { size: 'L',   unique_key: 'ST350-BLK-L',   qty: 395 },
          { size: 'XL',  unique_key: 'ST350-BLK-XL',  qty: 230 },
          { size: '2XL', unique_key: 'ST350-BLK-2XL', qty: 155 },
        ],
        pricing: { piece_price: 7.49, case_price: 6.99, case_size: 36, sale_price: 6.49 },
      },
    ],
  },

  PC54: {
    style: 'PC54',
    product_title: 'Core Cotton Tee',
    brand_name: 'Port & Company',
    gender: 'Unisex',
    product_description: '100% cotton tee with a classic fit and durable construction.',
    colors: [
      {
        color: 'Athletic Heather',
        catalog_color: 'ATH HTH',
        color_swatch_url: 'https://www.sanmar.com/swatches/PC54_AthleticHeather.jpg',
        inventory_key: 'PC54_AthHeather',
        front_model_image_url: 'https://www.sanmar.com/images/PC54_AthHeather_Front.jpg',
        back_model_image_url:  'https://www.sanmar.com/images/PC54_AthHeather_Back.jpg',
        sizes: [
          { size: 'S',   unique_key: 'PC54-ATH-S',   qty: 180 },
          { size: 'M',   unique_key: 'PC54-ATH-M',   qty: 290 },
          { size: 'L',   unique_key: 'PC54-ATH-L',   qty: 270 },
          { size: 'XL',  unique_key: 'PC54-ATH-XL',  qty: 160 },
          { size: '2XL', unique_key: 'PC54-ATH-2XL', qty: 95  },
        ],
        pricing: { piece_price: 5.49, case_price: 4.99, case_size: 72, sale_price: null },
      },
    ],
  },

};

// ─────────────────────────────────────────────────────
//  Mock response builder
//  SanMar ke actual listResponse format mein return karta hai
// ─────────────────────────────────────────────────────

function getMockProductRows(style) {
  const product = MOCK_PRODUCTS[style.toUpperCase()];
  if (!product) return [];

  const rows = [];
  product.colors.forEach(colorData => {
    colorData.sizes.forEach(sizeData => {
      rows.push({
        style:                  product.style,
        product_title:          product.product_title,
        brand_name:             product.brand_name,
        gender:                 product.gender,
        product_description:    product.product_description,
        color:                  colorData.color,
        catalog_color:          colorData.catalog_color,
        color_swatch_url:       colorData.color_swatch_url,
        inventory_key:          colorData.inventory_key,
        front_model_image_url:  colorData.front_model_image_url,
        back_model_image_url:   colorData.back_model_image_url,
        size:                   sizeData.size,
        unique_key:             sizeData.unique_key,
        qty:                    sizeData.qty,
        piece_price:            colorData.pricing.piece_price,
        case_price:             colorData.pricing.case_price,
        case_size:              colorData.pricing.case_size,
        sale_price:             colorData.pricing.sale_price,
      });
    });
  });

  return rows;
}

function getMockPricingRows(style) {
  const product = MOCK_PRODUCTS[style.toUpperCase()];
  if (!product) return [];

  const rows = [];
  product.colors.forEach(colorData => {
    colorData.sizes.forEach(sizeData => {
      rows.push({
        style:       product.style,
        color:       colorData.color,
        size:        sizeData.size,
        piecePrice:  colorData.pricing.piece_price,
        casePrice:   colorData.pricing.case_price,
        caseSize:    colorData.pricing.case_size,
        salePrice:   colorData.pricing.sale_price,
      });
    });
  });

  return rows;
}

function getMockInventoryRows(style, color) {
  const product = MOCK_PRODUCTS[style.toUpperCase()];
  if (!product) return [];

  const colorData = product.colors.find(
    c => c.color.toLowerCase() === color.toLowerCase() ||
         c.catalog_color.toLowerCase() === color.toLowerCase()
  );
  if (!colorData) return [];

  return colorData.sizes.map(s => ({
    size: s.size,
    qty:  s.qty,
  }));
}

// Available mock styles list
const MOCK_STYLES = Object.keys(MOCK_PRODUCTS);

module.exports = {
  getMockProductRows,
  getMockPricingRows,
  getMockInventoryRows,
  MOCK_STYLES,
  MOCK_PRODUCTS,
};