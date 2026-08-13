module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  const key = process.env.VAPID_PUBLIC_KEY || null;
  res.end(JSON.stringify({ publicKey: key }));
};
