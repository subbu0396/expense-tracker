const { sql } = require("../_db");

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.statusCode = 405;
      return res.end("Method not allowed");
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
      INSERT INTO push_subscriptions (id, endpoint, p256dh, auth) VALUES (${uid()}, ${endpoint}, ${keys.p256dh}, ${keys.auth})
      ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth
    `;

    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true }));
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: e.message }));
  }
};
