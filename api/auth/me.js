// GET returns the current session's user (or {user: null}); DELETE logs out.
// Merged into one file to stay under Vercel Hobby's 12-function cap -- see
// the note in api/auth/login.js.
const { getSessionUser, clearSessionCookie } = require("../_session");
const { sql } = require("../_db");

async function handleGet(req, res) {
  const userId = getSessionUser(req);
  res.setHeader("Content-Type", "application/json");
  if (!userId) return res.end(JSON.stringify({ user: null }));

  const db = sql();
  const rows = await db`SELECT id, email, name, picture_url FROM users WHERE id = ${userId}`;
  if (rows.length === 0) return res.end(JSON.stringify({ user: null }));

  const u = rows[0];
  res.end(JSON.stringify({ user: { id: u.id, email: u.email, name: u.name, pictureUrl: u.picture_url } }));
}

async function handleDelete(req, res) {
  res.setHeader("Set-Cookie", clearSessionCookie());
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ ok: true }));
}

module.exports = async (req, res) => {
  try {
    if (req.method === "GET") return await handleGet(req, res);
    if (req.method === "DELETE") return await handleDelete(req, res);
    res.statusCode = 405;
    res.end("Method not allowed");
  } catch (e) {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ user: null }));
  }
};
