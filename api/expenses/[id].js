const { sql } = require("../_db");
const { checkAndAlert } = require("../_budgetAlerts");
const { getSessionUser } = require("../_session");

const CATEGORIES = ["travel", "creditcard", "groceries", "ott", "food", "upidebit"];

function getId(req) {
  if (req.query && req.query.id) return req.query.id;
  const url = new URL(req.url, `https://${req.headers.host}`);
  const parts = url.pathname.split("/").filter(Boolean);
  return parts[parts.length - 1];
}

function unauthorized(res) {
  res.statusCode = 401;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: "unauthorized" }));
}

async function handlePatch(req, res, id, userId) {
  const body = req.body || {};
  const db = sql();

  const existingRows = await db`SELECT id, category, status FROM expenses WHERE id = ${id} AND user_id = ${userId}`;
  if (existingRows.length === 0) {
    res.statusCode = 404;
    return res.end(JSON.stringify({ error: "not found" }));
  }
  const existing = existingRows[0];

  if (body.status === "rejected") {
    await db`UPDATE expenses SET status = 'rejected' WHERE id = ${id} AND user_id = ${userId}`;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ id, status: "rejected" }));
  }

  const category = body.category;
  if (category && !CATEGORIES.includes(category)) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "invalid category" }));
  }

  const amount = body.amount !== undefined ? parseFloat(body.amount) : null;
  const note = body.note !== undefined ? String(body.note).slice(0, 200) : null;
  const date = body.date !== undefined ? body.date : null;
  const nextStatus = body.status === "confirmed" ? "confirmed" : null;

  await db`
    UPDATE expenses SET
      category = COALESCE(${category}, category),
      amount = COALESCE(${amount}, amount),
      note = COALESCE(${note}, note),
      date = COALESCE(${date}, date),
      status = COALESCE(${nextStatus}, status)
    WHERE id = ${id} AND user_id = ${userId}
  `;

  const finalStatus = nextStatus || existing.status;
  const finalCategory = category || existing.category;
  if (finalStatus === "confirmed") {
    await checkAndAlert(userId, finalCategory);
  }

  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ id, ok: true }));
}

async function handleDelete(req, res, id, userId) {
  const db = sql();
  await db`DELETE FROM expenses WHERE id = ${id} AND user_id = ${userId}`;
  res.statusCode = 204;
  res.end();
}

module.exports = async (req, res) => {
  try {
    const userId = getSessionUser(req);
    if (!userId) return unauthorized(res);

    const id = getId(req);
    if (!id) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "missing id" }));
    }
    if (req.method === "PATCH") return await handlePatch(req, res, id, userId);
    if (req.method === "DELETE") return await handleDelete(req, res, id, userId);
    res.statusCode = 405;
    res.end("Method not allowed");
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: e.message }));
  }
};
