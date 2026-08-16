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

async function saveTokens(userId, tokens) {
  const db = sql();
  const refreshEnc = tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined;
  const accessEnc = tokens.access_token ? encrypt(tokens.access_token) : null;
  const expiry = tokens.expiry_date ? new Date(tokens.expiry_date) : null;

  if (refreshEnc) {
    await db`
      INSERT INTO oauth_tokens (user_id, refresh_token, access_token, access_token_expiry, updated_at)
      VALUES (${userId}, ${refreshEnc}, ${accessEnc}, ${expiry}, now())
      ON CONFLICT (user_id) DO UPDATE SET
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
      WHERE user_id = ${userId}
    `;
  }
}

async function loadTokenRow(userId) {
  const db = sql();
  const rows = await db`SELECT refresh_token, access_token, access_token_expiry FROM oauth_tokens WHERE user_id = ${userId}`;
  return rows[0] || null;
}

async function isConnected(userId) {
  const row = await loadTokenRow(userId);
  return !!(row && row.refresh_token);
}

async function connectedUserIds() {
  const db = sql();
  const rows = await db`SELECT user_id FROM oauth_tokens WHERE refresh_token IS NOT NULL`;
  return rows.map((r) => r.user_id);
}

/**
 * Returns an authenticated OAuth2 client with credentials set, refreshing
 * (and persisting) the access token as needed. Throws if not connected.
 */
async function getAuthorizedClient(userId) {
  const row = await loadTokenRow(userId);
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
    saveTokens(userId, tokens).catch(() => {});
  });

  // Force a refresh if we have no cached access token or it's expired/near-expiry.
  const expiry = row.access_token_expiry ? new Date(row.access_token_expiry).getTime() : 0;
  if (!row.access_token || Date.now() > expiry - 60000) {
    const { credentials } = await client.refreshAccessToken();
    client.setCredentials(credentials);
    await saveTokens(userId, credentials);
  }

  return client;
}

function getGmailClient(authClient) {
  return google.gmail({ version: "v1", auth: authClient });
}

module.exports = { getOAuthClient, getAuthUrl, saveTokens, isConnected, connectedUserIds, getAuthorizedClient, getGmailClient, SCOPES };
