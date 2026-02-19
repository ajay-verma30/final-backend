const db = require('../../config/db');

exports.getGlobalStats = async (role, orgId = null) => {
  let usersQuery = `SELECT COUNT(*) as count FROM users WHERE deleted_at IS NULL`;
  let productsQuery = `SELECT COUNT(*) as count FROM products WHERE deleted_at IS NULL`;
  let ordersQuery = `SELECT COUNT(*) as count FROM orders`;
  let revenueQuery = `SELECT SUM(total_price) as total FROM orders WHERE status = 'PAID'`;

  const params = [];

  if (role === 'ADMIN' && orgId) {
    const filter = ` AND org_id = ?`;
    usersQuery += filter;
    productsQuery += filter;
    ordersQuery += filter;
    revenueQuery += filter;
    params.push(orgId);
  }

  const [
    [userRes], 
    [productRes], 
    [orderRes], 
    [revenueRes]
  ] = await Promise.all([
    db.query(usersQuery, params),
    db.query(productsQuery, params),
    db.query(ordersQuery, params),
    db.query(revenueQuery, params)
  ]);

  return {
    totalUsers: userRes[0].count,
    totalProducts: productRes[0].count,
    totalOrders: orderRes[0].count,
    totalRevenue: revenueRes[0].total || 0
  };
};