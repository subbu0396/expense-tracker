const crypto = require("crypto");
const { google } = require("googleapis");
const { sign, createSessionCookie, parseCookies } = require("../../_session");
const { sql } = require("../../_db");

function verifyState(state, cookieState) {
  if (!state || !cookieState || state !== cookieState) return false;
  const dot = state.lastIndexOf(".");
  if (dot === -1) return false;
  const nonce = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expected = sign(nonce);
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch (e) {
    return false;
  }
}

module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, `https://${req.headers.host}`);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    const cookies = parseCookies(req.headers.cookie);
    const clearStateCookie = "sl_login_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";

    if (error || !verifyState(state, cookies.sl_login_state) || !code) {
      res.setHeader("Set-Cookie", clearStateCookie);
      res.writeHead(302, { Location: "/?login=failed" });
      return res.end();
    }

    const redirectUri = `https://${req.headers.host}/api/auth/login/callback`;
    const client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, redirectUri);
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const { data: profile } = await oauth2.userinfo.get();

    if (!profile.id || !profile.email) {
      res.writeHead(302, { Location: "/?login=failed" });
      return res.end();
    }

    const db = sql();
    await db`
      INSERT INTO users (id, email, name, picture_url) VALUES (${profile.id}, ${profile.email}, ${profile.name || null}, ${profile.picture || null})
      ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, picture_url = EXCLUDED.picture_url
    `;

    const sessionCookie = createSessionCookie(profile.id);
    res.setHeader("Set-Cookie", [clearStateCookie, sessionCookie]);

    res.writeHead(302, { Location: "/" });
    res.end();
  } catch (e) {
    res.statusCode = 500;
    res.end("Sign-in failed: " + e.message);
  }
};
