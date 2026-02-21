const db = require('../../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const emailService = require('../../src/services/email.service');
const crypto = require('crypto');

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
      { id: user.id, role: user.role, org_id: user.org_id, email: user.email },
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

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // true in prod, false in dev
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      message: 'Login successful',
      accessToken,
      user: {
        id: user.id,
        firstName: user.first_name,
        role: user.role,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  } finally {
    connection.release();
  }
};

// ── FIXED: reads refreshToken from cookie, not req.body ──────────────────────
exports.refresh = async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken; // ← was req.body.refreshToken

    if (!refreshToken) {
      return res.status(401).json({ message: 'Refresh token required' });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    const [tokens] = await db.query(
      'SELECT * FROM refresh_tokens WHERE token = ? AND expires_at > NOW()',
      [refreshToken]
    );

    if (!tokens.length) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    const [users] = await db.query(
      'SELECT id, role, org_id, email FROM users WHERE id = ? AND is_active = 1',
      [decoded.id]
    );

    if (!users.length) {
      return res.status(401).json({ message: 'User not valid' });
    }

    const user = users[0];

    const newAccessToken = jwt.sign(
      { id: user.id, role: user.role, org_id: user.org_id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.json({ accessToken: newAccessToken });

  } catch (err) {
    console.error('REFRESH ERROR:', err);
    return res.status(401).json({ message: 'Invalid refresh token' });
  }
};

// ── NEW: logout clears cookie and removes token from DB ──────────────────────
exports.logout = async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken;

    if (refreshToken) {
      await db.query('DELETE FROM refresh_tokens WHERE token = ?', [refreshToken]);
    }

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
    });

    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('LOGOUT ERROR:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.setPassword = async (req, res) => {
  const { token, newPassword } = req.body;

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const [records] = await db.query(
    `SELECT * FROM password_resets 
     WHERE token_hash = ? AND expires_at > NOW() AND used_at IS NULL`,
    [tokenHash]
  );

  if (!records.length) {
    return res.status(400).json({ message: 'Invalid or expired token' });
  }

  const userId = records[0].user_id;
  const hashedPassword = await bcrypt.hash(newPassword, 10);

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

exports.forgotPassword = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { email } = req.body;

    const [users] = await connection.query(
      'SELECT id, first_name FROM users WHERE email = ? AND deleted_at IS NULL',
      [email]
    );

    if (!users.length) {
      return res.status(404).json({ message: 'User with this email does not exist' });
    }

    const user = users[0];
    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    await connection.query(
      'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
      [user.id, tokenHash, expiresAt]
    );

    const resetLink = `${process.env.FRONTEND_URL}/set-password?token=${resetToken}`;
    await emailService.sendForgotPasswordEmail(email, user.first_name, resetLink);

    res.json({ message: 'Password reset link has been sent to your email.' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  } finally {
    connection.release();
  }
};