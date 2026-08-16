-- Makes Gmail auto-import per-user. Previously oauth_tokens/sync_state were
-- singleton tables (id = 1) tied to whichever single account first ran the
-- Gmail connect flow. This scopes both to user_id so every signed-in user
-- can connect and sync their own Gmail independently.
--
-- Safe to run any time (no "sign in first" ordering constraint) -- it
-- backfills from data that already exists rather than requiring a fresh
-- table.

ALTER TABLE oauth_tokens ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id);
UPDATE oauth_tokens SET user_id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1) WHERE user_id IS NULL;
ALTER TABLE oauth_tokens ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE oauth_tokens DROP CONSTRAINT IF EXISTS oauth_tokens_pkey;
ALTER TABLE oauth_tokens DROP COLUMN IF EXISTS id;
ALTER TABLE oauth_tokens ADD PRIMARY KEY (user_id);

ALTER TABLE sync_state ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id);
UPDATE sync_state SET user_id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1) WHERE user_id IS NULL;
ALTER TABLE sync_state ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE sync_state DROP CONSTRAINT IF EXISTS sync_state_pkey;
ALTER TABLE sync_state DROP COLUMN IF EXISTS id;
ALTER TABLE sync_state ADD PRIMARY KEY (user_id);

ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_gmail_message_id_key;
ALTER TABLE expenses ADD CONSTRAINT expenses_user_gmail_message_id_key UNIQUE (user_id, gmail_message_id);
