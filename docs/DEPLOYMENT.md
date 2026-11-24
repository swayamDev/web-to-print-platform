# Deployment

The PRD requires a **new Vercel account** and a **new Supabase project**, not personal or existing
ones, with environment variables configured in the host and never committed (p10 §15).

Total time: about 30 minutes. Do the steps in order: the Vercel build reads the catalogue from
Supabase, so the database must exist first.

## 1. Supabase project (new)

1. Sign up at supabase.com with a fresh account (or a new organisation) and create a project.
   Choose the region closest to your users, and save the database password somewhere safe.
2. From this repository, link and push the schema and seed data:

   ```bash
   pnpm exec supabase login
   pnpm exec supabase link --project-ref <your-project-ref>
   pnpm exec supabase db push --remote --include-seed
   ```

   `<your-project-ref>` is the id in the project URL (`https://supabase.com/dashboard/project/<ref>`).
   Supabase CLI v3 targets the local database unless you pass `--remote`.

   Optional: prove the live security rules with the database tests (they run inside a transaction
   that is rolled back): `pnpm exec supabase test db --remote --yes`.

3. **Authentication → Sign In / Providers → Email**: turn **Confirm email** off (DECISIONS D-11) and
   set the minimum password length to **8**.
4. **Authentication → URL Configuration** (after step 3 below gives you the URL):
   - Site URL: `https://<your-app>.vercel.app`
   - Redirect URLs: `https://<your-app>.vercel.app/**`
5. **Project Settings → API Keys**: copy the **publishable** key and a **secret** key.

## 2. GitHub repository

Create an empty repository named `web-to-print-platform`, then push:

```bash
git remote add origin https://github.com/<you>/web-to-print-platform.git
git push -u origin main
```

## 3. Vercel project (new account)

1. Sign up at vercel.com with a fresh account (Hobby plan is enough).
2. **Add New → Project**, import the GitHub repository. Framework preset: Next.js (detected).
3. Add these **Environment Variables** (Production and Preview):

   | Name                                   | Value                                                 |
   | -------------------------------------- | ----------------------------------------------------- |
   | `APP_URL`                              | `https://<your-app>.vercel.app` (no trailing slash)   |
   | `NEXT_PUBLIC_SUPABASE_URL`             | `https://<your-project-ref>.supabase.co`              |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable key from step 1.5                         |
   | `SUPABASE_SECRET_KEY`                  | secret key from step 1.5 — mark as **Sensitive**      |
   | `CRON_SECRET`                          | a long random string (e.g. `openssl rand -base64 32`) |

4. Deploy. If `APP_URL` was a guess, correct it after the first deploy and redeploy, then finish
   Supabase step 1.4.

`vercel.json` pins serverless functions to `bom1` (Mumbai), the same region as the Supabase
project (`ap-south-1`); if you create the database elsewhere, change it to the nearest Vercel region.
The daily cron in `vercel.json` calls `/api/cron/keepalive` so the free Supabase project does not
pause between evaluator visits.

## 4. Test accounts on the live database

Create `.env.live` (ignored by git) with the live values. Do not call it `.env.production.local`:
Next.js loads that name automatically during `pnpm build` and would mix live and local keys.

```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_SECRET_KEY=<secret key>
TEST_CUSTOMER_EMAIL=<customer email>
TEST_CUSTOMER_PASSWORD=<strong password>
TEST_ADMIN_EMAIL=<admin email>
TEST_ADMIN_PASSWORD=<strong password>
```

Then run:

```bash
node --env-file=.env.live scripts/seed-users.mts
```

## 5. Smoke test

- Home page shows the six division tiles; a division page and a product page load.
- Sign up a new account, log out, log in with the customer test account.
- Log in as admin and open `/admin`; as the customer, `/admin` returns 404.
- Keep-alive responds: `curl -H "Authorization: Bearer <CRON_SECRET>" https://<your-app>.vercel.app/api/cron/keepalive`
  returns `{"ok":true,...}`, and without the header returns 401.
- Run the end-to-end tests against the live site with the live test-account values loaded, skipping
  the tests that create accounts (password reset needs the local Mailpit):
  `E2E_BASE_URL=https://<your-app>.vercel.app pnpm exec playwright test --grep-invert "sign up, lands|reset a forgotten password"`
- If you do run the signup test live, remove its throwaway account afterwards:
  `node --env-file=.env.live scripts/cleanup-e2e-users.mts`

## 6. Payments (Stripe, test mode)

1. In Stripe (a separate account such as "Digital Heroes Print (demo)" is fine), keep **Test mode**
   on. **Developers → API keys**: copy the secret key `sk_test_…` into Vercel as
   `STRIPE_SECRET_KEY` (Production + Preview, **Sensitive**). Live keys are refused by the app
   unless `ALLOW_LIVE_PAYMENTS=true`.
2. **Developers → Webhooks → Add endpoint**:
   - URL: `https://<your-app>.vercel.app/api/v1/webhooks/stripe`
   - Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
     `checkout.session.async_payment_failed`, `checkout.session.expired`
   - Copy the endpoint's **signing secret** `whsec_…` into Vercel as `STRIPE_WEBHOOK_SECRET`
     (**Sensitive**), then redeploy.
3. Test with card `4242 4242 4242 4242`, any future expiry, any CVC. The order page shows
   "Confirming your payment…" until the webhook arrives, then "Artwork check".
4. Locally: `stripe listen --forward-to localhost:3000/api/v1/webhooks/stripe` prints a
   temporary `whsec_…` for `.env.local`. The automated tests sign their own events instead.

## 7. Email (SMTP)

Order and proof emails are sent through any SMTP account, and every message is also shown in the
customer's account, so a delivery problem never hides a notification. Example with a dedicated
Gmail account and an **app password** (Google Account → Security → App passwords):

| Name         | Value                                         |
| ------------ | --------------------------------------------- |
| `SMTP_HOST`  | `smtp.gmail.com`                              |
| `SMTP_PORT`  | `465`                                         |
| `SMTP_USER`  | the Gmail address                             |
| `SMTP_PASS`  | the 16-character app password (**Sensitive**) |
| `EMAIL_FROM` | `Digital Heroes Print <the Gmail address>`    |

Use the same SMTP details in Supabase → **Authentication → Emails → SMTP Settings** so password
reset emails are not limited by Supabase's built-in sender. Locally, email goes to Mailpit
(`http://127.0.0.1:55324`).

## Changing the schema later

Add a migration in `supabase/migrations/`, test with `pnpm db:reset && pnpm db:test`, then
`pnpm exec supabase db push --remote`. Never edit the live database by hand.
