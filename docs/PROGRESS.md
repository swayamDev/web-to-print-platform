# Progress

Update this file at the end of every work session: tick what is done, and write the exact
next step under **Next up** so work can resume cold.

## Next up

- Confirm the payment provider (D-01 in `DECISIONS.md`): try opening a Stripe account.
- **Finish Phase 3: first deploy.** Needs the user: new Supabase project, GitHub repo, new Vercel
  account. Follow `docs/DEPLOYMENT.md` step by step, then run the smoke test there.
- Then **Phase 4**: pricing engine in `src/domain/pricing.ts` (decimal maths, all-units tiers, tax,
  line-level rounding) with table-driven tests, plus `POST /api/v1/price`.
- Phase 6 must provide font ids used by seed templates: sora-bold, inter-semibold, inter-regular.

## Phases

- [x] **Phase 0** — Repository and tooling (Next.js, TypeScript strict, Tailwind, shadcn/ui,
      ESLint, Prettier, Vitest, Playwright, docs)
- [x] **Phase 1** — Supabase schema, RLS, storage buckets and policies, seed data, generated types
- [x] **Phase 2** — Auth and roles (login, signup, reset, guards, admin seed, account/admin shells)
- [~] **Phase 3** — Design system, public shell, home hub, **first deploy** (new Vercel account,
  new Supabase project, env vars, daily keep-alive cron)
- [ ] **Phase 4** — Pricing engine (pure, decimal maths, tiers, tax, rounding) + price API + tests
- [ ] **Phase 5** — Product page and live configurator
- [ ] **Phase 6** — Render spike: design document schema, layout, text fitting, server PDF and PNG,
      verified on Vercel
- [ ] **Phase 7a** — Designer: canvas, text, images, fonts, colours, save and reopen
- [ ] **Phase 7b** — Designer: print-area constraints, clipping, preview-as-printed, mobile
- [ ] **Phase 8** — Artwork uploads (PDF, SVG, AI, PNG) with validation and previews
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
