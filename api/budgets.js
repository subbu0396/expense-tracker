const { sql } = require("./_db");

const CATEGORIES = ["travel", "creditcard", "groceries", "ott", "food", "upidebit"];

async function handleGet(req, res) {
  const db = sql();
  const rows = await db`SELECT category, monthly_limit FROM budgets`;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(rows.map((r) => ({ category: r.category, monthlyLimit: Number(r.monthly_limit) }))));
}

async function handlePut(req, res) {
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
    await db`DELETE FROM budgets WHERE category = ${category}`;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ category, monthlyLimit: null }));
  }

  await db`
    INSERT INTO budgets (category, monthly_limit, updated_at) VALUES (${category}, ${monthlyLimit}, now())
    ON CONFLICT (category) DO UPDATE SET monthly_limit = EXCLUDED.monthly_limit, updated_at = now()
  `;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ category, monthlyLimit }));
}

module.exports = async (req, res) => {
  try {
    if (req.method === "GET") return await handleGet(req, res);
    if (req.method === "PUT") return await handlePut(req, res);
    res.statusCode = 405;
    res.end("Method not allowed");
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: e.message }));
  }
};
