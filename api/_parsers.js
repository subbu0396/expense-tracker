/**
 * Deliberately small, hand-tuned rule set for common Indian bank/card debit
 * alerts and OTT/grocery/food-delivery receipt emails. This is NOT a
 * general-purpose bank-email parser -- it's a starting draft that will need
 * tuning against whatever actually lands in the user's inbox. Every rule is
 * best-effort; unmatched or amount-less emails are skipped (never inserted as
 * junk), and anything that does match still lands in the pending review queue
 * rather than being auto-confirmed. Extend RULES incrementally as new formats
 * show up.
 *
 * Note: UPI purchases can show up twice -- once as a bank debit alert (via
 * generic-bank-alert / UPI rule below) and once as a merchant's own receipt
 * (e.g. Zomato/Swiggy/Blinkit) for the same real-world payment. These land as
 * two separate pending rows since dedupe is per-email, not per-transaction --
 * reject the duplicate in the review queue.
 */

const AMOUNT_RE = /(?:Rs\.?|INR|₹)\s?([\d,]+(?:\.\d{1,2})?)/i;

// UPI bank alerts usually name the registered business in parens, e.g.
// "towards VPA foo@bank (MUNCHMART TECHNOLOGIES PRIVATE LIMITED)" -- try this
// first since it's the highest-precision signal available.
const PAREN_MERCHANT_RE = /\(([A-Z][A-Z0-9 &.,'\-]{2,49})\)/;

// Matches "at MERCHANT", "to MERCHANT", or "UPI/MERCHANT" / "UPI-MERCHANT" style references.
const GENERIC_MERCHANT_REGEXES = [
  /(?:at|to)\s+([A-Z0-9@ &.\-]{3,40})/i,
  /UPI[\/\-]([A-Za-z0-9@ &.\-]{3,40})/i
];

const RULES = [
  { id: "hdfc-debit", senderPattern: /@hdfcbank\.net$/i, merchantRegex: GENERIC_MERCHANT_REGEXES, categoryHint: "creditcard" },
  { id: "icici-cc", senderPattern: /@icicibank\.com$/i, merchantRegex: [/at\s+([A-Z0-9 &.\-]{3,40})\s+on/i, ...GENERIC_MERCHANT_REGEXES], categoryHint: "creditcard" },
  { id: "axis-alert", senderPattern: /@axisbank\.com$/i, merchantRegex: GENERIC_MERCHANT_REGEXES, categoryHint: "creditcard" },
  { id: "kotak-alert", senderPattern: /@kotak\.com$/i, merchantRegex: GENERIC_MERCHANT_REGEXES, categoryHint: "creditcard" },
  { id: "sbicard-alert", senderPattern: /@sbicard\.com$/i, merchantRegex: GENERIC_MERCHANT_REGEXES, categoryHint: "creditcard" },
  {
    // Deliberately does NOT match on bare "paid"/"payment of"/"txn of" -- those
    // words show up in plenty of non-transaction mail (delivery status updates,
    // marketing) and produced false positives with fabricated-looking amounts.
    // Stick to phrasing that's specific to an actual bank debit/UPI alert.
    id: "generic-bank-alert",
    subjectOrBodyPattern: /debited|spent|transaction alert|withdrawn|UPI (?:txn|Ref|transaction)/i,
    merchantRegex: GENERIC_MERCHANT_REGEXES,
    categoryHint: "creditcard"
  },
  { id: "netflix-receipt", senderPattern: /@netflix\.com$/i, categoryHint: "ott" },
  { id: "spotify-receipt", senderPattern: /@spotify\.com$/i, categoryHint: "ott" },
  { id: "hotstar-receipt", senderPattern: /@hotstar\.com$/i, categoryHint: "ott" },
  { id: "prime-receipt", senderPattern: /@amazon\.in$/i, subjectOrBodyPattern: /prime|subscription/i, categoryHint: "ott" },
  { id: "zomato-receipt", senderPattern: /@zomato\.com$/i, categoryHint: "food" },
  { id: "swiggy-receipt", senderPattern: /@swiggy\.in$/i, categoryHint: "food" },
  { id: "blinkit-receipt", senderPattern: /@blinkit\.com$/i, categoryHint: "groceries" },
  { id: "grofers-receipt", senderPattern: /@grofers\.com$/i, categoryHint: "groceries" }
];

const KEYWORD_CATEGORY_MAP = [
  { pattern: /bigbasket|zepto|blinkit|grofers|grocer|dmart|reliance fresh/i, category: "groceries" },
  { pattern: /zomato|swiggy|eatsure|foodpanda|faasos|dominos|domino's/i, category: "food" },
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

// Rejects captures that are just a phone number, a masked account/card number,
// or too short to be a real merchant name (these were showing up from support
// phone numbers in email footers matching the generic "to X" pattern).
function looksLikeJunkMerchant(text) {
  const digitsOnly = text.replace(/[\s\-]/g, "");
  if (/^\d{6,}$/.test(digitsOnly)) return true; // phone numbers, account/card numbers
  if (text.trim().length < 3) return true;
  return false;
}

function extractMerchant(regexes, body) {
  if (!body) return "";

  const parenMatch = PAREN_MERCHANT_RE.exec(body);
  if (parenMatch && !looksLikeJunkMerchant(parenMatch[1])) {
    return parenMatch[1].trim();
  }

  if (!regexes) return "";
  const list = Array.isArray(regexes) ? regexes : [regexes];
  for (const re of list) {
    const m = re.exec(body);
    if (m) {
      const group = m.slice(1).find((g) => g);
      if (group && !looksLikeJunkMerchant(group)) return group.trim();
    }
  }
  return "";
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

  const merchant = extractMerchant(rule.merchantRegex, email.body || "");

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
  'from:zomato.com OR from:swiggy.in OR from:blinkit.com OR from:grofers.com OR ' +
  'subject:(debited OR "transaction alert" OR spent OR withdrawn OR "UPI txn" OR "UPI transaction"))';

module.exports = { parseEmail, GMAIL_SEARCH_QUERY, RULES, KEYWORD_CATEGORY_MAP };
