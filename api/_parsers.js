/**
 * Deliberately small, hand-tuned rule set for common Indian bank/card debit
 * alerts and OTT receipt emails. This is NOT a general-purpose bank-email
 * parser -- it's a starting draft that will need tuning against whatever
 * actually lands in the user's inbox. Every rule is best-effort; unmatched
 * or amount-less emails are skipped (never inserted as junk), and anything
 * that does match still lands in the pending review queue rather than being
 * auto-confirmed. Extend RULES incrementally as new formats show up.
 */

const AMOUNT_RE = /(?:Rs\.?|INR|₹)\s?([\d,]+(?:\.\d{1,2})?)/i;

const RULES = [
  { id: "hdfc-debit", senderPattern: /@hdfcbank\.net$/i, merchantRegex: /(?:at|to)\s+([A-Z0-9 &.\-]{3,40})/i, categoryHint: "creditcard" },
  { id: "icici-cc", senderPattern: /@icicibank\.com$/i, merchantRegex: /at\s+([A-Z0-9 &.\-]{3,40})\s+on/i, categoryHint: "creditcard" },
  { id: "axis-alert", senderPattern: /@axisbank\.com$/i, merchantRegex: /(?:at|to)\s+([A-Z0-9 &.\-]{3,40})/i, categoryHint: "creditcard" },
  { id: "kotak-alert", senderPattern: /@kotak\.com$/i, merchantRegex: /(?:at|to)\s+([A-Z0-9 &.\-]{3,40})/i, categoryHint: "creditcard" },
  { id: "sbicard-alert", senderPattern: /@sbicard\.com$/i, merchantRegex: /at\s+([A-Z0-9 &.\-]{3,40})/i, categoryHint: "creditcard" },
  { id: "generic-bank-alert", subjectOrBodyPattern: /debited|spent|transaction alert|withdrawn/i, merchantRegex: /(?:at|to)\s+([A-Z0-9 &.\-]{3,40})/i, categoryHint: "creditcard" },
  { id: "netflix-receipt", senderPattern: /@netflix\.com$/i, categoryHint: "ott" },
  { id: "spotify-receipt", senderPattern: /@spotify\.com$/i, categoryHint: "ott" },
  { id: "hotstar-receipt", senderPattern: /@hotstar\.com$/i, categoryHint: "ott" },
  { id: "prime-receipt", senderPattern: /@amazon\.in$/i, subjectOrBodyPattern: /prime|subscription/i, categoryHint: "ott" }
];

const KEYWORD_CATEGORY_MAP = [
  { pattern: /bigbasket|zepto|blinkit|grocer|dmart|reliance fresh/i, category: "groceries" },
  { pattern: /irctc|makemytrip|indigo|uber|ola|airport|hotel|goibibo|redbus/i, category: "travel" },
  { pattern: /netflix|spotify|prime video|hotstar|youtube premium|apple music/i, category: "ott" }
];

function matchRule(fromAddress, subject, body) {
  const haystack = `${subject || ""}\n${body || ""}`;
  for (const rule of RULES) {
    if (rule.senderPattern && !rule.senderPattern.test(fromAddress || "")) continue;
    if (!rule.senderPattern && rule.subjectOrBodyPattern && !rule.subjectOrBodyPattern.test(haystack)) continue;
    if (!rule.senderPattern && !rule.subjectOrBodyPattern) continue;
    return rule;
  }
  return null;
}

function refineCategory(text, fallback) {
  for (const kw of KEYWORD_CATEGORY_MAP) {
    if (kw.pattern.test(text)) return kw.category;
  }
  return fallback;
}

/**
 * @param {{fromAddress: string, subject: string, body: string, dateHeader: string}} email
 * @returns {{amount: number, category: string, note: string, date: string, snippet: string} | null}
 */
function parseEmail(email) {
  const rule = matchRule(email.fromAddress, email.subject, email.body);
  if (!rule) return null;

  const amountMatch = AMOUNT_RE.exec(`${email.subject || ""} ${email.body || ""}`);
  if (!amountMatch) return null;
  const amount = parseFloat(amountMatch[1].replace(/,/g, ""));
  if (!amount || amount <= 0) return null;

  let merchant = "";
  if (rule.merchantRegex) {
    const m = rule.merchantRegex.exec(email.body || "");
    if (m) merchant = m[1].trim();
  }

  const category = refineCategory(`${email.subject || ""} ${merchant}`, rule.categoryHint);
  const date = email.dateHeader ? new Date(email.dateHeader).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  const snippet = (email.body || email.subject || "").replace(/\s+/g, " ").trim().slice(0, 200);

  return {
    amount,
    category,
    note: merchant || (email.subject || "").slice(0, 60),
    date,
    snippet
  };
}

const GMAIL_SEARCH_QUERY =
  '(from:hdfcbank.net OR from:icicibank.com OR from:axisbank.com OR from:kotak.com OR ' +
  'from:sbicard.com OR from:netflix.com OR from:spotify.com OR from:hotstar.com OR ' +
  'subject:(debited OR "transaction alert" OR spent OR withdrawn))';

module.exports = { parseEmail, GMAIL_SEARCH_QUERY, RULES, KEYWORD_CATEGORY_MAP };
