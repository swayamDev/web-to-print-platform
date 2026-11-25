# DHprint

A web-to-print storefront and production console for six print divisions: Labels & Stickers,
Race & Event Numbers, MTB Boards, Stamps, Trophies and Laser-Cut Work. Built for the Digital
Heroes Level 2 assessment.

- **Live site:** https://web-to-print-platform-phi.vercel.app
- **Demo accounts:** `customer.demo@example.com` (customer) and `admin.demo@example.com` (staff).
  Passwords are shared separately.
- **Payments** run in Stripe test mode. Use Stripe's test card `4242 4242 4242 4242` with any
  future expiry date and any CVC.

## Try it in five minutes

**As a customer**

1. Pick a division and a product. Change the size, material and quantity; the price, volume
   discount and VAT update as you type.
2. Choose **Design online**. Edit the template text (long names shrink to fit), try dragging
   artwork off the page (it stays inside the print area) and switch on **Preview as printed**.
3. For Race Numbers, upload a CSV of bib numbers and names to personalise one item per row.
4. Choose **Order now** and pay on Stripe's test page. You return to the order with an invoice and
   a watermarked proof. Approve it (a confirmation tick is required) or request changes.
5. Under **My account**, see orders by stage, saved designs, invoices and **Order again**.

**As staff**

1. Open **Admin**. Filter the order queue by stage, date range or product type.
2. Open an approved order and choose **Generate print files and start production**. Download the
   print-ready PDF and PNG, or a ZIP of one file per CSV row, through short-lived signed links.
3. Mark the job complete; the customer gets an email. Edit a price under **Products** and the
   storefront quotes it immediately. **Reports** totals a period and exports a Xero CSV.

Order DH-2026-000115 is a paid 12-row personalised order, already in production with 26 print
files, if you want to inspect the output without placing an order.

## What it does

| Area            | Implementation                                                                                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalogue       | Six divisions, each product driven by parameters: size limits, materials, options, bleed, safe margin, output resolution, mirroring.                                  |
| Pricing         | Server-side, decimal rates, integer pence, all-units volume tiers, 20% VAT. Prices from the browser are never trusted.                                                |
| Design editor   | Templates with placeholders, text fitting, uploads checked by content and resolution, print-area limits, undo, save and reopen.                                       |
| Personalisation | CSV upload with column mapping and per-row validation (up to 100 rows), one proof page and one print file per row.                                                    |
| Checkout        | Stripe Checkout with signed, idempotent webhooks and amount and currency checks. Invoice numbers are issued on payment.                                               |
| Proofs          | Versioned, watermarked proofs; approval needs an explicit confirmation and locks an immutable, hashed snapshot.                                                       |
| Production      | Print files generated only from the approved snapshot: PDF with bleed, PNG at the product's resolution (300 or 600 DPI), per-row files and a ZIP.                     |
| Account         | Orders by stage, invoices (PDF), saved designs, profile and one-click reorder at current prices.                                                                      |
| Admin           | Order queue and job detail, production, catalogue and template management, reports, Xero CSV export and audited role changes.                                         |
| Security        | Row-level security on customer data, private storage with signed links, role checks on every staff action, CSP and security headers, rate limits on sign-in and APIs. |

## How it is built

Next.js 16 (App Router), React 19 and TypeScript, with Tailwind CSS and shadcn/ui. Supabase
provides PostgreSQL, authentication and private file storage. The editor uses React Konva; print
output uses pdf-lib and resvg, with PDF.js for uploaded PDFs. Hosted on Vercel.

| Location                    | Responsibility                                                     |
| --------------------------- | ------------------------------------------------------------------ |
| `src/domain`                | Pure business rules: pricing, layout, print limits, CSV validation |
| `src/server`                | Privileged services and input validation at every boundary (Zod)   |
| `src/lib/print`             | PDF and PNG rendering from the same layout the editor uses         |
| `src/app`, `src/components` | Storefront, editor, account, admin and API routes                  |
| `supabase/`                 | Migrations, row-level security policies, seed catalogue and tests  |
| `e2e/`                      | Browser tests mapped to the brief's testing checklist              |

Sizes are stored in millimetres and money in integer pence. Only server modules can use the
database secret key. Key decisions are recorded in [docs/DECISIONS.md](docs/DECISIONS.md) and the
data model in [docs/SCHEMA.md](docs/SCHEMA.md).

## Testing

| Suite                                          | Result                                                                                                          |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Lint, types, formatting                        | Clean                                                                                                           |
| Unit and integration (Vitest)                  | 189 passed                                                                                                      |
| Database (pgTAP, incl. 49 cross-tenant checks) | 148 passed                                                                                                      |
| Browser, local (desktop and phone)             | 153 passed, 62 skipped by design, 1 failed: a test that collided with old local data; fixed, then passed 3 of 3 |
| Browser, live site                             | First run 107 passed, 5 failed (timeouts), 100 skipped; the 5 passed on an immediate rerun                      |

On the live site, a full order (DH-2026-000115) was also verified end to end: Stripe test payment,
signed webhook, 12-page proof and approval, print-file generation, signed downloads and emails.
Not yet verified on the live site: an abandoned or cancelled payment, and testing on a physical
phone. Details: [docs/TEST-RESULTS.md](docs/TEST-RESULTS.md) and [docs/TESTING.md](docs/TESTING.md).

## Known limitations

Stripe test mode only, with manual refunds. One order is one print job (no cart or shipping).
Print files are RGB. CSV personalisation is capped at 100 rows. Template layouts are edited as
JSON. Xero is a CSV export rather than a live connection. Gallery pieces are print-engine samples
and product photos are labelled AI-generated samples. Staff start print-file generation after the
customer approves. Full list: [docs/LIMITATIONS.md](docs/LIMITATIONS.md).

## Run it locally

Requires Node.js 22 or later, pnpm and Docker.

1. `pnpm install --frozen-lockfile`, then `pnpm db:start` (applies migrations and the sample
   catalogue).
2. Copy `.env.example` to `.env.local`, set `APP_URL=http://localhost:3000`, and fill in the local
   Supabase keys from `pnpm exec supabase status`.
3. Set the `TEST_CUSTOMER_*` and `TEST_ADMIN_*` variables, run `pnpm seed:users`, then `pnpm dev`.

| Variables                                                          | Purpose                                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Local API (`http://127.0.0.1:55321`) and its publishable key |
| `SUPABASE_SECRET_KEY`                                              | Server-only secret                                           |
| `SMTP_HOST`, `SMTP_PORT`, `EMAIL_FROM`                             | Local Mailpit on port 55325, inbox at http://127.0.0.1:55324 |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`                       | Stripe test keys; leave the API key empty for offline tests  |
| `CRON_SECRET`                                                      | Random value for the keep-alive endpoint                     |
| `TEST_CUSTOMER_*`, `TEST_ADMIN_*`                                  | Disposable local accounts                                    |

```sh
pnpm lint && pnpm typecheck && pnpm test   # static checks and unit tests
pnpm db:test                               # database tests
pnpm test:e2e:local                        # browser tests on a fresh production build
```

Deployment notes: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
