-- Multi-tenant core: adds a users table and a nullable user_id column to
-- every user-owned table. Deliberately additive/non-breaking: user_id is
-- nullable for now so existing data isn't destroyed. Run once in Neon's SQL
-- editor (one statement at a time if it complains about multiple commands
-- in a prepared statement).
--
-- IMPORTANT: this does NOT touch oauth_tokens or sync_state (Gmail sync
-- stays single-account for now, per the phased rollout) and does NOT yet
-- enforce NOT NULL / change primary keys -- that's migrations/006, to run
-- only after you've signed in once and backfilled your existing rows (see
-- SETUP.md for the exact backfill UPDATE).

CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  email        TEXT NOT NULL,
  name         TEXT,
  picture_url  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_expenses_user ON expenses(user_id);

ALTER TABLE budgets ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets(user_id);

ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

ALTER TABLE budget_alerts_sent ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_budget_alerts_sent_user ON budget_alerts_sent(user_id);
