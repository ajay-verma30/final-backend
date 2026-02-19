const couponService = require('./coupons.service');

// ✅ GET /api/coupons/batches — SUPER sees all, ADMIN sees own org only
exports.getBatches = async (req, res) => {
  try {
    const { role, org_id } = req.user;
    const batches = await couponService.getBatches(role, org_id);
    return res.status(200).json({ success: true, data: batches });
  } catch (error) {
    console.error('getBatches Controller Error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

// ✅ POST /api/coupons/initiate-payment
// Step 1: Validates, creates Stripe PaymentIntent + pending batch row.
// Returns clientSecret to the frontend so Stripe form can render.
exports.initiateCouponPayment = async (req, res) => {
  try {
    const { role, org_id: userOrgId } = req.user;
    const { org_id: targetOrgId } = req.body;

    // 🛡️ ADMIN can only create coupons for their own org
    if (role === 'ADMIN' && Number(userOrgId) !== Number(targetOrgId)) {
      return res.status(403).json({
        success: false,
        message: 'Access Denied: You cannot create coupons for other organizations.',
      });
    }

    const result = await couponService.initiateCouponPayment(req.body, req.user);

    return res.status(200).json({
      success: true,
      clientSecret: result.clientSecret,
      batchId: result.batchId,
    });
  } catch (error) {
    console.error('initiateCouponPayment Controller Error:', error);
    return res.status(500).json({ message: error.message || 'Failed to initiate payment' });
  }
};

// ✅ GET /api/coupons/my — end user's own unused coupons
exports.getUserCoupons = async (req, res) => {
  try {
    const coupons = await couponService.getCouponsByUserId(req.user.id);
    return res.status(200).json({ success: true, data: coupons });
  } catch (error) {
    console.error('getUserCoupons Controller Error:', error);
    return res.status(500).json({ message: 'Error fetching coupons' });
  }
};