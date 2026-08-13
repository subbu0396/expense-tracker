const { sql } = require("../_db");
const { checkAndAlert } = require("../_budgetAlerts");

const CATEGORIES = ["travel", "creditcard", "groceries", "ott", "food", "upidebit"];

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

async function handleGet(req, res) {
  const url = new URL(req.url, `https://${req.headers.host}`);
  const status = url.searchParams.get("status");
  const month = url.searchParams.get("month");
  const category = url.searchParams.get("category");
  const q = url.searchParams.get("q");

  const db = sql();
  const rows = await db`
    SELECT id, amount, category, note, date, source, status, gmail_message_id, raw_snippet
    FROM expenses
    WHERE (${status}::text IS NULL OR status = ${status})
      AND (${month}::text IS NULL OR to_char(date, 'YYYY-MM') = ${month})
      AND (${category}::text IS NULL OR category = ${category})
      AND (${q}::text IS NULL OR note ILIKE '%' || ${q} || '%')
    ORDER BY date DESC, created_at DESC
  `;

  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(rows.map((r) => ({
    id: r.id,
    amount: Number(r.amount),
    category: r.category,
    note: r.note,
    date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : r.date,
    source: r.source,
    status: r.status,
    snippet: r.raw_snippet
  }))));
}

async function handlePost(req, res) {
  const body = req.body || {};
  const amount = parseFloat(body.amount);
  const category = body.category;
  const note = (body.note || "").toString().slice(0, 200);
  const date = body.date;

  if (!amount || amount <= 0) return badRequest(res, "amount must be a positive number");
  if (!CATEGORIES.includes(category)) return badRequest(res, "invalid category");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return badRequest(res, "date must be YYYY-MM-DD");

  const id = uid();
  const db = sql();
  await db`
    INSERT INTO expenses (id, amount, category, note, date, source, status)
    VALUES (${id}, ${amount}, ${category}, ${note}, ${date}, 'manual', 'confirmed')
  `;

  await checkAndAlert(category);

  res.statusCode = 201;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ id, amount, category, note, date, source: "manual", status: "confirmed" }));
}

function badRequest(res, message) {
  res.statusCode = 400;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: message }));
}

module.exports = async (req, res) => {
  try {
    if (req.method === "GET") return await handleGet(req, res);
    if (req.method === "POST") return await handlePost(req, res);
    res.statusCode = 405;
    res.end("Method not allowed");
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: e.message }));
  }
};
