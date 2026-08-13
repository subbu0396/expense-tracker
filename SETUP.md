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
