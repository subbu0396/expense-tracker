const { sql } = require("./_db");
const { getAuthorizedClient, getGmailClient } = require("./_gmail");
const { parseEmail, GMAIL_SEARCH_QUERY } = require("./_parsers");

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function decodeBase64Url(data) {
  if (!data) return "";
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function stripHtml(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function extractBody(payload) {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body && payload.body.data) {
    return decodeBase64Url(payload.body.data);
  }
  if (payload.mimeType === "text/html" && payload.body && payload.body.data) {
    return stripHtml(decodeBase64Url(payload.body.data));
  }
  if (payload.parts) {
    const plain = payload.parts.find((p) => p.mimeType === "text/plain");
    if (plain && plain.body && plain.body.data) return decodeBase64Url(plain.body.data);
    for (const part of payload.parts) {
      const nested = extractBody(part);
      if (nested) return nested;
    }
  }
  return "";
}

function getHeader(headers, name) {
  const h = (headers || []).find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : "";
}

function extractFromAddress(fromHeader) {
  const m = /<([^>]+)>/.exec(fromHeader || "");
  return m ? m[1] : (fromHeader || "");
}

async function runSync(sinceOverride) {
  const authClient = await getAuthorizedClient();
  const gmail = getGmailClient(authClient);
  const db = sql();

  let afterDate;
  if (sinceOverride) {
    afterDate = sinceOverride;
  } else {
    const stateRows = await db`SELECT last_synced_at FROM sync_state WHERE id = 1`;
    const lastSyncedAt = stateRows[0] && stateRows[0].last_synced_at;
    afterDate = lastSyncedAt ? new Date(lastSyncedAt) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  }
  const afterEpoch = Math.floor(afterDate.getTime() / 1000);

  const query = `${GMAIL_SEARCH_QUERY} after:${afterEpoch}`;

  let added = 0;
  let skipped = 0;
  let pageToken;

  do {
    const listRes = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: 50,
      pageToken
    });
    const messages = listRes.data.messages || [];

    for (const msgRef of messages) {
      const existing = await db`SELECT id FROM expenses WHERE gmail_message_id = ${msgRef.id}`;
      if (existing.length > 0) continue;

      const full = await gmail.users.messages.get({ userId: "me", id: msgRef.id, format: "full" });
      const headers = full.data.payload && full.data.payload.headers;
      const fromAddress = extractFromAddress(getHeader(headers, "From"));
      const subject = getHeader(headers, "Subject");
      const dateHeader = getHeader(headers, "Date");
      const body = extractBody(full.data.payload);

      const parsed = parseEmail({ fromAddress, subject, body, dateHeader });
      if (!parsed) {
        skipped++;
        continue;
      }

      await db`
        INSERT INTO expenses (id, amount, category, note, date, source, status, gmail_message_id, raw_snippet)
        VALUES (${uid()}, ${parsed.amount}, ${parsed.category}, ${parsed.note}, ${parsed.date}, 'gmail', 'pending', ${msgRef.id}, ${parsed.snippet})
        ON CONFLICT (gmail_message_id) DO NOTHING
      `;
      added++;
    }

    pageToken = listRes.data.nextPageToken;
  } while (pageToken);

  await db`
    INSERT INTO sync_state (id, last_synced_at) VALUES (1, now())
    ON CONFLICT (id) DO UPDATE SET last_synced_at = now()
  `;

  return { added, skipped };
}

function isAuthorizedCronCall(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured -> skip this check (Vercel's cron is already unguessable + internal)
  const auth = req.headers.authorization || "";
  return auth === `Bearer ${secret}`;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      res.statusCode = 405;
      return res.end("Method not allowed");
    }
    if (req.method === "GET" && !isAuthorizedCronCall(req)) {
      res.statusCode = 401;
      return res.end("Unauthorized");
    }

    const url = new URL(req.url, `https://${req.headers.host}`);
    const sinceParam = url.searchParams.get("since") || (req.body && req.body.since);
    let sinceOverride = null;
    if (sinceParam) {
      const parsed = new Date(sinceParam);
      if (isNaN(parsed.getTime())) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ error: "invalid since date" }));
      }
      sinceOverride = parsed;
    }

    const result = await runSync(sinceOverride);
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(result));
  } catch (e) {
    if (e.code === "NOT_CONNECTED") {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: "not_connected" }));
    }
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: e.message }));
  }
};
