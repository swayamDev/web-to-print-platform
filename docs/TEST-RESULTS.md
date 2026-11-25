# Test results

## Frozen Phase 6.8 application

- Application commit `0f1c7a9e0416c679b498c6acfab29e42407c5379`. The production build, TypeScript, ESLint and copy checks passed. The isolated Vitest repeat passed 189 tests after one concurrent timeout. Local pgTAP passed 148 assertions.
- Initial Playwright matrix across five profiles recorded 378 passes, 28 failures, 132 conditional skips and two unexecuted cases. The original results and scoped reruns reconcile to 408 passes, 132 conditional skips and zero unresolved failures.
- The locally approved 100-row fixture generated 100-page proof and combined production PDFs plus 200 individual files. Early WebKit canonical duplication, the concurrent Node listener warning and hosted verification are open.
- The ignored Phase 6.8 and 6.9 archives retain the evidence and the final verification report. Historical runs below describe their respective revisions.

## Phase 6.2 documentation, copy, indexing and accessibility

- The local production build, TypeScript, ESLint and `pnpm copy:check` passed. Four focused
  Vitest files passed 51 tests covering pricing, queue filters, invoices and the Xero export.
- The initial targeted Playwright run recorded 54 passes, two viewport skips and two failures
  from the homepage canonical assertion treating a trailing slash as significant.
- The expanded run recorded 67 passes, 16 viewport skips and three assertion failures.
  The metadata assertions were corrected to compare URLs and browser titles, and the proof
  audit assertion was aligned with the approved punctuation change. The two metadata cases
  and the staff proof upload case all passed on separate focused reruns.
- Desktop and mobile Chromium covered public metadata, private indexing headers and role
  guards, local checkout and email, proof and storefront flows, and the existing axe scans.
  Keyboard measurements found all seven staff links fully visible on focus at 320, 390, 430 and
  1440 px after the change. Hosted verification, physical-device touch and the full
  Chromium/Firefox/WebKit regression are pending. The full suite is required in Phase 6.8.

## Assessment closure

- Production build, ESLint and TypeScript passed. The focused Vitest queue suite passed seven tests.
- Four Playwright cases passed on the local production build. They covered inclusive UTC date
  boundaries, product/date combinations, retained stage filters, a reversed date range, the queue
  at 360 px, the existing search and role guard, and the admin axe scan.
- Hosted Stripe test checkout, email delivery, evaluator roles and production downloads remain
  pending on the submission revision. The checks in this run used local fixtures only.

## Phase 5 configurator, editor and checkout

- The local production build, ESLint and TypeScript passed. Local pgTAP passed all 148 checks.
  The final standard Vitest run passed all 187 tests. Two existing PNG tests timed out while
  other checks were running, and both also passed in the extended-timeout run.
- The full local Playwright run recorded 141 passes, 61 skips and six desktop timeouts. The
  focused rerun recorded 16 passes and 10 skips. It passed all six timed-out cases, including
  password reset on the local Supabase redirect port, and reran checkout and proofs after the
  confirmation layout fix. The Chromium touch resize case passed in the full run and in isolation.
  The existing mouse-only mobile resize skip remains in place.
- The local runner creates a fresh customer and admin per run and uses signed Stripe webhook
  fixtures. The hosted Checkout case requires separate test-mode verification. The recorded
  skips include this case and the desktop project skip for the new emulated touch test.
- The local Phase 5 export records 34 Chromium viewport and state checks. There were no reported
  axe violations, horizontal overflow or failed image loads in those checks. The maximum
  observed CLS was 0.009449. At 768 px, confirmation improved from 0.169553 to 0.000332.
  Firefox and WebKit passed focused mobile smoke checks. Physical-device touch and live
  verification remain pending.

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

| Check                                        | Fresh result                                                                           |
| -------------------------------------------- | -------------------------------------------------------------------------------------- |
| `pnpm lint`                                  | Passed                                                                                 |
| `pnpm exec tsc --noEmit --incremental false` | Passed                                                                                 |
| `pnpm test`                                  | 187 passed across 20 files under the default configuration                             |
| Mirrored artwork test in isolation           | Passed                                                                                 |
| `pnpm db:test`                               | 148 passed across 9 files against local Supabase                                       |
| `pnpm test:e2e`                              | 147 passed, 59 skipped, 0 failed across desktop and mobile on a local production build |
| Live checks                                  | Historical results below. Fresh verification remains pending.                          |

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
