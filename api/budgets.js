const { sql } = require("./_db");
const { getSessionUser } = require("./_session");

const CATEGORIES = ["travel", "creditcard", "groceries", "ott", "food", "upidebit"];

function unauthorized(res) {
  res.statusCode = 401;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: "unauthorized" }));
}

async function handleGet(req, res, userId) {
  const db = sql();
  const rows = await db`SELECT category, monthly_limit FROM budgets WHERE user_id = ${userId}`;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(rows.map((r) => ({ category: r.category, monthlyLimit: Number(r.monthly_limit) }))));
}

async function handlePut(req, res, userId) {
  const body = req.body || {};
  const category = body.category;
  const monthlyLimit = body.monthlyLimit === null ? null : parseFloat(body.monthlyLimit);

  if (!CATEGORIES.includes(category)) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "invalid category" }));
  }

  const db = sql();

  if (monthlyLimit === null || !monthlyLimit || monthlyLimit <= 0) {
    await db`DELETE FROM budgets WHERE user_id = ${userId} AND category = ${category}`;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ category, monthlyLimit: null }));
  }

  // Explicit check-then-write rather than INSERT ... ON CONFLICT: the
  // (user_id, category) uniqueness isn't a real constraint yet (see
  // migrations/006_enforce_user_id.sql, applied after the multi-tenant
  // backfill), so an ON CONFLICT target here would be unreliable until then.
  const existing = await db`SELECT 1 FROM budgets WHERE user_id = ${userId} AND category = ${category}`;
  if (existing.length > 0) {
    await db`UPDATE budgets SET monthly_limit = ${monthlyLimit}, updated_at = now() WHERE user_id = ${userId} AND category = ${category}`;
  } else {
    await db`INSERT INTO budgets (category, monthly_limit, user_id, updated_at) VALUES (${category}, ${monthlyLimit}, ${userId}, now())`;
  }

  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ category, monthlyLimit }));
}

module.exports = async (req, res) => {
  try {
    const userId = getSessionUser(req);
    if (!userId) return unauthorized(res);

    if (req.method === "GET") return await handleGet(req, res, userId);
    if (req.method === "PUT") return await handlePut(req, res, userId);
    res.statusCode = 405;
    res.end("Method not allowed");
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: e.message }));
  }
};
