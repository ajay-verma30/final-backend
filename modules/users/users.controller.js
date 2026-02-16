const db = require("../../config/db");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { sendPasswordSetupEmail } = require("../../src/services/email.service");
const { canManageUser } = require("../../utils/permission");

// ================= CREATE USER =================

exports.createUser = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const currentUser = req.user;
    const { first_name, last_name, email, role, org_id } = req.body;

    await connection.beginTransaction();

    let targetOrgId = org_id;

    // Role restrictions
    if (currentUser.role === "ADMIN") {
      if (role === "SUPER") {
        return res
          .status(403)
          .json({ message: "Admin cannot create SUPER user" });
      }
      targetOrgId = currentUser.org_id;
    }

    if (currentUser.role === "ENDUSER") {
      return res.status(403).json({ message: "Not allowed to create users" });
    }

    // Validate org
    if (targetOrgId) {
      const [org] = await connection.query(
        "SELECT id FROM organizations WHERE id = ? AND deleted_at IS NULL",
        [targetOrgId],
      );

      if (!org.length) {
        return res.status(400).json({ message: "Invalid organization" });
      }
    }

    // Email duplicate check
    const [existingUser] = await connection.query(
      "SELECT id FROM users WHERE email = ? AND deleted_at IS NULL",
      [email],
    );

    if (existingUser.length) {
      return res.status(409).json({ message: "Email already exists" });
    }

    const tempPassword = crypto.randomBytes(10).toString("hex");
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const [result] = await connection.query(
      `INSERT INTO users 
       (org_id, first_name, last_name, email, password, role, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [targetOrgId || null, first_name, last_name, email, hashedPassword, role],
    );

    const userId = result.insertId;

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    await connection.query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at)
       VALUES (?, ?, ?)`,
      [userId, tokenHash, expiresAt],
    );

    await connection.commit();

    const resetLink = `${process.env.FRONTEND_URL}/set-password?token=${rawToken}`;
    await sendPasswordSetupEmail(email, first_name, resetLink);

    return res.status(201).json({
      message: "User created. Password setup email sent.",
    });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  } finally {
    connection.release();
  }
};

// ================= GET USERS =================

exports.getUsers = async (req, res) => {
  try {
    const currentUser = req.user;

    let query =
      "SELECT id, first_name, last_name, email, role, org_id FROM users WHERE deleted_at IS NULL";
    let params = [];

    if (currentUser.role === "ADMIN") {
      query += " AND org_id = ?";
      params.push(currentUser.org_id);
    }

    if (currentUser.role === "ENDUSER") {
      query += " AND id = ?";
      params.push(currentUser.id);
    }

    const [users] = await db.query(query, params);
    return res.json(users);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};

// ================= UPDATE USER =================

exports.updateUser = async (req, res) => {
  try {
    const currentUser = req.user;
    const { id } = req.params;
    const { first_name, last_name } = req.body;

    const [users] = await db.query(
      "SELECT * FROM users WHERE id = ? AND deleted_at IS NULL",
      [id],
    );

    if (!users.length) {
      return res.status(404).json({ message: "User not found" });
    }

    const targetUser = users[0];

    if (!canManageUser(currentUser, targetUser)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    await db.query(
      "UPDATE users SET first_name = ?, last_name = ? WHERE id = ?",
      [first_name, last_name, id],
    );

    return res.json({ message: "User updated successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};

// ================= DELETE USER (Soft Delete) =================

exports.deleteUser = async (req, res) => {
  try {
    const currentUser = req.user;
    const { id } = req.params;

    const [users] = await db.query(
      "SELECT * FROM users WHERE id = ? AND deleted_at IS NULL",
      [id],
    );

    if (!users.length) {
      return res.status(404).json({ message: "User not found" });
    }

    const targetUser = users[0];
    if (currentUser.id === targetUser.id && currentUser.role === "SUPER") {
      return res.status(400).json({
        message: "SUPER cannot delete himself",
      });
    }
    if (!canManageUser(currentUser, targetUser)) {
      return res
        .status(403)
        .json({ message: "Not authorized to delete this user" });
    }

    await db.query("UPDATE users SET deleted_at = NOW() WHERE id = ?", [id]);

    return res.json({ message: "User deleted successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};
