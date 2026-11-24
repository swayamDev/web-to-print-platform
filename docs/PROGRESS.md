# Progress

Update this file at the end of every work session: tick what is done, and write the exact
next step under **Next up** so work can resume cold.

## Next up

- Phase 14 live check (admin, in a browser): search the queue, open DH-2026-000023 and mark it
  complete, check the users page.
- Then **Phase 15** (admin product/template management, reports, Xero CSV export).

## Live

- Site: https://web-to-print-platform-phi.vercel.app (Vercel Hobby, functions in `bom1`)
- Database: Supabase project `yxnqzqrcjwxunwxuivqm` (`ap-south-1`, free tier)
- Repository: https://github.com/swayamDev/web-to-print-platform (public; pushes to `main` deploy)
- Live test accounts: `customer.demo@example.com`, `admin.demo@example.com`; passwords in the
  gitignored `.env.live` (share privately at submission)

## Phases

- [x] **Phase 0** — Repository and tooling (Next.js, TypeScript strict, Tailwind, shadcn/ui,
      ESLint, Prettier, Vitest, Playwright, docs)
- [x] **Phase 1** — Supabase schema, RLS, storage buckets and policies, seed data, generated types
- [x] **Phase 2** — Auth and roles (login, signup, reset, guards, admin seed, account/admin shells)
- [x] **Phase 3** — Design system, public shell, home hub, **first deploy** (new Vercel account,
      new Supabase project, env vars, daily keep-alive cron)
- [x] **Phase 4** — Pricing engine (pure, decimal maths, tiers, tax, rounding) + price API + tests
- [x] **Phase 5** — Product page and live configurator
- [x] **Phase 6** — Render spike: design document schema, layout, text fitting, server PDF and PNG,
      verified on Vercel
- [x] **Phase 7a** — Designer: canvas, text, images, fonts, colours, save and reopen
- [x] **Phase 7b** — Designer: print-area constraints, clipping, preview-as-printed, mobile
- [x] **Phase 8** — Artwork uploads (PDF, SVG, AI, PNG) with validation and previews
- [x] **Phase 9** — Checkout, payment webhook, order capture, order numbers, first emails
- [x] **Phase 10** — Proof versions, approve / request changes, immutable log, approval gate
- [x] **Phase 11** — Production file generation, storage layout, secure admin download
- [x] **Phase 12** — CSV variable-data merge (mapping, preflight, batched generation, ZIP)
- [x] **Phase 13** — Customer dashboard, invoices, one-click reorder
- [x] **Phase 14** — Admin console: queue, filters, job detail, pipeline actions, archive, users
- [ ] **Phase 15** — Admin product/template management, reports, Xero CSV export
- [ ] **Phase 16** — Gallery, motion, responsive and accessibility polish, performance
- [ ] **Phase 17** — Security hardening, RLS cross-tenant tests, full checklist E2E suite
- [ ] **Phase 18** — Production deploy check, README, schema docs, limitations, test results

## Session log

### 2026-11-23 — Phase 0

- Scaffolded Next.js 16.4.6 (App Router, React 19, TypeScript strict + `noUncheckedIndexedAccess`),
  Tailwind 4, shadcn/ui (base-nova, neutral), ESLint 9, Prettier, Vitest 5, Playwright 1.65.
- Added folder skeleton, `.env.example`, `docs/DECISIONS.md` (D-01 to D-20), `docs/PLAN.md`.
- First domain module: `src/domain/money.ts` with tests.
- Gotchas: Playwright browsers are not installed yet.

### 2026-11-24 — Phase 1

- Migrations in `supabase/migrations/`: core schema (23 tables), functions and triggers (profile
  creation, `is_admin()`, order state machine + approval gate, status timeline, `transition_order()`,
  immutable proof/history/audit logs, design locking, invoice numbers, rate limiting), RLS and
  grants, storage buckets (`catalogue`, `uploads`, `proofs`, `production`).
- Seed: settings (GBP, 20% VAT, 100 CSV rows), 6 divisions, 17 materials, 6 products, global tiers
  100/250/500, 6 templates. All prices are sample values.
- 24 pgTAP tests pass (`pnpm db:test`): visitor/customer/admin access, no direct order writes,
  no self-promotion to admin, production files hidden from customers, pipeline guards.
- Types generated to `src/types/db.ts` (`pnpm db:types`).
- Gotchas: local Supabase uses ports **553xx** (API 55321, DB 55322, Studio 55323, mail 55324)
  because another local Supabase project uses the defaults. New tables need explicit grants and
  policies: default privileges for `anon`/`authenticated` are revoked.

### 2026-11-24 — Phase 2

- Supabase clients: browser (`src/lib/supabase/client.ts`), server as the user
  (`src/server/supabase/server.ts`), secret-key admin client (`src/server/supabase/admin.ts`).
  Env validated with Zod (`src/lib/env.ts`, `src/server/env.ts`). Keys are the new-style
  publishable / secret keys.
- `src/proxy.ts` (Next 16's renamed middleware): refreshes the session, redirects signed-out users
  from /account, /admin, /reset-password to login, and returns a real 404 for non-admins on /admin.
  `requireUser()` / `requireAdmin()` in `src/server/auth.ts` remain the security boundary.
- Pages: login, signup, forgot password, reset password (via `/auth/callback` email link),
  logout; account dashboard (profile status, saved-design count, recent orders) and profile
  editing; admin overview (revenue, customer count, orders per pipeline stage). All live data.
- `pnpm seed:users` creates the customer and admin test accounts from env values.
- Tests: 12 unit tests (auth schemas, open-redirect guard, money); 18 Playwright tests at phone and
  desktop sizes (signup, validation, wrong password, redirect-and-return, profile update, customer
  blocked from admin with 404, admin login, full password reset via Mailpit).
- Gotchas: **Cache Components is on** (`next.config.ts`): anything reading cookies, the session
  or the database must sit inside `<Suspense>` in the page itself, or Next logs "uncached data"
  / "Date.now()" errors. Pattern: sync page → `<Suspense fallback={<PageSkeleton />}>` → async
  content. Playwright needs local Supabase running and `pnpm seed:users` done first.

### 2026-11-24 — Phase 3 (deploy pending)

- Design system in `src/app/globals.css`: paper/ink/signal-orange tokens (ink text on orange for
  AA contrast), Sora headings, Inter body, JetBrains Mono specs; `.spec-label`, `.num`,
  `.bg-mm-grid` and `.crop-marks` utilities; reduced-motion respected.
- Header (registration-mark logo, no-JS products menu, streamed account links), footer, skip link,
  branded 404 page.
- Home: hero with a CSS sample proof (trim, bleed, safe area, dimensions), six equal-weight division
  tiles from the database, "how it works". Division pages (`/d/[division]`) and product spec pages
  (`/p/[product]`) with sizes, materials, options, bleed/DPI and templates. Product pages say
  plainly that online configuration and pricing are still to come (Phase 5).
- Catalogue reads in `src/server/catalogue.ts` use `"use cache"` + `cacheTag("catalogue")` with a
  cookie-less client, so public pages prerender.
- Keep-alive cron: `/api/cron/keepalive` (Bearer CRON_SECRET, timing-safe) + `vercel.json` daily.
- `docs/DEPLOYMENT.md`: step-by-step for the new Supabase project, GitHub, new Vercel account,
  env vars, live test accounts and smoke test.
- Playwright now tests a **production build** (`pnpm build && pnpm start`) with 3 workers; 24 tests
  pass (catalogue browsing, 404s, no sideways scroll, all auth flows) at phone and desktop sizes.
- Gotchas: local Supabase auth rate limits were raised in `config.toml` (tests hit the default
  30 sign-ins / 5 min and 2 emails / hour); login and signup now say "Too many attempts" on a 429
  instead of "incorrect password". If the dev server serves stale CSS, delete `.next`.

### 2026-11-24 — Phase 3 deploy

- New Supabase project created; 5 migrations + seed pushed with `supabase db push --remote
--include-seed`; all 24 pgTAP tests pass against it (`supabase test db --remote --yes`).
- Public GitHub repo created and pushed (history scanned: no secrets). New Vercel account deploys
  `main`; 5 env vars set (secret key and cron secret marked Sensitive).
- Functions pinned to `bom1` next to the database (they defaulted to `iad1`; live logins timed out).
- Live test accounts created with `seed-users.mts`; 21 live E2E tests + live signup pass;
  `scripts/cleanup-e2e-users.mts` removes throwaway test accounts.
- Not yet verified live: password-reset email delivery (Supabase's built-in mailer is rate-limited;
  custom SMTP comes with email notifications) and the daily cron run (check Vercel → Cron Jobs).

### 2026-11-24 — Phase 4

- `src/domain/pricing.ts`: pure engine (decimal.js, half-up line rounding, all-units tiers,
  product-specific tiers override global, setup fee, option add-ons, variable-data fee, tax from
  settings, derived orientation, next-tier preview) + `priceRequestSchema` (Zod).
- 27 table-driven unit tests, including the plan's worked examples (100 stickers £16.20, 99 = £17.82
  price cliff, 500 race numbers £343.78), tier boundaries, INR/GST, rounding and validation.
- `src/server/pricing.ts` loads rules from the database (numerics as text, cached with tag
  "catalogue"); `POST /api/v1/price` with a 4 KB body cap and a Postgres-backed per-IP rate limit
  (120/min, `src/server/rate-limit.ts`). 6 API end-to-end tests, including ignoring client prices.
- Decisions D-22 (rounding), D-23 (orientation), D-24 (setup fees and add-ons).

### 2026-11-24 — Phase 5

- Product pages now open with the configurator (`src/components/configurator`): size presets and
  custom width × height with rotate, material cards, option cards with per-item add-ons, CSV
  personalisation toggle, quantity stepper with quick chips. Prices instantly in the browser with
  the shared engine; the server confirms after 350 ms ("Price confirmed with current rates", or a
  warning if rates changed). Breakdown, tier ladder (price each at every break), "order N more and
  pay less" hint for the all-units price cliff, copy-link button, fixed price bar on phones.
- Configuration lives in the URL (`?w=&h=&m=&q=&vd=1&opt.<key>=`) so quotes can be shared and
  survive login.
- Home page "Price it in seconds" calculator for every product, handing over to the configurator.
- Fixed two narrow-screen overflows (header logo, calculator select); the no-sideways-scroll test
  now runs at 360 px. 8 new configurator end-to-end tests; 47 pass locally.
- Ordering is not open yet: the price panel says so until the designer and checkout exist.

### 2026-11-24 — Phase 6

- `src/domain/design`: DesignDocument v1 schema (Zod), units (mm/pt/px/DPI), single-line text
  fitting (tracking first, then size, never below the minimum; reports overflow and missing glyphs),
  `layoutDocument` (absolute page geometry shared by all renderers), `validateDocument` (print
  areas with rotation, bleed allowance, safe area). `src/domain/files.ts`: production file names.
- `src/lib/print`: font loading + shared glyph placement (opentype.js), SVG with text as outlines,
  PNG via resvg with exact pixel size and pHYs DPI, PDF via pdf-lib with MediaBox/BleedBox/TrimBox,
  subset-embedded fonts, character spacing, rotation, fixed dates for deterministic output.
- `src/server/render`: loads fonts from disk (traced into the bundle via next.config.ts),
  `renderDesign` validates then renders. `GET /api/v1/templates/:id/preview` (PNG or PDF), shown on
  product pages as server-rendered template previews with a print-ready PDF link.
- Tests: 23 domain tests (fitting, layout, validation incl. rotation, file names) + 11 preflight tests
  on real output (seed templates valid; A5 bib PDF boxes 154×216 mm with 3 mm trim inset; embedded
  FontFile2; pdf.js extracts the text; byte-identical re-render; PNG 1819×2551 px @ 300 DPI; pixel
  checks for band colour, bleed and ink). 3 render e2e tests. 50 e2e tests pass locally.
- Gotchas: never name the live env file `.env.production.local` (Next loads it at build time); it
  is now `.env.live`. Local e2e uses 2 workers and 30 s assertions because one `next start`
  process plus Supabase in Docker queue requests under load.

### 2026-11-24 — Phase 7a

- Designer at `/design/new` (from "Design online" in the price panel or "Use this template") and
  `/design/[id]` (owner only; others get 404 via RLS). react-konva stage in millimetres; elements
  drawn from the shared layout with text as glyph outlines from the print fonts, so the canvas
  matches the PDF/PNG. Bleed tint, trim line, safe-area guide, red outline on problem elements,
  "Preview as printed" mode.
- Select, drag, resize and rotate (Transformer, 45° snaps); side panel for text, font, size, colour
  swatches + picker, alignment, rotation, layer order, delete; add text / shape; undo/redo
  (buttons, Ctrl/Cmd+Z/Y); arrow-key nudging; live print check from `validateDocument` and live
  "shrunk to fit" status.
- Saving: `saveDesignAction` (Zod, size must match config, config must be orderable, RLS-scoped
  insert/update, locked designs refused); autosave 2 s after edits; visitors are sent to log in and
  their draft is restored and saved. `/account/designs` lists, opens and deletes (two-step) designs.
- Fonts moved to `public/fonts` so the browser loads the same TTFs as the server.
- `src/domain/design/document.ts` (blank, fit template to size, add/update/move/remove) + 7 tests.
  6 designer e2e tests; 56 e2e and 80 unit tests pass.
- Gotcha: in this environment the dev server's HMR socket fails inside the browser pane and pages
  do not hydrate; use a production build (`pnpm build`, then the "web-prod" preview) to try
  interactive features.

### 2026-11-24 — Phase 7b

- Print-area constraints are now enforced while editing (PRD p5 §06), not just reported:
  `src/domain/design/constraints.ts` (`limitsFor`, `clampCenter`, `fitsWithinLimits`,
  `constrainGeometry`) uses the same boundaries as `validateDocument` (print area, bleed allowance,
  safe area for text, rotation-aware). The canvas clamps drags (`dragBoundFunc`) and refuses
  resizes/rotations that would leave the area (Transformer `boundBoxFunc`); nudges and the rotation
  field go through `constrainGeometry`. Server validation stays as the backstop. 7 tests, including
  one proving every constrained result passes `validateDocument`.
- Undo history moved to `src/components/designer/history.ts`: rapid edits to one field (typing,
  number scrubbing, nudges) merge into one undo step (1.2 s window). 4 tests.
- Phones: the element panel is a bottom sheet (45vh) with a Done button; scroll room under the
  canvas keeps elements reachable above it; larger handles for coarse pointers.
- Designer e2e tests now also run at phone size; new tests for drag/resize clamping, one-step undo of
  typing and the bottom sheet. 93 unit and 64 e2e tests pass.
- Not done: clipping to ellipse print areas (no ellipse templates yet; validation still covers them).

### 2026-11-24 — Phase 8

- Uploads go straight from the browser to the customer's own folder in the `uploads` bucket (RLS),
  then `registerUploadAction` re-reads the stored bytes on the server and checks them
  (`src/domain/uploads.ts` + `src/server/assets.ts`): real type from magic bytes (PNG, JPEG, PDF,
  SVG; `.ai` only when PDF-compatible, with instructions otherwise), size limits, SVG safety
  (scripts, event handlers, external links, entities refused), PNG/JPEG dimensions, PDF page count,
  encryption, MediaBox/TrimBox. Rejected files are deleted. Rate limited (30 per 10 min).
- Server-side previews: PDFs/AI rasterised with pdf.js + @napi-rs/canvas, SVGs with resvg; stored
  next to the upload. Designer shows previews via short-lived signed URLs.
- Designer: "Image" (fills the selected logo slot, or adds a centred image) and "Upload finished
  artwork" (covers the bleed box when the file includes bleed; trim + note when it has none; fitted
  - note otherwise). Images keep proportions when resized; panel shows pixel size and effective DPI
    or "vector". Visitors are sent to log in first.
- Print checks gained severities: images below 150 DPI warn, below 72 DPI block; missing uploads
  block. Saving refuses images that are not the customer's own valid uploads.
- Renderers: PDF embeds PNG/JPEG as images, customer PDFs as **vector** form XObjects, SVGs
  rasterised at print resolution; PNG output draws all of them (PDFs rasterised server-side).
  `renderDocument` moved to `src/lib/print/render.ts` (testable); `loadAssetFiles` for later phases.
- Tests: 18 upload-rule tests, 4 image render tests (placement in both outputs, vector PDF, DPI
  rules, missing upload), 6 placement tests; 7 upload e2e tests. 121 unit + 71 e2e pass.
- Gotcha: don't use `require.resolve` in server code (Turbopack rewrites it to a module id).
- Gotcha: pdf.js loads `@napi-rs/canvas` with a dynamic require the bundle tracer can't follow, so
  on Vercel PDF previews failed ("could not be drawn") until `src/lib/print/rasterize.ts` imported
  it statically and passed its own canvas factory. Verified live: 10/10 upload + render e2e pass.
- Live e2e runs that save designs or upload files leave data in the demo customer account; clean it
  up afterwards (designs, asset rows and storage objects created since the run started).

### 2026-11-24 — Phase 9

- `src/server/payments.ts`: PaymentProvider + Stripe hosted Checkout (idempotency key, 24 h expiry,
  expire-old-session on retry, live keys refused). `src/lib/payments/events.ts` maps verified Stripe
  events to our own events (6 unit tests incl. real signature checks).
- `src/server/orders.ts`: `startCheckout` re-reads the design under RLS, re-validates it with the
  print engine (blocking issues refused), re-prices from the database, writes a `quote` order +
  order_items (with the new `design_snapshot` column) via the secret key, opens Checkout.
  `processPaymentEvent`: webhook_events idempotency, amount/currency must match the stored total,
  payments row (unique per payment), paid_at + invoice number, `transition_order` quote → order →
  artwork, confirmation notification.
- `POST /api/v1/webhooks/stripe` verifies the signature on the raw body (400 if invalid).
- Notifications (`src/server/notify.ts`): stored in-app, emailed via SMTP (Nodemailer) when set;
  local email goes to Mailpit (SMTP port 55325 exposed in config.toml).
- UI: "Order now" in the designer (saves first; disabled while the print check has errors),
  `/account/orders` list, `/account/orders/[id]` with pipeline timeline, totals, invoice number,
  "Confirming your payment…" polling after Stripe, "Pay now" for unpaid orders.
- 4 checkout e2e tests with Stripe-signed test events (processed once, duplicate replay, forged and
  tampered signatures, wrong amount, customer page, Mailpit email). 127 unit + 75 e2e pass.
- Verified live (2026-11-24): real Stripe test-mode payment for DH-2026-000007 (£16.20, card 4242):
  signed webhook processed once, order quote → order → artwork, INV-2026-000001, one succeeded
  payment, previous session expired by "Pay now", in-app + email notification recorded as sent.

### 2026-11-24 — Phase 10

- Migration `20261124130000_proof_workflow.sql`: `create_proof_version` (consecutive versions,
  supersedes open ones, artwork → proof), `approve_proof` and `request_proof_changes` (shared
  `lock_open_proof`: own order, status proof, latest pending version, row locks). Approval logs
  actor, IP, user agent and snapshot hash, sets `approved_proof_id` + `files_unlocked_at` and locks
  the design. Service role only. 17 new pgTAP tests (41 total); admin-count test made robust.
- `src/domain/canonical.ts`: canonical JSON for the snapshot hash (sha256 of document + config +
  upload hashes). `layoutToSvg` gained a `watermark` option (diagonal outlined text).
- `src/server/proofs.ts`: `generateProof` renders proof.png (150 DPI, guides, PROOF watermark) and
  proof.pdf (the print file itself, hash in keywords), uploads to `proofs/{order}/v{n}/{attempt}/`,
  records the version, emails "proof ready". Proof v1 runs after the webhook response (`after()`);
  the order page retries if no proof appeared 30 s after payment.
- Actions: approve, request changes (comment required), and "create proof vN from my saved
  design" after a change request (size/material/quantity must match what was paid for).
- UI: proof section on the order page (image, PDF link, confirmation checkbox, change request,
  history with hashes), "Proofs waiting for you" on the dashboard, "Proof approved" status label.
- 3 proof e2e tests (v1 after payment + PDF hash; change request → v2 → approve, stale second tab
  refused, audit log, design locked, emails; config change refused). 133 unit + 78 e2e pass.
- Live (2026-11-24): migration applied, 41 pgTAP tests pass on the live database, deployed.
  DH-2026-000007 (paid before this deploy) got proof v1 through the order-page retry: PNG + PDF in
  `proofs/`, status proof, "proof ready" in-app + email sent. Live e2e: 65 passed; one mobile
  configurator flake passed on re-run; the cron test now uses `E2E_CRON_SECRET` for live runs.
- Approval verified live (2026-11-24): customer approved DH-2026-000007 v1 in the browser. One
  `approved` event (actor, IP, user agent, hash = v1 hash), `approved_proof_id` = v1,
  `files_unlocked_at` set, design locked, "proof approved" in-app + email sent, page shows
  "Proof approved" with no decision buttons, dashboard has no waiting proofs.

### 2026-11-24 — Phase 11

- Migration `20261124150000_production_gate.sql`: a trigger refuses production file rows unless they
  belong to the order's approved proof after unlock; `start_production` moves proof → production
  only once the approved proof's print PDF exists (no-op when already in production). 9 pgTAP tests
  (50 total).
- `src/domain/production.ts`: `OrderID_ProductType_Date_Output` names (paid date in UTC, path-safe).
- Print engine: `mirror` option (SVG group flip, PDF content-stream flip; trim box unchanged) for
  products produced mirrored (stamps). Proofs are never mirrored.
- `src/server/production.ts`: renders from the approved proof's snapshot after re-hashing it
  (refuses if an upload changed), PDF dated with the paid date (byte-identical on regeneration),
  PNG at the product's output DPI, upserted into `production/{OrderID}/` + `production_files`,
  `start_production`, audit log, "in production" email.
- Admin: `/admin/production` queue (approved / in production), `/admin/orders/[id]` (approved
  proof, hash, IP, generate / regenerate, file list), downloads via
  `GET /api/v1/admin/production-files/[id]` (admin check in the route, audit log, 60 s signed link,
  404 for everyone else).
- Fixed: admin header was 20 px too wide on phones (tighter header buttons below 640 px).
- 4 e2e tests (generate + names + PNG size/DPI + download + hash in PDF + byte-identical regenerate +
  email; customers get 404 and never see file names; locked before approval; admin header at 360 px).
  137 unit + 82 e2e + 50 database tests pass.
- Live (2026-11-24): migration applied, 50 pgTAP tests pass on the live database, deployed.
  As admin, generated DH-2026-000007's files from `/admin/production`: `DH-2026-000007_custom-stickers_2026-11-24_print.pdf`
  (TrimBox 50 × 50 mm inside a 54 mm page, keywords carry the approved snapshot hash) and `…_print.png`
  (638 × 638 px, 300 DPI); both downloaded through the admin route (2 audit rows); the customer
  gets 404 on the route and sees "In production"; "in production" in-app + email sent. Live e2e:
  66 passed; one template-preview cold start passed on re-run.

### 2026-11-24 — Phase 12

- `src/domain/merge.ts` (pure, 10 tests): RFC 4180 CSV parser (quotes, embedded newlines, BOM,
  comma/semicolon/tab detection, row cap, cell/column limits, clear errors), placeholder → column
  mapping with name/synonym suggestions ("Same text on every item" = null), and per-row preflight
  through the same layout + print checks (empty values, overflow, missing glyphs = errors; duplicate
  race numbers = warnings).
- Migration `20261124170000_data_merge.sql`: `designs.data_merge` (locked with the design),
  one merge job per order, `create_proof_version` records the dataset hash atomically.
  5 pgTAP tests (55 total).
- Designer: "Personalise from a file" panel (upload CSV, column mapping, row preview on the canvas,
  per-row problems, sample CSV); quantity = rows; saved with the design and restored on reopen.
  CSV text goes to `uploadCsvAction` (≤ 256 KB), stored as a `csv` asset in the customer's folder.
- Checkout re-parses and re-checks every row with server fonts, prices by row count and freezes the
  rows in `merge_jobs` with their sha256. Revisions re-check the file and must keep the row count.
- Proofs: watermarked PNG of row 1 + print PDF with one page per row; the snapshot hash includes the
  dataset hash. Customer page explains the per-row PDF.
- Production: rows render in batches of 10 per request (PDF + PNG per row, `{OrderID}/rows/…_row-001.pdf`),
  the admin page loops with a progress bar; then a combined `print.pdf` and `rows.zip` (fflate 0.8.2,
  stored, fixed dates). Production refuses if the frozen rows no longer match the approved dataset hash.
- Tests: 148 unit, 55 database, 84 e2e (designer CSV flow; paid CSV order → 12-page proof → 24 row
  files + 12-page PDF + ZIP with 24 entries). Hardened a designer test against Next keeping the
  previous route mounted but hidden.
- Note: after `supabase db reset` locally, delete `.next` before testing (the build cache keeps old
  template ids) and run `pnpm seed:users`.
- Live (2026-11-24): migration applied, 55 pgTAP tests pass on the live database, deployed (e2bc0f8).
  Smoke test as the demo customer: 12-row CSV uploaded, columns auto-mapped, all rows ready,
  12 items priced, row preview works (test file deleted afterwards). Live e2e: 64 passed; 3 failed
  in a slow run and passed on re-run (27/27).
- Live paid CSV order DH-2026-000023 (12 rows, card 4242): checkout froze all 12 rows in
  `merge_jobs` with their sha256 and priced 12 items; proof v1 PDF has 12 pages and its dataset hash
  matches; the customer approved it. Admin "Generate print files" ran both batches: 12 row PDFs +
  12 row PNGs in `rows/`, a 12-page combined `print.pdf` (trim 148 × 210 mm), and a ZIP with 24
  entries; merge job `done` 12/12, order in production, `production.started` audited.

### 2026-11-24 — Phase 13

- Invoices: `src/domain/invoice.ts` (pure, 9 tests) builds a Xero-shaped VAT invoice (product line
  before discount, discount, setup, net subtotal, VAT, gross, paid, amount due) and refuses totals
  that do not add up. `src/server/invoices.ts` renders it to an A4 PDF with the embedded Inter
  fonts, dated the payment date, so the same invoice is always the same file.
  `GET /api/v1/invoices/{orderId}`: own paid orders (admins: any), 404 otherwise, rate-limited.
  Linked from the order page and the order list.
- One-click reorder (D-12, D-45): migration `20261124190000_reorders.sql` adds
  `orders.reorder_confirmation` and `approve_reorder_proof`, which approves a reorder's proof only
  when its snapshot hash equals the original's approved proof (same customer, confirmed, latest,
  pending), logged as `approved_via_reorder` with the confirmation's time, IP and browser.
  `src/server/reorders.ts` re-prices the approved snapshot at today's rates, re-hashes today's
  uploaded files (refuses if anything changed or was deleted), copies the frozen CSV rows and opens
  Stripe. After payment the proof is rendered from the same snapshot and approved at once.
  Order page: "Order this again" with the artwork confirmation checkbox; dashboard "Order again".
- Dashboard: order counts by stage (In progress, Awaiting payment, Completed) linking to the
  filtered order list (`?show=`); list rows show the date, invoice and reorder links.
- Admin order page shows reorder approvals with their note.
- Tests: 159 unit, 65 database (10 new), e2e `account.spec.ts` (invoice download, byte-identical
  re-download, 404s; reorder → Stripe → paid → auto-approved with the same hash; confirmation
  required; filters). Full local e2e: 85 passed; the only failure is the password-reset test when
  run on a second port (the email links to APP_URL :3000), unrelated.
- Live (2026-11-24): migration applied, 65 pgTAP tests pass on the live database, deployed (a3f0371).
  Invoices for DH-2026-000007 and DH-2026-000023 download as PDFs (INV-2026-000001/2), byte-identical
  on re-download; unknown ids and anonymous requests get 404.
- Live reorder DH-2026-000037 of DH-2026-000007 (card 4242): same £16.20 at today's prices; the
  confirmation (time, IP, browser, source hash) was stored; after payment proof v1 (source `reorder`)
  was approved automatically with the original's exact snapshot hash, logged as
  `approved_via_reorder`; print files unlocked; confirmation and approval emails sent; invoice
  INV-2026-000003 issued with "Reorder of DH-2026-000007".

### 2026-11-24 — Phase 14

- Migration `20261124210000_admin_console.sql`: `assert_admin`, `admin_user_directory` (search by
  email, name or company with order counts and paid totals; emails come from `auth.users`),
  `admin_set_role` (audited; never your own role, never the last admin, serialised) and
  `admin_order_action` (complete from production; cancel before production with a required reason;
  archive/unarchive finished orders; audited, actor recorded on the timeline). All service-role
  only and each re-checks the admin role. 18 pgTAP tests (83 total).
- `/admin/orders`: queue with stage tabs (plus "Approved, needs files"), active/archived/everything,
  search by order number or customer name/company/email, pagination; filters live in the URL
  (`src/domain/admin-queue.ts`, 5 tests). Overview stage counts link into it.
- Job detail: customer card (email, phone, invoice, original order of a reorder), pipeline actions
  (Mark complete / Cancel with reason / Archive), timeline with actor and note, full proof history
  with sources, staff activity from the audit log. Completion and cancellation email the customer.
- Corrected proofs (`source = admin_upload`): staff upload a PDF/AI/SVG/PNG/JPEG through a one-time
  signed URL into the customer's folder; it is inspected like any upload, placed as full-page
  artwork on the order's page size and becomes the next proof version for the customer to approve
  (not for CSV orders). Audited with an optional note.
- `/admin/users` and `/admin/users/[id]`: search, role filter, orders per user, role change with
  history.
- Fixes: the section nav can shrink inside grid layouts; on phones under 400 px with the Admin
  link, the header shows the logo mark without the wordmark (it overflowed at 360 px). Stripe
  redirects in e2e wait for navigation, not Stripe's full page load.
- Tests: 164 unit, 83 database, e2e `admin.spec.ts` (6: queue filters and search, customers
  blocked, complete + email + archive, cancel with reason + email, staff proof upload → v2 pending,
  user search + role change + self-protection). Full local run: all pass except the
  password-reset test when run on a second port (its email links to APP_URL :3000).
- Live (2026-11-24): migration applied, 83 pgTAP tests pass on the live database (the one admin is
  intact afterwards), deployed (0daa5f3). Signed-out visits to /admin/orders and /admin/users
  redirect to login; the user directory returns sign-in emails for an admin and refuses a customer.
