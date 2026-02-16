const db = require('../../config/db');

exports.getOrCreateCart = async (connection, user, sessionId) => {

  if (!user && !sessionId) {
    throw new Error("Session ID required for guest");
  }
  if (user) {
    const [existing] = await connection.query(
      `SELECT * FROM carts WHERE user_id = ? LIMIT 1`,
      [user.id]
    );

    if (existing.length) return existing[0];

    const [result] = await connection.query(
      `INSERT INTO carts (user_id, org_id)
       VALUES (?, ?)`,
      [user.id, user.org_id]
    );

    return { id: result.insertId };
  }
  const [existing] = await connection.query(
    `SELECT * FROM carts WHERE session_id = ? LIMIT 1`,
    [sessionId]
  );

  if (existing.length) return existing[0];

  const [result] = await connection.query(
    `INSERT INTO carts (session_id)
     VALUES (?)`,
    [sessionId]
  );

  return { id: result.insertId };
};


// merge guest 

exports.mergeGuestCart = async (connection, user, sessionId) => {

  if (!sessionId || !user) return;
  const [guestCart] = await connection.query(
    `SELECT * FROM carts WHERE session_id = ? LIMIT 1`,
    [sessionId]
  );

  if (!guestCart.length) return;

  const [userCart] = await connection.query(
    `SELECT * FROM carts WHERE user_id = ? LIMIT 1`,
    [user.id]
  );

  if (!userCart.length) {

    await connection.query(
      `UPDATE carts
       SET user_id = ?, session_id = NULL
       WHERE id = ?`,
      [user.id, guestCart[0].id]
    );

    return;
  }
  const [guestItems] = await connection.query(
    `SELECT * FROM cart_items WHERE cart_id = ?`,
    [guestCart[0].id]
  );

  for (let item of guestItems) {

    const [existing] = await connection.query(
      `SELECT * FROM cart_items
       WHERE cart_id = ?
       AND product_variant_id = ?`,
      [userCart[0].id, item.product_variant_id]
    );

    if (existing.length) {
      await connection.query(
        `UPDATE cart_items
         SET quantity = quantity + ?
         WHERE id = ?`,
        [item.quantity, existing[0].id]
      );

      await connection.query(
        `DELETE FROM cart_items WHERE id = ?`,
        [item.id]
      );

    } else {

      await connection.query(
        `UPDATE cart_items
         SET cart_id = ?
         WHERE id = ?`,
        [userCart[0].id, item.id]
      );
    }
  }

  await connection.query(
    `DELETE FROM carts WHERE id = ?`,
    [guestCart[0].id]
  );
};