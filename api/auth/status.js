const { isConnected } = require("../_gmail");
const { getSessionUser } = require("../_session");

module.exports = async (req, res) => {
  try {
    const userId = getSessionUser(req);
    const connected = userId ? await isConnected(userId) : false;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ connected }));
  } catch (e) {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ connected: false }));
  }
};
