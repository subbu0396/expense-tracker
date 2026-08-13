const { neon } = require("@neondatabase/serverless");

let sqlClient = null;

function sql() {
  if (!sqlClient) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    sqlClient = neon(url);
  }
  return sqlClient;
}

module.exports = { sql };
