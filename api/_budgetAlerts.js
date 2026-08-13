const webpush = require("web-push");
const { sql } = require("./_db");

const CATEGORY_LABELS = {
  travel: "Travel",
  creditcard: "Credit Card",
  groceries: "Groceries",
  ott: "OTT Subs",
  food: "Food Orders",
  upidebit: "UPI / Debit"
};

let vapidConfigured = false;
function ensureVapid() {
  if (vapidConfigured) return true;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) return false;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidConfigured = true;
  return true;
}

function currentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

/**
 * Checks whether `userId`'s confirmed spend in `category` for the current
 * month has crossed their budget limit, and if so -- and no alert has
 * already gone out to them for this category this month -- pushes a
 * notification to their stored subscriptions. Silently does nothing if push
 * isn't configured (no VAPID env vars yet) or no limit is set. Never
 * throws: a misconfigured/expired push subscription must not break the
 * expense write that triggered this check.
 */
async function checkAndAlert(userId, category) {
  try {
    const db = sql();
    const month = currentMonthKey();

    const budgetRows = await db`SELECT monthly_limit FROM budgets WHERE user_id = ${userId} AND category = ${category}`;
    if (budgetRows.length === 0) return;
    const limit = Number(budgetRows[0].monthly_limit);

    const totalRows = await db`
      SELECT COALESCE(SUM(amount), 0) AS total FROM expenses
      WHERE user_id = ${userId} AND category = ${category} AND status = 'confirmed' AND to_char(date, 'YYYY-MM') = ${month}
    `;
    const total = Number(totalRows[0].total);
    if (total <= limit) return;

    // Explicit check-then-write, not INSERT ... ON CONFLICT: the
    // (user_id, category, month) uniqueness isn't a real constraint until
    // migrations/006_enforce_user_id.sql runs (post-backfill), so an
    // ON CONFLICT target here would be unreliable until then.
    const alreadySent = await db`SELECT 1 FROM budget_alerts_sent WHERE user_id = ${userId} AND category = ${category} AND month = ${month}`;
    if (alreadySent.length > 0) return;

    if (!ensureVapid()) return;

    const subs = await db`SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ${userId}`;
    if (subs.length === 0) return;

    const label = CATEGORY_LABELS[category] || category;
    const payload = JSON.stringify({
      title: "Budget limit crossed",
      body: label + " is now at " + formatMoney(total) + ", over your " + formatMoney(limit) + " limit this month.",
      tag: "budget-" + category + "-" + month,
      url: "/"
    });

    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        );
      } catch (err) {
        if (err && (err.statusCode === 404 || err.statusCode === 410)) {
          await db`DELETE FROM push_subscriptions WHERE id = ${s.id}`;
        }
      }
    }));

    await db`INSERT INTO budget_alerts_sent (category, month, user_id) VALUES (${category}, ${month}, ${userId})`;
  } catch (e) {
    // best-effort side channel -- never let a notification failure break the caller
  }
}

function formatMoney(n) {
  return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

module.exports = { checkAndAlert };
