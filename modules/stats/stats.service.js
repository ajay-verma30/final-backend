const db = require('../../config/db');

exports.getGlobalStats = async (role, orgId = null) => {

  let usersQuery = `SELECT COUNT(*) as count FROM users WHERE deleted_at IS NULL`;
  let productsQuery = `SELECT COUNT(*) as count FROM products WHERE deleted_at IS NULL`;
  let ordersQuery = `SELECT COUNT(*) as count FROM orders WHERE 1=1`;
  let revenueQuery = `SELECT SUM(total_price) as total FROM orders WHERE status = 'PAID'`;

  const usersParams = [];
  const productsParams = [];
  const ordersParams = [];
  const revenueParams = [];

  if (role === 'ADMIN' && orgId) {
    usersQuery += ` AND org_id = ?`;
    productsQuery += ` AND org_id = ?`;
    ordersQuery += ` AND org_id = ?`;
    revenueQuery += ` AND org_id = ?`;

    usersParams.push(orgId);
    productsParams.push(orgId);
    ordersParams.push(orgId);
    revenueParams.push(orgId);
  }

  const [
    [userRes],
    [productRes],
    [orderRes],
    [revenueRes]
  ] = await Promise.all([
    db.query(usersQuery, usersParams),
    db.query(productsQuery, productsParams),
    db.query(ordersQuery, ordersParams),
    db.query(revenueQuery, revenueParams)
  ]);

  return {
    totalUsers: userRes[0].count,
    totalProducts: productRes[0].count,
    totalOrders: orderRes[0].count,
    totalRevenue: revenueRes[0].total || 0
  };
};