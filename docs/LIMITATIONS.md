# Known limitations

What this build deliberately does not do, or does in a simpler way, and why. Decision numbers
refer to [`DECISIONS.md`](DECISIONS.md).

## Demonstration setup

- **Test-mode payments only.** Stripe runs in test mode; live keys are refused unless
  `ALLOW_LIVE_PAYMENTS=true` (D-35). Card `4242 4242 4242 4242` completes a payment.
- **Sample prices and sample work.** All rates are illustrative, and the gallery shows sample pieces
  rendered by the print engine, labelled as such (D-19, D-53). The demo company has no VAT number.
- **Free-tier hosting.** Supabase pauses free projects after a week without activity; a daily Vercel
  cron (`/api/cron/keepalive`) touches the database to prevent that.
- **Email** goes through a plain SMTP account, so delivery depends on that account's limits. Every
  message is also stored and shown in-app (D-34).

## Ordering and payments

- **No cart:** one order is one print job (D-04). The data model has order lines, so a cart can be
  added later.
- **No shipping:** no delivery address or delivery charge; billing details come from Stripe (D-07).
- **Refunds are manual** in the Stripe dashboard after an admin cancels (D-16). Paid-then-cancelled
  orders are listed separately in reports and marked in the Xero export.
- **Razorpay** was planned as a fallback provider and is not implemented (D-01).
- **One currency per deployment** (GBP with 20% VAT), set in `settings` (D-02).

## Design and print output

- **RGB only:** no CMYK conversion or ICC profiles (D-15). Print files are RGB PDFs and PNGs.
- **Text:** three Latin fonts; characters outside the Latin set are reported as "cannot print"
  rather than replaced (D-27). Single-line text boxes with shrink-to-fit; no kerning or ligatures,
  so what is approved is exactly what is printed (D-26).
- **Uploads:** PDFs use their first page; Illustrator files must be saved with PDF compatibility
  (D-20). Images under 72 DPI at print size are blocked, under 150 DPI warned (D-14).
- **CSV merge:** up to 100 rows per order (a setting), one item per row (D-09, D-41).
- **Template layouts** are edited as JSON, not in the browser; admins manage names, groups, order
  and visibility (D-52).
- **Staff-corrected proofs** replace the artwork with one uploaded file, and are not offered for
  CSV orders (D-48).

## Admin and accounting

- **Xero:** a CSV in Xero's import layout, not a live API connection; payments are reconciled from
  Stripe's feed in Xero (D-50).
- **Reports** read up to 5,000 orders per period and periods up to two years; longer ranges should
  be split.
- **Users:** admins can search users and change roles; they cannot create accounts or impersonate
  customers (D-17).

## Security

- **CSP allows inline scripts** because pages are prerendered and cached, so a per-request nonce is
  not possible; eval, plugins, framing and foreign form targets are blocked (D-55).
- **Rate limits** are fixed-window counters in Postgres; they stop guessing and abuse at the scale
  of this demo, not a distributed attack (D-56).
