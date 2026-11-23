# Decisions log

The PRD (Digital Heroes PRD Level 2, v1.0, March 2026) says that where it is silent we should
make a reasonable decision, document it and be ready to defend it (p11). This file is that
record. Each entry says what the PRD says, what we decided, and why.

Status: **Locked** = shapes the schema, seed data or checkout, so changing it means code changes.
**Documented** = a policy we follow; no code impact yet.

---

## Locked decisions

### D-01 Payment provider — _Locked, pending signup check_

- **PRD:** Stripe or an equivalent PCI-compliant provider via an integrated checkout (p5 §05).
- **Decision:** Stripe in test mode, with hosted Checkout. If a Stripe account cannot be opened,
  use Razorpay in test mode instead. Both sit behind one `PaymentProvider` interface.
- **Why:** Hosted checkout keeps card data off our servers (lowest PCI scope) and gives signed
  webhooks. Razorpay is an accepted "equivalent provider".
- **Open:** confirm which provider before Phase 9. This also fixes D-02.

### D-02 Currency and tax — _Locked_

- **PRD:** VAT-inclusive totals shown at a glance (p5 §05). No currency or rate is given.
- **Decision:** Stripe → **GBP, 20% VAT**. Razorpay → **INR, 18% GST**. Currency, rate and tax
  label live in the `settings` table, not in code.
- **Why:** The PRD's vocabulary (VAT, Xero) points to a UK business. Razorpay is INR-first, so it
  is paired with INR and GST rather than GBP.

### D-03 Net prices, gross display — _Locked_

- **Decision:** All rates are entered **net**. Tax is calculated on the net subtotal and added
  on top. Customer-facing prices and totals are shown **including tax**.
- **Why:** Meets the VAT-inclusive display requirement, and matches Xero's invoice shape
  (net line amounts plus a tax line), keeping the accounting export clean (p5 §05, p9 §14).

### D-04 One order = one print job — _Locked_

- **Decision:** No cart. Each checkout creates one order for one configured product.
  The `order_items` table is still created so a cart can be added later.
- **Why:** Each print job has its own proof cycle and pipeline stage (p8 §11). Mixing jobs in one
  order would mean items at different stages inside one order.

### D-05 Flow order and pipeline — _Locked_

- **PRD pipeline:** Quote → Order → Artwork → Proof → Production → Completed (p8 §11).
- **Decision:**
  - `quote` = priced and created at checkout start, not yet paid (the PRD forbids quote forms, p5 §05).
  - `order` = payment confirmed by a verified webhook.
  - `artwork` = artwork attached and validated.
  - `proof` = a proof version is waiting for the customer.
  - `production` = proof approved and print files generated.
  - `completed` = job finished. `cancelled` is admin-only. Archiving is a flag, not a status.
- Transitions are enforced by a shared state machine and by a database trigger.

### D-06 Volume discounts — _Locked_

- **PRD:** Applied automatically from a defined quantity floor, e.g. from 100 units (p5 §05).
- **Decision:** All-units tiers (the whole quantity gets the tier's rate):
  **100+ → 10%, 250+ → 15%, 500+ → 20%**. Stored per product, with a global default.
- **Why:** All-units tiers are the print-industry norm and easy for customers to understand.
  The resulting "price cliff" (99 units can cost more than 100) is handled in the UI with an
  "add N more to save £X" hint.

### D-07 Shipping — _Locked_

- **PRD:** Silent on delivery.
- **Decision:** Out of scope. No delivery address, no delivery charge. Billing details are
  captured by the payment provider.
- **Why:** Not mentioned anywhere in the PRD. Adding it would add tables, a checkout step and
  a tax question for no assessed benefit. Documented as a known limitation.

### D-08 Print defaults per product — _Locked_

- **PRD:** Defined bleed and resolution per product type (p6 §07). No values given.
- **Decision:** Bleed **2 mm** for labels & stickers, **3 mm** for all other divisions.
  Output **300 DPI**. Safe margin **3 mm** inside the trim. Stored per product, editable by admin.

### D-09 Variable data (CSV merge) products — _Locked_

- **PRD:** CSV merge for race numbers and bulk jobs (p6 §07).
- **Decision:** Enabled for **race & event numbers** and **MTB boards** (both carry rider
  numbers). Maximum **100 rows** per CSV.
- **Why:** These are the two products where every item is personalised. The row cap keeps each
  merge comfortably inside free-tier storage and serverless time limits; it is a setting and
  can be raised.

### D-10 Who sees which files — _Locked_

- **PRD:** Customers see their orders "and its files" (p7 §09) but must never see production
  files (p7 §10). These conflict.
- **Decision:** Customers see their **own uploads, proofs and invoices**. **Production files are
  admin-only**, enforced by Row Level Security and a private storage bucket with no customer policy.

### D-11 Email confirmation at signup — _Locked_

- **Decision:** Off. Accounts are active immediately after signup.
- **Why:** Guarantees the test credentials handed to evaluators always work (p10 §15), and avoids
  the default Supabase email rate limit. Transactional emails (order, proof, completion) are
  still sent (p9 §13).

---

## Documented policies

- **D-12 Reorders** are charged at **current** prices and reuse the earlier proof approval. The
  customer confirms the artwork is unchanged; that confirmation is logged as a new approval event.
- **D-13 File names** follow `OrderID_ProductType_Date_Output` (p6 §07). _Date_ = the order's
  **paid date in UTC**, so regenerating files gives identical names.
- **D-14 Image resolution:** warn below **150 DPI** effective, block below **72 DPI**.
- **D-15 Colour** is **RGB only**. No CMYK/ICC conversion. Known limitation.
- **D-16 Cancellation** is admin-only. Refunds are done manually in the payment provider's dashboard.
- **D-17 "Manage users"** (p4 §03) = list and search users, view their orders, change role
  (audited). No admin-created accounts.
- **D-18 PRD wording:** "Score / configuration of saved designs" (p7 §10) is read as **"Store"**.
  "The eight outcomes" (p3 §02) lists seven; we read the eighth as per-order checkout (p5 §05).
- **D-19 Gallery** images are labelled as **sample work**; we have no real customer photos.
- **D-20 Adobe Illustrator uploads** are accepted only when saved with PDF compatibility (the
  file starts with `%PDF`); they are then handled as PDF. Older PostScript-only `.ai` files are
  rejected with instructions to re-save.
- **D-21 Not-found for catalogue pages:** division and product pages stream, so an unknown slug
  shows the branded "Page not found" page (marked noindex) with HTTP 200 rather than a 404 status.
  The alternative (`dynamicParams = false`) would hide divisions an admin adds until the next
  deploy, breaking PRD p9 §14. The admin area still returns a real 404 to non-admins (via the proxy).
- **D-22 Rounding:** prices are computed in exact decimals (decimal.js). The discounted line total
  is rounded to whole pence/paise **once**, half-up, then tax is computed on the net subtotal and
  rounded half-up. Per-unit prices are never rounded first (that overcharges small items: 25 stickers
  at 0.06764 is 169p, not 0.07 × 25 = 175p). The displayed discount is list minus line, so the
  breakdown always adds up exactly.
- **D-23 Orientation** is derived from the entered size (wider than tall = landscape; a square counts
  as portrait) and checked against the product's allowed orientations. It is never taken as input,
  so a request cannot claim one orientation with the other's dimensions.
- **D-24 Setup fees and option add-ons:** setup fees are per order line (not per unit) and are not
  discounted; option add-ons are per unit and are discounted with the rest of the unit price.
- **D-25 Configurator state in the URL:** the full configuration is kept in the query string so a
  quote can be shared, bookmarked, and resumed after signing up. The default quantity is 100 where
  the product allows it (it shows the first discount tier), otherwise the product minimum.
- **D-26 Text shaping:** one glyph per character, advance widths plus tracking, **no kerning and
  no ligatures**, in every renderer (fitting engine, PDF, PNG and later the canvas). Identical glyph
  placement everywhere matters more for print than kerning: what is approved is what is printed.
  (opentype.js's own shaping also fails on Inter's substitution tables.) Text fitting is single-line
  per placeholder; multi-line text boxes are a later enhancement.
- **D-27 Fonts:** three OFL fonts (Sora Bold, Inter SemiBold, Inter Regular), converted once from
  Fontsource's Latin WOFF files to TTF (`scripts/build-fonts.mts`) and committed with their licences.
  Characters outside the Latin subset are reported as "cannot print" rather than silently replaced.
- **D-28 Template previews are public:** `/api/v1/templates/:id/preview` renders active templates
  with sample text (PNG with guides, or a print-ready PDF). Templates are public catalogue data;
  the route is rate limited (30/min per IP).
- **D-29 Templates at other sizes:** a template designed at one size is fitted to the configured
  size by scaling positions and boxes per axis and type by the smaller factor; shapes that ran into
  the bleed keep reaching it. Bleed and safe margin always come from the product.
- **D-30 Visitors can design; saving needs an account:** on first save a visitor is sent to log in
  or sign up, the draft is kept in the browser and saved to their account automatically on return.
  Drafts may be saved with print issues; issues block proofs and checkout, not saving.
