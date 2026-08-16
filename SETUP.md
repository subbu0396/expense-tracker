# Gmail auto-import setup

Spend Ledger can parse bank/card transaction alert emails and OTT receipts out of
your Gmail into a pending review queue. The code is already in this repo; these
are the one-time account steps that only you can do (they need your own Google
and Vercel account access).

Two secrets have already been generated for you and saved locally in
`.env.local` (not committed to git — see step 3).

## 1. Google Cloud Console

1. Go to https://console.cloud.google.com/ and create a new project (or reuse one).
2. **APIs & Services -> Library** -> enable the **Gmail API**.
3. **APIs & Services -> OAuth consent screen**:
   - User type: **External**
   - Publishing status: **Testing**
   - Add your own Google account under **Test users**
   - Scope: you don't need to add `gmail.readonly` here manually, but if prompted, add it.
   - Note: in Testing mode, Google expires refresh tokens after **7 days**. If a
     sync fails with an expired-token error, just click "Connect Gmail" again.
4. **APIs & Services -> Credentials -> Create Credentials -> OAuth client ID**:
   - Application type: **Web application**
   - Authorized redirect URI: `https://expense-tracker-nine-self-90.vercel.app/api/auth/callback`
   - Save, then copy the **Client ID** and **Client Secret**.

## 2. Vercel database

1. Vercel dashboard -> your `expense-tracker` project -> **Storage** tab.
2. **Create Database -> Postgres** (Neon). Connect it to this project.
   This automatically adds a `DATABASE_URL` (or `POSTGRES_URL`) environment variable.
3. Open the database's **SQL Editor** (or Neon console) and run the contents of
   `migrations/001_init.sql` once, to create the `expenses`, `oauth_tokens`, and
   `sync_state` tables.

## 3. Environment variables

Vercel dashboard -> your project -> **Settings -> Environment Variables** -> add:

| Name | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | from step 1 |
| `GOOGLE_CLIENT_SECRET` | from step 1 |
| `GOOGLE_REDIRECT_URI` | `https://expense-tracker-nine-self-90.vercel.app/api/auth/callback` |
| `OAUTH_STATE_SECRET` | see your local `.env.local` file |
| `TOKEN_ENCRYPTION_KEY` | see your local `.env.local` file |
| `CRON_SECRET` | see your local `.env.local` file (optional, protects the daily cron endpoint) |
| `DATABASE_URL` | already added automatically by the Storage integration in step 2 |

`.env.local` sits in `~/expense-tracker/.env.local` on this machine and is
git-ignored — it's just a convenient place to copy values from, not something
that gets deployed.

Redeploy after adding the variables (Vercel -> Deployments -> Redeploy, or just
push a commit).

## 4. Connect and sync

1. Open the live site. A **Connect Gmail** button appears in the header.
2. Click it, sign in, and approve access (read-only).
3. Click **Sync now**. Matched transactions land in a **Pending review** section
   below the charts — check the amount/category, then Confirm or Reject each one.
4. A daily cron (6am UTC) also calls the same sync automatically, in addition to
   the manual button.

## 5. Tuning the parser

The email-matching rules live in `api/_parsers.js` — a short, explicit list per
bank/sender, not a universal parser. After your first real sync, if a bank alert
you expected didn't show up (or a category guess is consistently wrong), send a
few example subjects/senders and the rules can be extended.

## 6. Multi-user login (new)

The app now requires signing in with Google before you can see any data — this
is the first step toward opening it up to other users, each with their own
private ledger. **Do these steps in order**, since the backfill step below only
works correctly while you're still the only account in the system.

1. **Google Cloud Console -> Credentials -> your OAuth client** -> add a second
   **Authorized redirect URI**: `https://expense-tracker-nine-self-90.vercel.app/api/auth/login`
   (this is separate from the existing Gmail-connect redirect URI — leave that one in place;
   sign-in start and callback share this one URL, distinguished internally by whether
   Google included a `code` parameter).
2. **OAuth consent screen -> Test users** -> add a second Google account you
   control, so we can verify two accounts stay fully isolated from each other
   before opening this up further.
3. Vercel -> **Settings -> Environment Variables** -> add `SESSION_SECRET`
   (value in your local `.env.local`). Redeploy.
4. Run `migrations/005_multi_tenant.sql` once in Neon's SQL editor (same
   one-statement-at-a-time note as before if needed).
5. Open the site — you'll now see a **Sign in with Google** screen. **Sign in
   with your own primary account first** (important: before the second test
   account touches the app at all).
6. While you're still the only signed-up user, run this once in Neon's SQL
   editor to claim all your existing data (it grabs the one and only user row
   that exists at this point):
   ```sql
   UPDATE expenses SET user_id = (SELECT id FROM users LIMIT 1) WHERE user_id IS NULL;
   UPDATE budgets SET user_id = (SELECT id FROM users LIMIT 1) WHERE user_id IS NULL;
   UPDATE push_subscriptions SET user_id = (SELECT id FROM users LIMIT 1) WHERE user_id IS NULL;
   UPDATE budget_alerts_sent SET user_id = (SELECT id FROM users LIMIT 1) WHERE user_id IS NULL;
   ```
7. Refresh the app and confirm all your expenses, budgets, and alert settings
   are back. *Then* sign in with the second test account (different browser
   or an incognito window) and confirm it sees a completely empty ledger.
8. Once that's confirmed, run `migrations/006_enforce_user_id.sql` — this
   locks in the per-user constraints now that every row has an owner.

Gmail sync itself was **not** part of this step — see "Per-user Gmail
connections" below for that follow-up phase.

## 7. Per-user Gmail connections

Gmail auto-import now works per-signed-in-user instead of being tied to a
single original account.

1. Run `migrations/007_gmail_per_user.sql` once in Neon's SQL editor. It's
   additive/backfilling (like `005`), so it's safe to run any time — no
   ordering constraint like step 6 above had.
2. No Google Cloud Console changes needed — the Gmail OAuth client and
   redirect URI are unchanged, tokens are just scoped per user now. Each
   user does still need to be added under **OAuth consent screen -> Test
   users** before they can grant the `gmail.readonly` scope, same
   restriction sign-in already has (see step 2 above).
3. Each user (including you) uses the existing **Connect Gmail** button
   after signing in, independently. **Sync now** (and the daily cron) only
   touch that user's own expenses.

## 8. Going public: full Google OAuth verification

`privacy.html` and `terms.html` are now in the repo (linked from the footer
of both the login screen and the signed-in app) — Google's verification
review requires a public privacy policy and app homepage, which these
provide. The rest is manual, in the Google Cloud Console:

1. **OAuth consent screen** -> fill in app name/logo, **Privacy Policy
   link**: `https://expense-tracker-nine-self-90.vercel.app/privacy.html`,
   **App homepage link**: `https://expense-tracker-nine-self-90.vercel.app/`,
   and optionally the Terms link (`/terms.html`).
2. **Domain verification**: Google requires the homepage/privacy-policy
   domain to be verified in
   [Search Console](https://search.google.com/search-console). `*.vercel.app`
   itself is on the public suffix list, so you can't verify the whole
   `vercel.app` domain — but you *can* verify your specific
   `expense-tracker-nine-self-90.vercel.app` URL as a Search Console
   "URL prefix" property (HTML-file or meta-tag verification). That's
   enough for the consent screen's domain check.
3. **Publish to Production** on the consent screen. This alone opens
   sign-in (and the non-sensitive `openid`/`email`/`profile` scopes) to any
   Google account — no more test-user allowlist for basic login.
4. **Submit for verification** of the `gmail.readonly` scope: explain why
   it's needed (parsing bank/card/OTT transaction emails into expense
   entries) and record a short screen capture showing: sign in -> Connect
   Gmail -> Google's consent screen -> Sync now -> the pending-review queue
   where a user checks each parsed expense before it's confirmed. Review
   can take days to weeks and may come back with follow-up questions from
   Google — worth checking email during that window.
5. **Until verification finishes**, connecting Gmail shows Google's
   "unverified app" warning for anyone who isn't a listed test user (they
   can still click through "Advanced -> Go to Spend Ledger (unsafe)" to
   proceed) — sign-in itself is unaffected once published to Production.
