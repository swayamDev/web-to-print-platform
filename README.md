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

## Environment variables

Listed in [`.env.example`](.env.example). Real values live in `.env.local` locally and in the
hosting dashboard in production. They are never committed.

## Test accounts

Added once the app is deployed.
