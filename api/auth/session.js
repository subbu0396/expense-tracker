const { getSessionUser } = require("../_session");
const { sql } = require("../_db");

module.exports = async (req, res) => {
  try {
    const userId = getSessionUser(req);
    res.setHeader("Content-Type", "application/json");
    if (!userId) return res.end(JSON.stringify({ user: null }));

    const db = sql();
    const rows = await db`SELECT id, email, name, picture_url FROM users WHERE id = ${userId}`;
    if (rows.length === 0) return res.end(JSON.stringify({ user: null }));

    const u = rows[0];
    res.end(JSON.stringify({ user: { id: u.id, email: u.email, name: u.name, pictureUrl: u.picture_url } }));
  } catch (e) {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ user: null }));
  }
};
