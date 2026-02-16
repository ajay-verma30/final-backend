const jwt = require('jsonwebtoken');
const db = require('../config/db');

exports.authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const [users] = await db.query(
      'SELECT id, role, org_id, is_active, deleted_at FROM users WHERE id = ?',
      [decoded.id]
    );

    if (!users.length || !users[0].is_active || users[0].deleted_at !== null) {
      return res.status(401).json({ message: 'Invalid user' });
    }

    req.user = users[0];

    next();

  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};


exports.logout = async (req, res) => {
  try {
    const currentUser = req.user;
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ message: 'Refresh token required' });
    }

    await db.query(
      'DELETE FROM refresh_tokens WHERE token = ? AND user_id = ?',
      [refreshToken, currentUser.id]
    );

    res.json({ message: 'Logged out successfully' });

  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};