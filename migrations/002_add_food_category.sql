-- Adds a "food" category (Zomato/Swiggy-style food delivery) alongside the
-- original travel/creditcard/groceries/ott set. Run this once in Neon's SQL
-- editor (one statement at a time if it complains about multiple commands
-- in a prepared statement, same as 001_init.sql).

ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_category_check;

ALTER TABLE expenses ADD CONSTRAINT expenses_category_check
  CHECK (category IN ('travel','creditcard','groceries','ott','food'));
