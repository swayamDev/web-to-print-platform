# Test results

## Phase 4 production storefront

- ESLint and TypeScript passed. Default Vitest passed 187 tests and the loopback pgTAP suite
  passed 148 checks.
- The first production browser run found seven regressions caused by narrow header overflow
  and contrast in the existing dark price panel. The fixes preserved the test assertions.
- The next full browser run passed 142 tests and skipped the same 59 as the handover baseline.
  Five desktop tests timed out at login when repeated runs reached a fixture account's existing
  15-minute rate window. All five passed after rollover in a single-worker targeted rerun.
  The 147 executed cases therefore passed across two runs. Authentication limits stayed in place.
- The targeted rerun rebuilt the application with the monospaced font preloaded and a monospaced
  fallback. The final production-build Chromium checks covered 19 viewport and session cases
  with eight axe scans and no reported issues. The local capture report in
  `handover/references/phase-4/qa.json` records responsive widths, image loading, keyboard
  checks, account states, axe scans and observed layout shifts. Firefox and WebKit binaries were
  unavailable in the local Playwright installation.
- Live verification and physical-device touch verification remain pending. The existing mobile
  transformer resize skip is still present.

## Handover baseline, 25 November 2026

| Check | Fresh result |
| --- | --- |
| `pnpm lint` | Passed |
| `pnpm exec tsc --noEmit --incremental false` | Passed |
| `pnpm test` | 187 passed across 20 files under the default configuration |
| Mirrored artwork test in isolation | Passed |
| `pnpm db:test` | 148 passed across 9 files against local Supabase |
| `pnpm test:e2e` | 147 passed, 59 skipped, 0 failed across desktop and mobile on a local production build |
| Live checks | Historical results below. Fresh verification remains pending. |

The initial audit's default Vitest run timed out in the mirrored artwork test at five seconds.
The audit's serial rerun passed, and the Phase 1 default and focused runs both passed.
The test creates four Resvg renderers with system fonts enabled by default before checking PDF
output. In a local four-render comparison using a text-free SVG, loading system fonts took about
2.48 seconds versus 1 millisecond with loading disabled. Both variants returned the same sampled
pixel value. This identifies avoidable setup cost. It does not reproduce the original timeout.
Production already disables system-font loading for outlined artwork. A proposed test-only fix
would render each orientation once and sample both sides of its result with font discovery
disabled. The proposal retains the existing timeout and assertions. Phase 1 made no test edits.

## Historical Phase 18 results

Final run on **25 November 2026**, after Phase 18. How to run them: [`TESTING.md`](TESTING.md).

## Summary

| Suite                                    | Where                                             | Result                                                                                                                   |
| ---------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Lint (ESLint) and types (`tsc --noEmit`) | local                                             | clean                                                                                                                    |
| Unit and integration (Vitest), 20 files  | local                                             | **187 passed**                                                                                                           |
| Database (pgTAP), 9 files                | local Supabase                                    | **148 passed**                                                                                                           |
| Database (pgTAP), 9 files                | **live** Supabase (in a transaction, rolled back) | **148 passed**                                                                                                           |
| End to end (Playwright), phone + desktop | local production build on :3000                   | **147 passed**, 0 failed (59 skipped by design: viewport-specific tests and live-only checks)                            |
| End to end (Playwright), phone + desktop | **live site** with the live test accounts         | **109 passed**, 0 failed after one test fix (93 skipped: tests that need the secret key, local email or create accounts) |

The one live failure in the final run was the designer's save test expecting the momentary
"Saved 14:05" status; on the live site the redirect back reloads the design, which then shows
"All changes saved". The test now accepts either and passed 3/3 on live and locally.

## What the suites cover

- **Unit:** pricing (tiers, rounding, limits), design layout and validation (out-of-area, overflow,
  tampered documents), CSV parsing and row checks, uploads (format by content, DPI), production
  file naming, invoices, reports, Xero export, admin filters, catalogue edit validation.
- **Database:** the order state machine and approval gate, proof workflow, production gate, CSV
  merge, reorders, admin console, catalogue admin, gallery, and **cross-tenant isolation (49 checks)**.
- **End to end:** the PRD's 11-item testing checklist (mapped in [`TESTING.md`](TESTING.md)), plus
  WCAG 2.1 AA scans of 21 pages, no sideways scrolling at 360/768/1280 px, no layout shift on public
  pages, security headers and CSP, and a live site check of every flow that does not need test
  data.

## Live site checks (Phase 18)

- Every public page, all six divisions and all six products answer 200; account and admin pages
  redirect signed-out visitors; the cron endpoint refuses calls without its secret (401); unknown
  pages answer 404; the price API answers.
- Verified end to end on the live site during development: a paid sticker order with proof approval
  and print files (DH-2026-000007), a paid 12-row CSV order with a 12-page proof, 24 row files and a
  ZIP (DH-2026-000023), a one-click reorder approved automatically with the original hash
  (DH-2026-000037), invoices, admin completion with email, reports and a Xero CSV whose three
  invoices each add up to the penny.
- No secrets in the repository or its history; only `.env.example` is tracked.
