# DHprint

DHprint is a web-to-print storefront and production console built for the Digital Heroes Level 2 assessment. The six divisions are Labels & Stickers, Race & Event Numbers, MTB Boards, Stamps, Trophies and Laser Cut.

The frozen application is `0f1c7a9e0416c679b498c6acfab29e42407c5379`. Phase 6.8 verified local operation. Hosted operation and evaluator access require separate approval and verification.

## Customer and staff workflows

- Customers browse divisions and configure products with server-confirmed GBP pricing, VAT and volume tiers. They can edit templates, upload artwork, personalise race bibs or plates from CSV, save designs, review versioned proofs, and view orders and invoices. Reorder quotes use current prices.
- Staff filter the order queue by stage, date and product, manage proofs, and generate production files from an approved snapshot. Catalogue, template and role management, reporting and Xero invoice CSV export are available.
- Stripe Checkout is implemented. Local browser tests exercise application state transitions through signed fixture events. Hosted Checkout, cancellation and reorder settlement remain pending.

## Stack and structure

Next.js 16 App Router with Cache Components, React 19, TypeScript, Tailwind CSS and shadcn/ui power the application. Supabase provides PostgreSQL, Auth and private Storage. The editor uses React Konva. Print rendering uses pdf-lib and resvg, with PDF.js for supported PDF workflows. Verification uses Vitest, pgTAP and Playwright.

| Location                                                     | Responsibility                                                                   |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `src/app` and `src/components`                               | Storefront, account, editor, staff and API surfaces                              |
| `src/domain`                                                 | Pricing, layout, print constraints, CSV validation and other pure business rules |
| `src/server` and `src/proxy.ts`                              | Privileged services, boundary validation and auth session refresh                |
| `src/lib/print`                                              | PDF and PNG rendering from the shared layout                                     |
| `supabase/migrations`, `supabase/seed.sql`, `supabase/tests` | Schema, policies, sample catalogue and database tests                            |
| `e2e` and `scripts`                                          | Browser cases and local fixture runners                                          |
| `docs`                                                       | Architecture, schema, decisions, operation and verification                      |

The server recalculates prices in integer minor units using decimal rates. Print geometry uses millimetres. Staff operations check roles, customer reads are scoped by RLS, and private files use scoped signed access. Proof approval binds the version and hash to the production snapshot.

## Local setup

Install Node.js 22 or later, pnpm and Docker. The frozen verification used Node 26.7.0 and pnpm 12.16.1.

1. Run `pnpm install --frozen-lockfile`, then `pnpm db:start`. A new local database applies the migrations in filename order and loads the sample catalogue seed.
2. Copy `.env.example` to `.env.local` (PowerShell: `Copy-Item .env.example .env.local`). Set `APP_URL` to `http://localhost:3000`. Obtain local Supabase keys from `pnpm exec supabase status` and keep them private.
3. Set the local customer and admin fixture variables, then run `pnpm seed:users`. Start the app with `pnpm dev`, or use `pnpm build` followed by `pnpm start` for production mode.

| Variables                                                                                  | Configuration                                                                                                                                         |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`                         | Local API at `http://127.0.0.1:55321` and its publishable key                                                                                         |
| `SUPABASE_SECRET_KEY`                                                                      | Server-only local secret                                                                                                                              |
| `SMTP_HOST`, `SMTP_PORT`, `EMAIL_FROM`                                                     | Local Mailpit SMTP at `127.0.0.1:55325`, with inbox UI on port 55324. Set `SMTP_USER` and `SMTP_PASS` only if the SMTP service requires them.         |
| `TEST_CUSTOMER_EMAIL`, `TEST_CUSTOMER_PASSWORD`, `TEST_ADMIN_EMAIL`, `TEST_ADMIN_PASSWORD` | Distinct disposable local fixture accounts                                                                                                            |
| `PAYMENT_PROVIDER`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`                           | Default provider is Stripe. Supply a private local signing value for signed fixture events. Leave the Stripe API key empty during offline regression. |
| `CRON_SECRET`                                                                              | Private random value if exercising the cron guard                                                                                                     |

Keep private values in ignored local environment files or an authorized host's secret store. The template includes unused Razorpay placeholders. For a disposable local rebuild, `pnpm db:reset` reapplies migrations and seed and removes local account data. Reseed users and rebuild against the new dataset afterward. Supabase Studio is on port 55323.

## Verification commands

```sh
pnpm typecheck
pnpm lint
pnpm copy:check
pnpm test
pnpm db:test
pnpm exec playwright install chromium
pnpm test:e2e:local
pnpm build
```

Run Playwright with port 3000 available and no existing dev server. The repository's default profiles are desktop and mobile Chromium. The Phase 6.8 review also records Firefox desktop and WebKit desktop and mobile.

The final local evidence records 189 Vitest passes, 148 pgTAP assertions and 408 reconciled browser passes with 132 existing conditional skips and zero unresolved failures. The initial full browser run recorded 378 passes, 28 failures, 132 skips and two unexecuted cases. Corrections and targeted reruns account for the final totals.

## Deployment prerequisites and limitations

Future authorized hosted verification requires a dedicated Supabase project and deployment, migration and seed validation, HTTPS, consistent build and runtime `APP_URL`, private storage, trusted ingress, role isolation, Stripe test-mode and signed webhooks, and SMTP. The 100-row print workflow passed locally. Hosted resource limits, job interruption recovery at maximum capacity and real-device behavior remain unverified.

The gallery uses labelled demonstrations. Confirm permission-cleared real client work or a waiver, whether production must begin at approval without staff input, and whether the brief expects a separate saved-design score. The settled WebKit canonical check passed. Early client navigation can briefly produce duplicate canonical tags.

Repository references include `docs/PLAN.md`, `docs/SCHEMA.md`, `docs/DECISIONS.md`, `docs/TESTING.md`, `docs/TEST-RESULTS.md`, `docs/DEPLOYMENT.md` and `docs/LIMITATIONS.md`. The local handover contains the detailed evidence and hosted verification plan.
