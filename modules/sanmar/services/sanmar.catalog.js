// ═══════════════════════════════════════════════════════
//  SanMar Catalog Service
//  Product info fetch karta hai — style, color, size level
// ═══════════════════════════════════════════════════════

const { soapCall } = require('./sanmar.soap');

/**
 * Ek style ki poori info lo (saare colors + sizes)
 * Yeh sabse useful method hai — ek call mein sab aata hai
 *
 * @param {string} style  - e.g. 'PC61'
 * @returns {Array}       - listResponse array of product rows
 */
async function getProductByStyle(style) {
  const result = await soapCall('product', 'getProductInfoByStyle', {
    style,
  });

  // Response ek array hota hai — har row ek color+size combo hai
  return result?.listResponse || [];
}

/**
 * Ek specific style+color+size ka data lo
 * Useful for single item refresh
 *
 * @param {string} style
 * @param {string} color  - e.g. 'White'
 * @param {string} size   - e.g. 'XL'
 */
async function getProductByStyleColorSize(style, color, size) {
  const result = await soapCall('product', 'getProductInfoByStyleColorSize', {
    style,
    color,
    size,
  });

  return result?.listResponse?.[0] || null;
}

/**
 * Poori category ki styles lo
 * Warning: Yeh slow ho sakta hai — timeout badhana padega
 * Sirf full sync mein use karo
 *
 * @param {string} category - e.g. 'T-Shirts'
 */
async function getProductsByCategory(category) {
  const result = await soapCall('product', 'getProductInfoByCategory', {
    category,
  });

  return result?.listResponse || [];
}

/**
 * Brand ke saare products lo
 * @param {string} brand - e.g. 'Port & Company'
 */
async function getProductsByBrand(brand) {
  const result = await soapCall('product', 'getProductInfoByBrand', {
    brand,
  });

  return result?.listResponse || [];
}

module.exports = {
  getProductByStyle,
  getProductByStyleColorSize,
  getProductsByCategory,
  getProductsByBrand,
};