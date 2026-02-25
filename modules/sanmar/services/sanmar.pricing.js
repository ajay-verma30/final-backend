// // ═══════════════════════════════════════════════════════
// //  SanMar Pricing Service
// //  Wholesale pricing + bulk tiers fetch karta hai
// // ═══════════════════════════════════════════════════════

// const { soapCall } = require('./sanmar.soap');

// /**
//  * Ek style+color+size ka pricing lo
//  *
//  * Response mein ye fields aate hain:
//  *   piece_price  → unit price (1+ qty)
//  *   case_price   → price per piece jab poora case lo
//  *   sale_price   → agar koi promo chal raha ho
//  *   case_size    → kitne pieces = 1 case
//  *
//  * @param {string} style
//  * @param {string} color
//  * @param {string} size
//  */
// async function getPricing(style, color, size) {
//   const result = await soapCall('pricing', 'getPricing', {
//     style,
//     color,
//     size,
//   });

//   const row = result?.listResponse?.[0];
//   if (!row) return null;

//   return {
//     piecePrice: parseFloat(row.piece_price || row.piecePrice || 0),
//     casePrice:  parseFloat(row.case_price  || row.casePrice  || 0),
//     salePrice:  parseFloat(row.sale_price  || row.salePrice  || 0) || null,
//     caseSize:   parseInt(row.case_size     || row.caseSize   || 0, 10),
//   };
// }

// /**
//  * Ek style ke saare colors+sizes ka pricing lo (bulk)
//  * Full sync mein use hoga
//  *
//  * @param {string} style
//  */
// async function getPricingByStyle(style) {
//   const result = await soapCall('pricing', 'getPricingByStyle', {
//     style,
//   });

//   return (result?.listResponse || []).map(row => ({
//     style:      row.style,
//     color:      row.color,
//     size:       row.size,
//     piecePrice: parseFloat(row.piece_price || row.piecePrice || 0),
//     casePrice:  parseFloat(row.case_price  || row.casePrice  || 0),
//     salePrice:  parseFloat(row.sale_price  || row.salePrice  || 0) || null,
//     caseSize:   parseInt(row.case_size     || row.caseSize   || 0, 10),
//   }));
// }

// /**
//  * SanMar pricing ko tumhare price_tiers format mein convert karo
//  *
//  * Tumhara DB:
//  *   min_quantity | unit_price
//  *   1            | piece_price   (per unit)
//  *   case_size    | case_price    (per unit jab case lo)
//  *
//  * @param {object} pricing - getPricing() ka result
//  * @returns {Array}        - price_tiers rows
//  */
// function buildPriceTiers(pricing) {
//   const tiers = [];

//   if (pricing.piecePrice > 0) {
//     tiers.push({ min_quantity: 1, unit_price: pricing.piecePrice });
//   }

//   if (pricing.casePrice > 0 && pricing.caseSize > 1) {
//     tiers.push({ min_quantity: pricing.caseSize, unit_price: pricing.casePrice });
//   }

//   return tiers;
// }

// module.exports = {
//   getPricing,
//   getPricingByStyle,
//   buildPriceTiers,
// };


// ═══════════════════════════════════════════════════════
//  SanMar Pricing Service
//  SANMAR_MOCK=true → mock data use hoga
// ═══════════════════════════════════════════════════════

const { soapCall }            = require('./sanmar.soap');
const { getMockPricingRows }  = require('./sanmar.mock');

const IS_MOCK = process.env.SANMAR_MOCK === 'true';

async function getPricing(style, color, size) {
  if (IS_MOCK) {
    const rows = getMockPricingRows(style);
    return rows.find(r => r.color === color && r.size === size) || null;
  }
  const result = await soapCall('pricing', 'getPricing', { style, color, size });
  const row = result?.listResponse?.[0];
  if (!row) return null;
  return {
    piecePrice: parseFloat(row.piece_price || 0),
    casePrice:  parseFloat(row.case_price  || 0),
    salePrice:  parseFloat(row.sale_price  || 0) || null,
    caseSize:   parseInt(row.case_size     || 0, 10),
  };
}

async function getPricingByStyle(style) {
  if (IS_MOCK) {
    console.log(`[SanMar MOCK] getPricingByStyle: ${style}`);
    return getMockPricingRows(style);
  }
  const result = await soapCall('pricing', 'getPricingByStyle', { style });
  return (result?.listResponse || []).map(row => ({
    style:      row.style,
    color:      row.color,
    size:       row.size,
    piecePrice: parseFloat(row.piece_price || 0),
    casePrice:  parseFloat(row.case_price  || 0),
    salePrice:  parseFloat(row.sale_price  || 0) || null,
    caseSize:   parseInt(row.case_size     || 0, 10),
  }));
}

function buildPriceTiers(pricing) {
  const tiers = [];
  if (pricing.piecePrice > 0) {
    tiers.push({ min_quantity: 1, unit_price: pricing.piecePrice });
  }
  if (pricing.casePrice > 0 && pricing.caseSize > 1) {
    tiers.push({ min_quantity: pricing.caseSize, unit_price: pricing.casePrice });
  }
  return tiers;
}

module.exports = { getPricing, getPricingByStyle, buildPriceTiers };