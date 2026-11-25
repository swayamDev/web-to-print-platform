# Testing

Three layers, all run locally and (where safe) against the live site.

| Layer                                         | Tool       | Where                                | Count                                                           |
| --------------------------------------------- | ---------- | ------------------------------------ | --------------------------------------------------------------- |
| Unit and integration                          | Vitest     | `src/**/*.test.ts`                   | 187                                                             |
| Database (security rules, pipeline functions) | pgTAP      | `supabase/tests/database/*.test.sql` | 148                                                             |
| End to end, phone (Pixel 7) and desktop       | Playwright | `e2e/*.spec.ts`                      | 206 runs (147 locally, rest skipped by viewport or environment) |

## Running them

Use `pnpm test:e2e:local` for repeatable offline payment regression against the local Supabase
stack. The runner seeds a new customer and administrator for each run, starts a production build
on port 3915 by default and clears the Stripe API key for that process only. The webhook
signature secret is retained for local signed payment fixtures. The hosted Checkout case
requires its own approved test-mode run.

The separate accounts avoid carrying the per-email login counter into the next run. The
application's per-IP limit still applies, so run suites sequentially and allow its 15-minute
window to roll over if it is exhausted. Keep the disposable accounts in the local fixture
database.

```bash
pnpm test                 # unit
pnpm db:test              # database (local Supabase; add --remote to run against the linked project, rolled back)
pnpm exec playwright install chromium   # once
pnpm test:e2e             # builds and serves the app on :3000 itself
```

Against the live site, with the live test accounts from `.env.live` (skips tests that need the
secret key, local email or create accounts):

```bash
pnpm test:e2e:live
```

Notes:

- The password-reset test follows the emailed link, which points at `APP_URL` (:3000) because
  Supabase only accepts redirects listed in `supabase/config.toml`. Run e2e on port 3000.
- Local email is caught by Mailpit. After `pnpm db:reset`, order numbers restart, so clear old
  mail (`DELETE http://127.0.0.1:55324/api/v1/messages`) or email-count tests see duplicates.
- `catalogue-admin.spec.ts` edits the laser-cut sign (no other spec prices it) and restores it.

## PRD testing checklist (p10 §16)

| #   | Checklist item                     | Proved by                                                                                                                                                                                                                                                                                                                          |
| --- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Signup and login                   | `auth.spec.ts`: sign up → account → log out; server-side validation; generic wrong-password error; protected pages redirect and return; profile update; password reset by email link; admin login. `security.spec.ts`: no account probing, no open redirect via `?next=`. `domain/auth.test.ts`: redirect sanitising.              |
| 2   | Configuration and live pricing     | `configurator.spec.ts` (8): live price confirmed by the server, limits explained, CSV fee, shareable quote links, rotation, home calculator, phone price bar. `pricing-api.spec.ts` (6). `domain/pricing.test.ts`.                                                                                                                 |
| 3   | Volume discount                    | `domain/pricing.test.ts` (tiers, all-units, rounding); `pricing-api.spec.ts`: 100 stickers £16.20 with 10% tier, 99 get none plus a hint; `configurator.spec.ts`: 99 cost more than 100. Product-specific tiers: `catalogue-admin.spec.ts`.                                                                                        |
| 4   | Designer print-area constraints    | `designer.spec.ts` (9): drag and resize stop at the edge, text shrinks to fit then reports overflow, undo, phone bottom sheet, save after login, owner-only access. `domain/design/*.test.ts`: constraints, out-of-area and tampered documents rejected. Checkout and save re-validate on the server.                              |
| 5   | Proof versioning and approval gate | `proofs.spec.ts` (3); pgTAP `02_proof_workflow` (17) and `03_production_gate` (9): versions immutable, only the latest pending one can be approved, print files and production refused before approval.                                                                                                                            |
| 6   | Print-file and CSV merge output    | `production.spec.ts` (TrimBox, 300 DPI PNG, naming, admin-only downloads), `merge.spec.ts` (mapping, row checks, all-rows proof, one file per row, ZIP), `render.spec.ts`, `lib/print/*.test.ts`, `domain/merge.test.ts`, pgTAP `04_data_merge`.                                                                                   |
| 7   | Reorder                            | `account.spec.ts`: reorder → Stripe → paid → approved automatically with the original's snapshot hash; confirmation required. pgTAP `05_reorders` (10): refuses changed artwork, other customers' orders, unconfirmed reorders.                                                                                                    |
| 8   | Admin pipeline and file download   | `admin.spec.ts` (queue filters and search, complete + email + archive, cancel with reason, staff proof upload, users and roles), `production.spec.ts` (generate and download, audit), `catalogue-admin.spec.ts` (prices, templates, reports, Xero CSV). pgTAP `06_admin_console`, `07_catalogue_admin`.                            |
| 9   | Responsive design                  | Every spec runs at phone and desktop sizes; `responsive.spec.ts`: no sideways scrolling at 360, 768 and 1280 px on all public, customer and admin pages; `production.spec.ts`: admin header at 360 px.                                                                                                                             |
| 10  | Error handling                     | `security.spec.ts`: bad price input → 400/404/422, forged webhooks → 400, private files → 404; `checkout.spec.ts`: tampered webhooks and wrong amounts refused; branded not-found and error pages; `uploads.spec.ts` and `merge.spec.ts`: clear messages for bad files.                                                            |
| 11  | Edge cases                         | Low-resolution and disguised files, unsafe SVGs, PDFs with and without bleed (`uploads.spec.ts`); bad CSVs, long names, duplicate numbers (`merge.spec.ts`, `domain/merge.test.ts`); 99 vs 100 items; payment replayed twice (`checkout.spec.ts`); reorder after files changed (pgTAP); last admin cannot be demoted (pgTAP `06`). |

## Security and quality guards

- `09_cross_tenant` (pgTAP, 49 checks): customer B can neither read nor change customer A's rows in
  any customer table, nor list, plant or delete files in private storage; visitors see none of it;
  server-only functions are not callable by customers.
- `security.spec.ts`: security headers on pages and APIs; no CSP violations across the public
  site, the designer with a direct upload, and private proof images.
- `a11y.spec.ts`: axe WCAG 2.1 A/AA on 21 pages (signed out, customer, admin), phone and desktop.
- `performance.spec.ts`: no layout shift on public pages; every image sized.

## Windows Docker access

If a sandboxed shell reports access denied to `dockerDesktopLinuxEngine`, check `docker context show` and `docker ps` in a regular PowerShell session. This project uses Docker Desktop's Linux engine and the Supabase ports 55321–55325. If Docker is stopped, start Docker Desktop, wait for the engine to be ready, and use `docker context use desktop-linux`. If the engine is visible from a regular session, run the Docker-dependent command there. On 25 November 2026, this resolved the sandbox denial without changing Docker or resetting either local project. If a regular PowerShell session also returns access denied, check Docker Desktop access with the Windows administrator before changing permissions.

## Proposed GitHub Actions workflow

The repository currently has no tracked Actions workflow. For approval, add a workflow on pull requests and pushes to the default branch with two jobs:

- **Static and unit checks:** Set up the documented Node runtime and pinned pnpm version. Install with `pnpm install --frozen-lockfile`. Run lint, typecheck and the default Vitest suite.
- **Local integration:** Run on a Linux Docker-capable runner. Start local Supabase with the repository-pinned CLI, populate CI-only loopback environment variables, seed disposable test accounts and run `pnpm db:test`. Install Playwright Chromium with dependencies and run the production-build desktop and mobile suite. Keep the HTML report and traces on failure with short retention.

Use read-only repository permissions and vetted actions pinned to commit SHAs. Keep both jobs independent of live credentials and services. Preserve existing local and viewport skips. Require green checks only after the workflow has passed with reproducible fixtures and artifacts. See [Playwright CI](https://playwright.dev/docs/ci) and [GitHub Actions security guidance](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions).
