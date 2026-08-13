// GET returns the VAPID public key (used to build a push subscription);
// POST stores a subscription for the logged-in user. Merged into one file
// to stay under Vercel Hobby's 12-function cap -- see the note in
// api/auth/login.js.
const { sql } = require("./_db");
const { getSessionUser } = require("./_session");

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

async function handleGet(req, res) {
  res.setHeader("Content-Type", "application/json");
  const key = process.env.VAPID_PUBLIC_KEY || null;
  res.end(JSON.stringify({ publicKey: key }));
}

async function handlePost(req, res, userId) {
  if (!userId) {
    res.statusCode = 401;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "unauthorized" }));
  }

  const body = req.body || {};
  const endpoint = body.endpoint;
  const keys = body.keys || {};

  if (!endpoint || !keys.p256dh || !keys.auth) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "invalid subscription" }));
  }

  const db = sql();
  await db`
    INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, user_id) VALUES (${uid()}, ${endpoint}, ${keys.p256dh}, ${keys.auth}, ${userId})
    ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, user_id = EXCLUDED.user_id
  `;

  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ ok: true }));
}

module.exports = async (req, res) => {
  try {
    if (req.method === "GET") return await handleGet(req, res);
    if (req.method === "POST") return await handlePost(req, res, getSessionUser(req));
    res.statusCode = 405;
    res.end("Method not allowed");
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: e.message }));
  }
};
