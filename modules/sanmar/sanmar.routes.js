// ═══════════════════════════════════════════════════════
//  SanMar Routes
//  Sirf SUPER/ADMIN access kar sakte hain
// ═══════════════════════════════════════════════════════

const express    = require('express');
const router     = express.Router();
const ctrl       = require('./sanmar.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { authorize }    = require('../../middleware/role.middleware');

const adminOnly = [authenticate, authorize('SUPER', 'ADMIN')];

// Sync status / logs
router.get('/status', ...adminOnly, ctrl.getSyncStatus);

// Manual style sync
router.post('/sync/style', ...adminOnly, ctrl.syncSingleStyle);

// Manual inventory refresh
router.post('/sync/inventory', ...adminOnly, ctrl.triggerInventorySync);

// Pre-order inventory check (authenticated users)
router.post('/check-inventory', authenticate, ctrl.checkInventory);

module.exports = router;