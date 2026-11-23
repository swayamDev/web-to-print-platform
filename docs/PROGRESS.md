# Progress

Update this file at the end of every work session: tick what is done, and write the exact
next step under **Next up** so work can resume cold.

## Next up

- Confirm the payment provider (D-01 in `DECISIONS.md`): try opening a Stripe account.
- Install Playwright browsers once (`pnpm exec playwright install chromium`) and run `pnpm test:e2e`.
- Start **Phase 2**: `@supabase/ssr` clients (browser, server, service-role in `src/server`),
  middleware, login / signup / reset / logout, `requireUser` / `requireAdmin`, admin seed script,
  `/account` and `/admin` shells. Copy local keys from `pnpm exec supabase status` into `.env.local`.
- Phase 6 must provide font ids used by seed templates: sora-bold, inter-semibold, inter-regular.

## Phases

- [x] **Phase 0** — Repository and tooling (Next.js, TypeScript strict, Tailwind, shadcn/ui,
      ESLint, Prettier, Vitest, Playwright, docs)
- [x] **Phase 1** — Supabase schema, RLS, storage buckets and policies, seed data, generated types
- [ ] **Phase 2** — Auth and roles (login, signup, reset, guards, admin seed, account/admin shells)
- [ ] **Phase 3** — Design system, public shell, home hub, **first deploy** (new Vercel account,
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
