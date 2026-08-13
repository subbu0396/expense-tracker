const crypto = require("crypto");
const { getOAuthClient, saveTokens } = require("../_gmail");

function parseCookies(header) {
  const out = {};
  (header || "").split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

function verifyState(state, cookieState) {
  if (!state || !cookieState || state !== cookieState) return false;
  const [nonce, sig] = state.split(".");
  if (!nonce || !sig) return false;
  const secret = process.env.OAUTH_STATE_SECRET || "";
  const expected = crypto.createHmac("sha256", secret).update(nonce).digest("hex");
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
    res.setHeader("Set-Cookie", "sl_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");

    if (error) {
      res.writeHead(302, { Location: "/?gmail=denied" });
      return res.end();
    }
    if (!verifyState(state, cookies.sl_oauth_state)) {
      res.writeHead(302, { Location: "/?gmail=state_mismatch" });
      return res.end();
    }
    if (!code) {
      res.writeHead(302, { Location: "/?gmail=missing_code" });
      return res.end();
    }

    const client = getOAuthClient();
    const { tokens } = await client.getToken(code);

    if (!tokens.refresh_token) {
      // Happens if the user has already granted consent before and Google
      // didn't re-issue a refresh token; ask them to revoke access at
      // https://myaccount.google.com/permissions and reconnect.
      res.writeHead(302, { Location: "/?gmail=no_refresh_token" });
      return res.end();
    }

    await saveTokens(tokens);

    res.writeHead(302, { Location: "/?gmail=connected" });
    res.end();
  } catch (e) {
    res.statusCode = 500;
    res.end("Google OAuth callback failed: " + e.message);
  }
};
