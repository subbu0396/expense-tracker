const crypto = require("crypto");

const SESSION_COOKIE = "sl_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function sign(payload) {
  const secret = process.env.SESSION_SECRET || "";
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function parseCookies(header) {
  const out = {};
  (header || "").split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

function createSessionCookie(userId) {
  const expiry = Date.now() + SESSION_TTL_MS;
  const payload = userId + "." + expiry;
  const sig = sign(payload);
  const value = Buffer.from(payload, "utf8").toString("base64url") + "." + sig;
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/**
 * Returns the authenticated user's id, or null if there's no valid session.
 * Never throws -- a malformed/tampered cookie is just treated as logged-out.
 */
function getSessionUser(req) {
  try {
    const cookies = parseCookies(req.headers.cookie);
    const raw = cookies[SESSION_COOKIE];
    if (!raw) return null;

    const dot = raw.lastIndexOf(".");
    if (dot === -1) return null;
    const payloadB64 = raw.slice(0, dot);
    const sig = raw.slice(dot + 1);

    const payload = Buffer.from(payloadB64, "base64url").toString("utf8");
    const expected = sign(payload);

    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expected);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

    const lastDot = payload.lastIndexOf(".");
    if (lastDot === -1) return null;
    const userId = payload.slice(0, lastDot);
    const expiry = parseInt(payload.slice(lastDot + 1), 10);
    if (!userId || !expiry || Date.now() > expiry) return null;

    return userId;
  } catch (e) {
    return null;
  }
}

module.exports = { getSessionUser, createSessionCookie, clearSessionCookie, parseCookies, sign };
