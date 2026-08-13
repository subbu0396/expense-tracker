-- Adds per-category monthly budgets and Web Push subscription storage for
-- budget-limit alerts. Run once in Neon's SQL editor (one statement at a
-- time if it complains about multiple commands in a prepared statement).

CREATE TABLE IF NOT EXISTS budgets (
  category       TEXT PRIMARY KEY CHECK (category IN ('travel','creditcard','groceries','ott','food','upidebit')),
  monthly_limit  NUMERIC(12,2) NOT NULL CHECK (monthly_limit > 0),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          TEXT PRIMARY KEY,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS budget_alerts_sent (
  category   TEXT NOT NULL,
  month      TEXT NOT NULL,
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (category, month)
);
