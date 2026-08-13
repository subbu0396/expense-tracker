-- Adds a "upidebit" category (merged UPI / Debit Card spending, separate from
-- actual Credit Card bills). Run this once in Neon's SQL editor (one
-- statement at a time if it complains about multiple commands in a prepared
-- statement, same as the earlier migrations).

ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_category_check;

ALTER TABLE expenses ADD CONSTRAINT expenses_category_check
  CHECK (category IN ('travel','creditcard','groceries','ott','food','upidebit'));
