const crypto = require("crypto");
const { google } = require("googleapis");
const { sign } = require("../../_session");

module.exports = async (req, res) => {
  try {
    const nonce = crypto.randomBytes(16).toString("hex");
    const state = nonce + "." + sign(nonce);

    res.setHeader(
      "Set-Cookie",
      `sl_login_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
    );

    const redirectUri = `https://${req.headers.host}/api/auth/login/callback`;
    const client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, redirectUri);
    const url = client.generateAuthUrl({
      scope: ["openid", "email", "profile"],
      state
    });

    res.writeHead(302, { Location: url });
    res.end();
  } catch (e) {
    res.statusCode = 500;
    res.end("Failed to start sign-in: " + e.message);
  }
};
