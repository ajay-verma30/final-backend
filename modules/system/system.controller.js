const db = require('../../config/db');
const bcrypt = require('bcrypt');
const { SUPER } = require('../../constants/roles');

exports.bootstrapSuper = async (req, res) => {
  try {
    if (process.env.ALLOW_BOOTSTRAP !== 'true') {
      return res.status(403).json({ message: 'Bootstrap disabled' });
    }

    const systemKey = req.headers['x-system-key'];

    if (systemKey !== process.env.SYSTEM_KEY) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const [existing] = await db.query(
      'SELECT id FROM users WHERE role = ?',
      [SUPER]
    );

    if (existing.length > 0) {
      return res.status(403).json({ message: 'Super already exists' });
    }

    const { first_name, last_name, email, password } = req.body;

    const hashed = await bcrypt.hash(password, 10);
    const is_active = 1;

    await db.query(
      `INSERT INTO users 
       (first_name, last_name, email, password, role, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, 1, NOW())`,
      [first_name, last_name, email, hashed, SUPER, is_active]
    );

    res.json({ message: 'Super user created successfully' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};