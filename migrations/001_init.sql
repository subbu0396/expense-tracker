-- Spend Ledger schema. Run this once against your Neon Postgres database
-- (Vercel dashboard -> Storage tab -> your database -> "SQL Editor" / "Query"),
-- after provisioning the Neon Postgres integration for this project.

CREATE TABLE IF NOT EXISTS expenses (
  id                TEXT PRIMARY KEY,
  amount            NUMERIC(12,2) NOT NULL,
  category          TEXT NOT NULL CHECK (category IN ('travel','creditcard','groceries','ott','food')),
  note              TEXT NOT NULL DEFAULT '',
  date              DATE NOT NULL,
  source            TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','gmail')),
  status            TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','pending','rejected')),
  gmail_message_id  TEXT UNIQUE,
  raw_snippet       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);

CREATE TABLE IF NOT EXISTS oauth_tokens (
  id                    INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  refresh_token         TEXT,
  access_token          TEXT,
  access_token_expiry   TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_state (
  id                INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_synced_at    TIMESTAMPTZ,
  last_history_id   TEXT
);
