# Web-to-Print Platform

A web-to-print storefront and production console for a print house with six divisions:
labels & stickers, race & event numbers, MTB boards, stamps, trophies and laser-cut work.
Built for the Digital Heroes Level 2 assessment.

> **Status:** early development. See [`docs/PROGRESS.md`](docs/PROGRESS.md).

## Documentation

- [`docs/PLAN.md`](docs/PLAN.md) — architecture, rules, pipeline, pricing and print-output design
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — how gaps and ambiguities in the brief were resolved
- [`docs/PROGRESS.md`](docs/PROGRESS.md) — phase checklist

## Stack

Next.js (App Router) · React · TypeScript (strict) · Tailwind CSS · shadcn/ui ·
Supabase (Postgres, Auth, Storage) · Vitest · Playwright.

## Local setup

Requirements: Node.js 20+ and pnpm.

```bash
pnpm install
cp .env.example .env.local   # then fill in the values
pnpm dev                     # http://localhost:3000
```

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
file. Credentials for the deployed site will be listed here at submission.

## Running the end-to-end tests

```bash
pnpm db:start                          # local Supabase (Docker)
pnpm seed:users                        # test accounts
pnpm exec playwright install chromium  # once
pnpm test:e2e
```
