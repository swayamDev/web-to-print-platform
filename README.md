# Web-to-Print Platform

A web-to-print storefront and production console for a print house with six divisions:
labels & stickers, race & event numbers, MTB boards, stamps, trophies and laser-cut work.
Built for the Digital Heroes Level 2 assessment.

**Assessment status:** Phase 6.2 updates the locally verified assessment baseline (`a50216c`).
The [verification record](docs/TEST-RESULTS.md) distinguishes local checks from the historical
deployment. Hosted Stripe Checkout, email delivery and evaluator access for this revision
await separate approval and verification.

## What it does

**Customers**

- Browse six divisions and configure any product by size, material, orientation and quantity, with
  a live price (incl. VAT), all-units volume discounts and an "order more and save" hint.
- Design in the browser from a template or upload PDF, PDF-compatible AI, SVG, PNG or JPEG.
  Guides show trim, bleed and the safe area; artwork cannot leave the print area; text shrinks to
  fit; uploads are checked for format and print resolution.
- Personalise race numbers and plates from a CSV: map columns, check every row, one item per row.
- Pay with Stripe Checkout. Prices are recalculated on the server; the browser's price is never used.
- Approve or reject versioned proofs. Nothing is printed until a proof is approved, and the
  approval (version, hash, time, IP, browser) is recorded.
- Track orders, download invoices, and reorder in one click at today's price.

**Staff**

- Order queue with stage, UTC date and product filters and order/customer search. Complete, cancel
  (with a reason) and archive jobs, or upload corrected proofs.
- Generate PDF with trim and bleed boxes and PNG at the product’s configured DPI,
  one file per CSV row plus a ZIP, named `OrderID_ProductType_Date_Output`. Admin-only, audited
  downloads.
- Edit products (prices, materials, sizes, discount tiers) and templates; sales reports; a Xero
  invoice import CSV; user management with audited role changes.

## Documentation

| Document                                       | Contents                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| [`docs/PLAN.md`](docs/PLAN.md)                 | Architecture, rules, pipeline, pricing and print-output design      |
| [`docs/SCHEMA.md`](docs/SCHEMA.md)             | Database schema, entity diagram, security model, functions, storage |
| [`docs/DECISIONS.md`](docs/DECISIONS.md)       | How gaps and ambiguities in the brief were resolved (D-01 to D-56)  |
| [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md)   | What is deliberately out of scope or simplified, and why            |
| [`docs/TESTING.md`](docs/TESTING.md)           | How to run the tests; the PRD testing checklist mapped to them      |
| [`docs/TEST-RESULTS.md`](docs/TEST-RESULTS.md) | Current local results and historical hosted evidence                |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)     | Supabase, Vercel, Stripe and email setup                            |
| [`docs/PROGRESS.md`](docs/PROGRESS.md)         | Phase checklist and session log                                     |

## Stack

Next.js 16 (App Router, Cache Components) · React 19 · TypeScript (strict) · Tailwind CSS 4 ·
shadcn/ui · Supabase (Postgres with Row Level Security, Auth, Storage) · Stripe Checkout ·
pdf-lib, resvg and pdf.js for print output · Zod · Vitest · Playwright · pgTAP.

## Architecture in brief

- **Pure domain logic** in `src/domain/` (pricing, design layout and validation, CSV merge,
  invoices, reports, Xero export): no framework imports, unit-tested.
- **One print engine** (`src/lib/print/`) lays out a design once and renders the designer preview,
  the proof and the print files from that layout, so what is approved is what is printed.
- **The database enforces the rules**: the order state machine, the approval gate, immutable proof
  history and audit tables are triggers and `security definer` functions, and Row Level Security
  isolates every customer's data (see [`docs/SCHEMA.md`](docs/SCHEMA.md)).
- **Server-only secrets**: only `src/server/**` may use the Supabase secret key; every server action
  and route validates input with Zod and checks the user's role itself.

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
offline browser suite signs local payment fixtures and clears the Stripe API key for its process.
A private local webhook signing value is required for those fixtures.

**Troubleshooting**

- _Port already in use by another Supabase project:_ this project uses ports 553xx; stop the other
  one with `pnpm exec supabase stop --project-id <name>`.
- _After `pnpm db:reset`:_ run `pnpm seed:users` again (the reset removes the accounts) and delete
  the `.next` folder (the build cache remembers the old template ids).
- _Done for the day:_ `pnpm db:stop`.

## Scripts

| Command              | What it does                                                                          |
| -------------------- | ------------------------------------------------------------------------------------- |
| `pnpm dev`           | Start the dev server                                                                  |
| `pnpm build`         | Production build                                                                      |
| `pnpm lint`          | ESLint                                                                                |
| `pnpm typecheck`     | TypeScript check with no output                                                       |
| `pnpm copy:check`    | Scan authored UI, messages and catalogue seed for prohibited dash punctuation         |
| `pnpm test`          | Unit and integration tests (Vitest)                                                   |
| `pnpm test:e2e`      | End-to-end tests (Playwright; run `pnpm exec playwright install chromium` once first) |
| `pnpm test:e2e:live` | End-to-end tests against the live site with the accounts in `.env.live`               |
| `pnpm seed:users`    | Create the test customer and admin from the `TEST_*` values                           |
| `pnpm format`        | Format with Prettier                                                                  |
| `pnpm db:start`      | Start local Supabase (needs Docker)                                                   |
| `pnpm db:reset`      | Rebuild the local database from migrations and seed                                   |
| `pnpm db:test`       | Database tests: access rules and order pipeline (pgTAP)                               |
| `pnpm db:types`      | Regenerate `src/types/db.ts` from the local database                                  |

## Database

Schema, security rules and seed data live in [`supabase/`](supabase/), documented in
[`docs/SCHEMA.md`](docs/SCHEMA.md). Locally, Supabase runs on ports 553xx (API
`http://127.0.0.1:55321`, Studio `http://127.0.0.1:55323`).

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

Against the live site, with the live test accounts from `.env.live`: `pnpm test:e2e:live`.
Run the local suite on port 3000: the password-reset test follows an emailed link that Supabase
only sends to `APP_URL`. Latest results: [`docs/TEST-RESULTS.md`](docs/TEST-RESULTS.md).
