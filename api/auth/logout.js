const { clearSessionCookie } = require("../_session");

module.exports = async (req, res) => {
  res.setHeader("Set-Cookie", clearSessionCookie());
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ ok: true }));
};
