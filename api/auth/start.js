const crypto = require("crypto");
const { getAuthUrl } = require("../_gmail");

function signState(nonce) {
  const secret = process.env.OAUTH_STATE_SECRET || "";
  const sig = crypto.createHmac("sha256", secret).update(nonce).digest("hex");
  return `${nonce}.${sig}`;
}

module.exports = async (req, res) => {
  try {
    const nonce = crypto.randomBytes(16).toString("hex");
    const state = signState(nonce);

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
