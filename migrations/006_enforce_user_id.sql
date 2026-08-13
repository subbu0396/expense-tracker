-- Run this ONLY after: (1) you've signed in at least once under the new
-- Google-login system, and (2) you've backfilled your existing rows with
-- your new user_id (see the UPDATE statements in SETUP.md -- run those
-- first, or every row here will fail the NOT NULL check below).
--
-- Tightens the nullable user_id columns from migrations/005 into real
-- constraints now that every row has an owner.

ALTER TABLE expenses ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE budgets ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE budgets DROP CONSTRAINT IF EXISTS budgets_pkey;
ALTER TABLE budgets ADD PRIMARY KEY (user_id, category);

ALTER TABLE budget_alerts_sent ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE budget_alerts_sent DROP CONSTRAINT IF EXISTS budget_alerts_sent_pkey;
ALTER TABLE budget_alerts_sent ADD PRIMARY KEY (user_id, category, month);

ALTER TABLE push_subscriptions ALTER COLUMN user_id SET NOT NULL;
