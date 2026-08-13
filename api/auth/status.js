const { isConnected } = require("../_gmail");

module.exports = async (req, res) => {
  try {
    const connected = await isConnected();
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ connected }));
  } catch (e) {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ connected: false }));
  }
};
