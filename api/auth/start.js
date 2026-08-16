const crypto = require("crypto");
const { getAuthUrl } = require("../_gmail");
const { getSessionUser } = require("../_session");

function signState(nonce, userId) {
  const secret = process.env.OAUTH_STATE_SECRET || "";
  const payload = `${nonce}.${userId}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

module.exports = async (req, res) => {
  try {
    const userId = getSessionUser(req);
    if (!userId) {
      res.writeHead(302, { Location: "/?gmail=login_required" });
      return res.end();
    }

    const nonce = crypto.randomBytes(16).toString("hex");
    const state = signState(nonce, userId);

    res.setHeader(
      "Set-Cookie",
      `sl_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
    );

    const url = getAuthUrl(state);
    res.writeHead(302, { Location: url });
    res.end();
  } catch (e) {
    res.statusCode = 500;
    res.end("Failed to start Google OAuth: " + e.message);
  }
};
