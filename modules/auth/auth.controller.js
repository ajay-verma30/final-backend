const db = require('../../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

exports.login = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const { email, password } = req.body;

    const [users] = await connection.query(
      'SELECT * FROM users WHERE email = ? AND deleted_at IS NULL',
      [email]
    );

    if (!users.length) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const user = users[0];

    if (!user.is_active) {
      return res.status(403).json({ message: 'Account inactive' });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const accessToken = jwt.sign(
      {
        id: user.id,
        role: user.role,
        org_id: user.org_id
      },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    const refreshToken = jwt.sign(
      { id: user.id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await connection.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
      [user.id, refreshToken, expiresAt]
    );

    res.json({
      accessToken,
      refreshToken
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  } finally {
    connection.release();
  }
};


exports.refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ message: 'Refresh token required' });
    }

    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET
    );

    const [tokens] = await db.query(
      'SELECT * FROM refresh_tokens WHERE token = ? AND expires_at > NOW()',
      [refreshToken]
    );

    if (!tokens.length) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    const [users] = await db.query(
      'SELECT id, role, org_id FROM users WHERE id = ? AND is_active = 1',
      [decoded.id]
    );

    if (!users.length) {
      return res.status(401).json({ message: 'User not valid' });
    }

    const user = users[0];

    const newAccessToken = jwt.sign(
      {
        id: user.id,
        role: user.role,
        org_id: user.org_id
      },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.json({ accessToken: newAccessToken });

  } catch (err) {
    return res.status(401).json({ message: 'Invalid refresh token' });
  }
};



exports.setPassword = async (req, res) => {
  const { token, newPassword } = req.body;

  const tokenHash = require('crypto')
    .createHash('sha256')
    .update(token)
    .digest('hex');

  const [records] = await db.query(
    `SELECT * FROM password_resets 
     WHERE token_hash = ? AND expires_at > NOW() AND used_at IS NULL`,
    [tokenHash]
  );

  if (!records.length) {
    return res.status(400).json({ message: 'Invalid or expired token' });
  }

  const userId = records[0].user_id;

  const hashedPassword = await require('bcrypt').hash(newPassword, 10);

  await db.query(
    'UPDATE users SET password = ?, is_active = 1 WHERE id = ?',
    [hashedPassword, userId]
  );

  await db.query(
    'UPDATE password_resets SET used_at = NOW() WHERE id = ?',
    [records[0].id]
  );

  res.json({ message: 'Password set successfully' });
};