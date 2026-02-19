const db = require('../../config/db');

exports.savePlacements = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { product_id, placements } = req.body; // placements is an array of logo positions
        const currentUser = req.user;

        if (!product_id || !Array.isArray(placements)) {
            return res.status(400).json({ message: "Invalid data" });
        }

        // Security Check: Kya user is product ko modify kar sakta hai?
        const [product] = await db.query('SELECT org_id FROM products WHERE id = ?', [product_id]);
        if (!product.length) return res.status(404).json({ message: "Product not found" });

        if (currentUser.role === 'ADMIN' && product[0].org_id !== currentUser.org_id) {
            return res.status(403).json({ message: "Unauthorized" });
        }

        await connection.beginTransaction();

        // Pehle purane placements delete karte hain (re-syncing)
        await connection.query('DELETE FROM placements WHERE product_id = ?', [product_id]);

        // Naye placements insert karte hain
        for (const p of placements) {
            await connection.query(
                `INSERT INTO placements 
                (product_id, logo_id, side, position_x_percent, position_y_percent, width_percent, height_percent, created_by) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [product_id, p.logo_id, p.side || 'FRONT', p.x, p.y, p.w, p.h, currentUser.id]
            );
        }

        await connection.commit();
        res.json({ message: "Placements saved successfully" });
    } catch (err) {
        await connection.rollback();
        console.error(err);
        res.status(500).json({ message: "Server error" });
    } finally {
        connection.release();
    }
};

exports.getPlacements = async (req, res) => {
    try {
        const { product_id } = req.params;
        const [rows] = await db.query(
            `SELECT p.*, l.title as logo_title, lv.image_url as logo_image 
             FROM placements p
             JOIN logos l ON p.logo_id = l.id
             JOIN logo_variants lv ON l.id = lv.logo_id
             WHERE p.product_id = ? 
             GROUP BY p.id`, 
            [product_id]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: "Error fetching placements" });
    }
};