// ═══════════════════════════════════════════════════════
//  SanMar Controller
//  Admin panel ke liye manual sync trigger + status check
// ═══════════════════════════════════════════════════════

const db = require('../../config/db');
const { syncStyle }       = require('./jobs/fullSync.job');
const { runDeltaSync }    = require('./jobs/deltaSync.job');
const { bulkCheckInventory } = require('./services/sanmar.inventory');

// ─────────────────────────────────────────────────────
//  GET /api/sanmar/status
//  Recent sync logs dikhao
// ─────────────────────────────────────────────────────
exports.getSyncStatus = async (req, res) => {
  try {
    const [logs] = await db.query(
      `SELECT * FROM sanmar_sync_logs 
       ORDER BY started_at DESC 
       LIMIT 10`
    );
    return res.json({ success: true, data: logs });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────
//  POST /api/sanmar/sync/style
//  Body: { style: 'PC61' }
//  Ek style manually sync karo
// ─────────────────────────────────────────────────────
exports.syncSingleStyle = async (req, res) => {
  const { style } = req.body;
  if (!style) return res.status(400).json({ message: 'style is required' });

  const createdBy = req.user.id;

  // Background mein chalaao — response turant bhejo
  res.json({ success: true, message: `Sync started for style: ${style}` });

  try {
    await syncStyle(style, createdBy);
    console.log(`[SanMar] Manual sync done: ${style}`);
  } catch (err) {
    console.error(`[SanMar] Manual sync failed: ${style}`, err.message);
  }
};

// ─────────────────────────────────────────────────────
//  POST /api/sanmar/sync/inventory
//  Saara inventory manually refresh karo
// ─────────────────────────────────────────────────────
exports.triggerInventorySync = async (req, res) => {
  res.json({ success: true, message: 'Inventory sync started' });

  try {
    await runDeltaSync();
  } catch (err) {
    console.error('[SanMar] Manual inventory sync failed:', err.message);
  }
};

// ─────────────────────────────────────────────────────
//  POST /api/sanmar/check-inventory
//  Order place hone se pehle live stock verify karo
//  Body: { items: [{ variantSizeId, inventoryKey, sizeIndex }] }
// ─────────────────────────────────────────────────────
exports.checkInventory = async (req, res) => {
  try {
    const { items } = req.body;
    if (!items?.length) return res.status(400).json({ message: 'items required' });

    const results = await bulkCheckInventory(items);
    const allAvailable = results.every(r => r.available !== false);

    return res.json({
      success: true,
      allAvailable,
      items: results,
    });
  } catch (err) {
    console.error('[SanMar] Inventory check failed:', err.message);
    return res.status(500).json({ message: 'Server error' });
  }
};