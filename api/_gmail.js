const { google } = require("googleapis");
const { sql } = require("./_db");
const { encrypt, decrypt } = require("./_crypto");

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

function getAuthUrl(state) {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state
  });
}

async function saveTokens(tokens) {
  const db = sql();
  const refreshEnc = tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined;
  const accessEnc = tokens.access_token ? encrypt(tokens.access_token) : null;
  const expiry = tokens.expiry_date ? new Date(tokens.expiry_date) : null;

  if (refreshEnc) {
    await db`
      INSERT INTO oauth_tokens (id, refresh_token, access_token, access_token_expiry, updated_at)
      VALUES (1, ${refreshEnc}, ${accessEnc}, ${expiry}, now())
      ON CONFLICT (id) DO UPDATE SET
        refresh_token = EXCLUDED.refresh_token,
        access_token = EXCLUDED.access_token,
        access_token_expiry = EXCLUDED.access_token_expiry,
        updated_at = now()
    `;
  } else {
    // Token refresh usually only returns a new access token, not a new refresh token.
    await db`
      UPDATE oauth_tokens
      SET access_token = ${accessEnc}, access_token_expiry = ${expiry}, updated_at = now()
      WHERE id = 1
    `;
  }
}

async function loadTokenRow() {
  const db = sql();
  const rows = await db`SELECT refresh_token, access_token, access_token_expiry FROM oauth_tokens WHERE id = 1`;
  return rows[0] || null;
}

async function isConnected() {
  const row = await loadTokenRow();
  return !!(row && row.refresh_token);
}

/**
 * Returns an authenticated OAuth2 client with credentials set, refreshing
 * (and persisting) the access token as needed. Throws if not connected.
 */
async function getAuthorizedClient() {
  const row = await loadTokenRow();
  if (!row || !row.refresh_token) {
    const err = new Error("Gmail not connected");
    err.code = "NOT_CONNECTED";
    throw err;
  }

  const client = getOAuthClient();
  client.setCredentials({
    refresh_token: decrypt(row.refresh_token),
    access_token: row.access_token ? decrypt(row.access_token) : undefined,
    expiry_date: row.access_token_expiry ? new Date(row.access_token_expiry).getTime() : undefined
  });

  client.on("tokens", (tokens) => {
    saveTokens(tokens).catch(() => {});
  });

  // Force a refresh if we have no cached access token or it's expired/near-expiry.
  const expiry = row.access_token_expiry ? new Date(row.access_token_expiry).getTime() : 0;
  if (!row.access_token || Date.now() > expiry - 60000) {
    const { credentials } = await client.refreshAccessToken();
    client.setCredentials(credentials);
    await saveTokens(credentials);
  }

  return client;
}

function getGmailClient(authClient) {
  return google.gmail({ version: "v1", auth: authClient });
}

module.exports = { getOAuthClient, getAuthUrl, saveTokens, isConnected, getAuthorizedClient, getGmailClient, SCOPES };
