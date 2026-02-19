const statsService = require('./stats.service');

exports.getDashboardStats = async (req, res) => {
  try {
    const { role, org_id } = req.user;

    if (role !== 'SUPER' && role !== 'ADMIN') {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const stats = await statsService.getGlobalStats(
      role, 
      role === 'ADMIN' ? org_id : null
    );

    return res.status(200).json({
      message: 'Dashboard stats fetched successfully',
      data: stats
    });

  } catch (error) {
    console.error('Stats Error:', error);
    return res.status(500).json({
      message: 'Internal server error while fetching stats'
    });
  }
};