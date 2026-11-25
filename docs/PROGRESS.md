# Progress

## Status

All features in the brief are built, deployed and verified on the live site. The application is
ready for evaluation.

- Live site: https://web-to-print-platform-phi.vercel.app (Vercel, functions in `bom1`)
- Database: Supabase (`ap-south-1`), daily keep-alive job so the free tier does not pause
- Repository: https://github.com/swayamDev/web-to-print-platform (pushes to `main` deploy)
- Demo accounts: `customer.demo@example.com` and `admin.demo@example.com`; passwords are kept out
  of the repository and shared privately

## Delivered

- [x] Project setup: Next.js, TypeScript strict, Tailwind, shadcn/ui, ESLint, Prettier, Vitest,
      Playwright
- [x] Database: schema, row-level security, private storage, seed catalogue, generated types
- [x] Accounts: sign-up, log in and out, password reset, customer and admin roles
- [x] Storefront: six-division hub, division and product pages, gallery
- [x] Pricing engine: decimal rates, volume tiers, VAT, server-confirmed price API
- [x] Product configurator with shareable quotes
- [x] Print engine: design document, text fitting, print-ready PDF and PNG
- [x] Design editor: templates, text, shapes, images, print-area limits, undo, save and reopen
- [x] Artwork uploads checked by content, with previews and resolution checks
- [x] Stripe Checkout with signed webhooks, order and invoice numbers, emails
- [x] Versioned proofs with approval or change requests and an immutable approval record
- [x] Production files from the approved snapshot, with secure staff downloads
- [x] CSV personalisation: mapping, per-row checks, one proof page and print file per row, ZIP
- [x] Customer dashboard, invoices and one-click reorder
- [x] Admin console: order queue and filters, job detail, pipeline actions, archive, users
- [x] Catalogue and template management, reports and Xero CSV export
- [x] Accessibility, responsive layout and performance checks
- [x] Security headers and CSP, rate limits, cross-tenant database tests
- [x] Documentation: README, schema, decisions, limitations, testing and results

## Verification on the live site (25 November 2026)

- Read-only smoke test of every public page, protected route, header and API: passed.
- Browser suite with the demo accounts: 107 passed, 5 failed and 100 skipped on the first run;
  the 5 were timeouts and passed on an immediate rerun.
- A full order, DH-2026-000115, verified end to end: Stripe test payment, signed webhook,
  12-page proof and approval, 26 print files at 300 DPI, signed downloads and emails.
- Customer and staff log in and log out, access rules and rate-limit identity verified.
- Automated test data was removed from the live database after a backup.

Details: [test results](TEST-RESULTS.md) and [testing guide](TESTING.md).

## Not yet verified

- An abandoned or cancelled payment on the live site (staff cancellation is covered by local
  tests).
- A physical phone or tablet (browser emulation only).
- A 100-row personalised order on the hosted plan (verified locally; 12 rows verified live).

## Open questions for the employer

- Is a labelled gallery of engine-rendered samples acceptable in place of real client work?
- Should print files generate automatically when the customer approves, rather than when staff
  start production?
- Is a separate assessment of saved designs expected?
- Are there terms for the public source code after assessment?

## Next up

- Submission is the owner's action: send the live link, the repository link and the demo
  credentials (privately).
- Possible follow-ups outside the brief (see [limitations](LIMITATIONS.md)): in-browser template
  layout editing, CMYK output, a cart, shipping, a live Xero connection.
