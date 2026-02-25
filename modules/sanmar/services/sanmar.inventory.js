// // ═══════════════════════════════════════════════════════
// //  SanMar Inventory Service
// //  Real-time stock quantity fetch karta hai
// // ═══════════════════════════════════════════════════════

// const { soapCall } = require('./sanmar.soap');

// /**
//  * Ek style ke saare sizes ka stock lo
//  * Yeh nightly sync mein use hoga
//  *
//  * @param {string} style  - e.g. 'PC61'
//  * @param {string} color  - e.g. 'White'
//  * @returns {Array}       - har size ka warehouse-wise qty
//  */
// async function getInventoryByStyleColor(style, color) {
//   const result = await soapCall('inventory', 'getInventoryQtyForStyleColor', {
//     style,
//     color,
//   });

//   return result?.listResponse || [];
// }

// /**
//  * Specific size ka stock lo (inventory_key use karke — faster)
//  * inventory_key aur size_index DB mein save hain (sanmar_inventory_key, size_index)
//  *
//  * @param {string} inventoryKey  - product_variants.sanmar_inventory_key
//  * @param {number} sizeIndex     - product_variant_sizes.size_index
//  */
// async function getInventoryByKey(inventoryKey, sizeIndex) {
//   const result = await soapCall('inventory', 'getInventoryQtyForStyleColorSize', {
//     inventory_key: inventoryKey,
//     size_index:    sizeIndex,
//   });

//   // Total qty across all warehouses sum karo
//   const rows = result?.listResponse || [];
//   const totalQty = rows.reduce((sum, row) => {
//     return sum + (parseInt(row.qty, 10) || 0);
//   }, 0);

//   return { totalQty, warehouses: rows };
// }

// /**
//  * Multiple styles ka bulk inventory lo
//  * Order place hone se pehle stock verify karne ke liye
//  *
//  * @param {Array} items - [{ inventoryKey, sizeIndex, variantSizeId }]
//  * @returns {Array}     - [{ variantSizeId, available, qty }]
//  */
// async function bulkCheckInventory(items) {
//   const results = [];

//   for (const item of items) {
//     try {
//       const { totalQty } = await getInventoryByKey(
//         item.inventoryKey,
//         item.sizeIndex
//       );

//       results.push({
//         variantSizeId: item.variantSizeId,
//         available:     totalQty > 0,
//         qty:           totalQty,
//       });
//     } catch (err) {
//       console.error(`[Inventory] Failed for key ${item.inventoryKey}:`, err.message);
//       results.push({
//         variantSizeId: item.variantSizeId,
//         available:     null, // null = unknown, UI mein handle karo
//         qty:           null,
//         error:         true,
//       });
//     }
//   }

//   return results;
// }

// module.exports = {
//   getInventoryByStyleColor,
//   getInventoryByKey,
//   bulkCheckInventory,
// };


// ═══════════════════════════════════════════════════════
//  SanMar Inventory Service
//  SANMAR_MOCK=true → mock data use hoga
// ═══════════════════════════════════════════════════════

const { soapCall }              = require('./sanmar.soap');
const { getMockInventoryRows }  = require('./sanmar.mock');

const IS_MOCK = process.env.SANMAR_MOCK === 'true';

async function getInventoryByStyleColor(style, color) {
  if (IS_MOCK) {
    console.log(`[SanMar MOCK] getInventoryByStyleColor: ${style} / ${color}`);
    return getMockInventoryRows(style, color);
  }
  const result = await soapCall('inventory', 'getInventoryQtyForStyleColor', { style, color });
  return result?.listResponse || [];
}

async function getInventoryByKey(inventoryKey, sizeIndex) {
  if (IS_MOCK) return { totalQty: 100, warehouses: [] };
  const result = await soapCall('inventory', 'getInventoryQtyForStyleColorSize', {
    inventory_key: inventoryKey,
    size_index:    sizeIndex,
  });
  const rows = result?.listResponse || [];
  const totalQty = rows.reduce((sum, row) => sum + (parseInt(row.qty, 10) || 0), 0);
  return { totalQty, warehouses: rows };
}

async function bulkCheckInventory(items) {
  const results = [];
  for (const item of items) {
    try {
      const { totalQty } = await getInventoryByKey(item.inventoryKey, item.sizeIndex);
      results.push({ variantSizeId: item.variantSizeId, available: totalQty > 0, qty: totalQty });
    } catch (err) {
      results.push({ variantSizeId: item.variantSizeId, available: null, qty: null, error: true });
    }
  }
  return results;
}

module.exports = { getInventoryByStyleColor, getInventoryByKey, bulkCheckInventory };