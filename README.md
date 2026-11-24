# Web-to-Print Platform

A web-to-print storefront and production console for a print house with six divisions:
labels & stickers, race & event numbers, MTB boards, stamps, trophies and laser-cut work.
Built for the Digital Heroes Level 2 assessment.

**Live site:** https://web-to-print-platform-phi.vercel.app

> **Status:** in development. See [`docs/PROGRESS.md`](docs/PROGRESS.md) for what is built so far.

## Documentation

- [`docs/PLAN.md`](docs/PLAN.md) — architecture, rules, pipeline, pricing and print-output design
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — how gaps and ambiguities in the brief were resolved
- [`docs/PROGRESS.md`](docs/PROGRESS.md) — phase checklist
- [`docs/TESTING.md`](docs/TESTING.md) — how to run the tests, and the PRD testing checklist mapped to them

## Stack

Next.js (App Router) · React · TypeScript (strict) · Tailwind CSS · shadcn/ui ·
Supabase (Postgres, Auth, Storage) · Vitest · Playwright.

## Local setup

Requirements: **Node.js 22+**, **pnpm** (`npm install -g pnpm`) and **Docker Desktop** (running),
which hosts the local Supabase database.

1. Install dependencies and start the local database. The first start downloads the Supabase
   images; the schema and seed data (catalogue, templates, discount tiers) are applied for you.

   ```bash
   pnpm install
   pnpm db:start
   ```

2. Create `.env.local` from the template and fill it in. `pnpm exec supabase status` prints the
   local URL and keys:

   ```bash
   cp .env.example .env.local
   ```

   ```ini
   APP_URL=http://localhost:3000
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<"Publishable key" from supabase status>
   SUPABASE_SECRET_KEY=<"Secret key" from supabase status>

   # Local email is caught by Mailpit: http://127.0.0.1:55324
   SMTP_HOST=127.0.0.1
   SMTP_PORT=55325
   EMAIL_FROM=Digital Heroes Print <no-reply@localhost>

   # Any values: used by `pnpm seed:users` and the end-to-end tests
   TEST_CUSTOMER_EMAIL=customer@test.local
   TEST_CUSTOMER_PASSWORD=<choose one>
   TEST_ADMIN_EMAIL=admin@test.local
   TEST_ADMIN_PASSWORD=<choose one>

   CRON_SECRET=<any long random string>
   ```

3. Create the test accounts and start the app at http://localhost:3000:

   ```bash
   pnpm seed:users
   pnpm dev
   ```

Local addresses: app `http://localhost:3000`, Supabase Studio `http://127.0.0.1:55323`, emails
(Mailpit) `http://127.0.0.1:55324`.

**Payments (optional).** Without Stripe keys everything works except paying ("Order now" explains
that payment is not configured). To pay locally, set `STRIPE_SECRET_KEY` to a **test** key
(`sk_test_…`), run `stripe listen --forward-to localhost:3000/api/v1/webhooks/stripe` and put the
`whsec_…` it prints in `STRIPE_WEBHOOK_SECRET`. Pay with card `4242 4242 4242 4242`. The
end-to-end tests sign their own payment events and need none of this.

**Troubleshooting**

- _Port already in use by another Supabase project:_ this project uses ports 553xx; stop the other
  one with `pnpm exec supabase stop --project-id <name>`.
- _After `pnpm db:reset`:_ run `pnpm seed:users` again (the reset removes the accounts) and delete
  the `.next` folder (the build cache remembers the old template ids).
- _Done for the day:_ `pnpm db:stop`.

## Scripts

| Command          | What it does                                                                          |
| ---------------- | ------------------------------------------------------------------------------------- |
| `pnpm dev`       | Start the dev server                                                                  |
| `pnpm build`     | Production build                                                                      |
| `pnpm lint`      | ESLint                                                                                |
| `pnpm typecheck` | TypeScript check with no output                                                       |
| `pnpm test`      | Unit and integration tests (Vitest)                                                   |
| `pnpm test:e2e`  | End-to-end tests (Playwright; run `pnpm exec playwright install chromium` once first) |
| `pnpm format`    | Format with Prettier                                                                  |
| `pnpm db:start`  | Start local Supabase (needs Docker)                                                   |
| `pnpm db:reset`  | Rebuild the local database from migrations and seed                                   |
| `pnpm db:test`   | Database tests: access rules and order pipeline (pgTAP)                               |
| `pnpm db:types`  | Regenerate `src/types/db.ts` from the local database                                  |

## Database

Schema, security rules and seed data live in [`supabase/`](supabase/). Locally, Supabase runs on
ports 553xx (API `http://127.0.0.1:55321`, Studio `http://127.0.0.1:55323`).

## Environment variables

Listed in [`.env.example`](.env.example). Real values live in `.env.local` locally and in the
hosting dashboard in production. They are never committed.

## Test accounts

`pnpm seed:users` creates a customer and an admin account from the `TEST_*` values in your env
file. Credentials for the live site are shared privately with the submission, not in this public
repository.

## Running the end-to-end tests

```bash
pnpm db:start                          # local Supabase (Docker)
pnpm seed:users                        # test accounts
pnpm exec playwright install chromium  # once
pnpm test:e2e                          # builds the app and starts it on :3000 itself
pnpm db:test                           # database tests (pgTAP)
```

Against the live site (skips the tests that need local email or create accounts):
`E2E_BASE_URL=https://web-to-print-platform-phi.vercel.app pnpm exec playwright test --grep-invert "sign up, lands|reset a forgotten password"`.
