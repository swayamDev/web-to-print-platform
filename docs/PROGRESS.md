# Progress

Update this file at the end of every work session: tick what is done, and write the exact
next step under **Next up** so work can resume cold.

## Next up

- Confirm the payment provider (D-01 in `DECISIONS.md`): try opening a Stripe account.
- Start **Phase 9** (checkout): confirm the payment provider first (D-01). `PaymentProvider`
  interface + Stripe hosted Checkout (test mode), checkout server action that re-prices on the
  server and refuses designs with blocking print issues, `quote` order + order_items rows, signed
  webhook with idempotency (`webhook_events`), `order` status + invoice number, success page that
  polls, confirmation email via SMTP, notifications table.
- Phase 6 must provide font ids used by seed templates: sora-bold, inter-semibold, inter-regular.

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
- [ ] **Phase 9** — Checkout, payment webhook, order capture, order numbers, first emails
- [ ] **Phase 10** — Proof versions, approve / request changes, immutable log, approval gate
- [ ] **Phase 11** — Production file generation, storage layout, secure admin download
- [ ] **Phase 12** — CSV variable-data merge (mapping, preflight, batched generation, ZIP)
- [ ] **Phase 13** — Customer dashboard, invoices, one-click reorder
- [ ] **Phase 14** — Admin console: queue, filters, job detail, pipeline actions, archive, users
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
