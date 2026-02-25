// ═══════════════════════════════════════════════════════
//  Delta Sync Job — Nightly Inventory Update
//  Sirf stock_quantity update karta hai (products nahi)
//  Raat 2 baje automatically chalta hai (cron)
// ═══════════════════════════════════════════════════════

const cron   = require('node-cron');
const db     = require('../../../config/db');
const config = require('../config/sanmar.config');
const { getInventoryByStyleColor } = require('../services/sanmar.inventory');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ─────────────────────────────────────────────────────
//  DB se saare SanMar variants lo (style + color)
// ─────────────────────────────────────────────────────
async function getAllSanmarVariants() {
  const [rows] = await db.query(`
    SELECT 
      pv.id         AS variant_id,
      pv.color,
      pv.sanmar_inventory_key,
      p.sanmar_style
    FROM product_variants pv
    INNER JOIN products p ON p.id = pv.product_id
    WHERE p.sanmar_style IS NOT NULL
      AND pv.deleted_at  IS NULL
      AND p.deleted_at   IS NULL
      AND p.is_active    = 1
    ORDER BY p.sanmar_style, pv.color
  `);
  return rows;
}

// ─────────────────────────────────────────────────────
//  Ek variant ka stock update karo
// ─────────────────────────────────────────────────────
async function updateVariantStock(variant) {
  const inventoryRows = await getInventoryByStyleColor(
    variant.sanmar_style,
    variant.color
  );

  if (!inventoryRows.length) return 0;

  let updated = 0;
  for (const invRow of inventoryRows) {
    const sizeUpper = (invRow.size || '').toUpperCase();
    // Saare warehouses ka qty sum karo
    const totalQty = parseInt(invRow.qty || 0, 10);

    const [result] = await db.query(
      `UPDATE product_variant_sizes 
       SET stock_quantity = ?, updated_at = NOW()
       WHERE product_variant_id = ? 
         AND size = ? 
         AND deleted_at IS NULL`,
      [totalQty, variant.variant_id, sizeUpper]
    );
    updated += result.affectedRows;
  }
  return updated;
}

// ─────────────────────────────────────────────────────
//  Main delta sync function
// ─────────────────────────────────────────────────────
async function runDeltaSync() {
  const [logResult] = await db.query(
    `INSERT INTO sanmar_sync_logs (sync_type, status, started_at) VALUES ('INVENTORY', 'RUNNING', NOW())`
  );
  const syncLogId = logResult.insertId;

  console.log(`\n[Delta Sync] Started at ${new Date().toISOString()}`);

  const variants = await getAllSanmarVariants();
  console.log(`[Delta Sync] ${variants.length} variants to update`);

  let totalUpdated = 0;
  const errors = [];

  for (const variant of variants) {
    try {
      const count = await updateVariantStock(variant);
      totalUpdated += count;
    } catch (err) {
      errors.push({
        style: variant.sanmar_style,
        color: variant.color,
        error: err.message,
      });
      console.warn(`[Delta Sync] Failed: ${variant.sanmar_style}/${variant.color}`);
    }

    await sleep(config.sync.delayBetweenRequests);
  }

  await db.query(
    `UPDATE sanmar_sync_logs 
     SET status=?, styles_synced=?, errors=?, finished_at=NOW()
     WHERE id=?`,
    [
      errors.length && errors.length === variants.length ? 'FAILED' : 'SUCCESS',
      totalUpdated,
      JSON.stringify(errors),
      syncLogId,
    ]
  );

  console.log(`[Delta Sync] Done — ${totalUpdated} sizes updated, ${errors.length} errors`);
}

// ─────────────────────────────────────────────────────
//  Cron Schedule — raat 2 baje
// ─────────────────────────────────────────────────────
function startCron() {
  console.log(`[SanMar Cron] Scheduled: ${config.sync.cronSchedule}`);

  cron.schedule(config.sync.cronSchedule, async () => {
    console.log('[SanMar Cron] Delta sync triggered');
    try {
      await runDeltaSync();
    } catch (err) {
      console.error('[SanMar Cron] Delta sync crashed:', err);
    }
  });
}

module.exports = { runDeltaSync, startCron };