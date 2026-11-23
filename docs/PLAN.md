# Implementation plan (summary)

Source of truth for requirements: _Digital Heroes PRD — Level 2_, v1.0, March 2026.
Page and section references below look like `p5 §06`. Decisions on gaps in the PRD are in
[`DECISIONS.md`](DECISIONS.md); progress is tracked in [`PROGRESS.md`](PROGRESS.md).

## What we are building

A web-to-print platform for a print house with six divisions: labels & stickers, race & event
numbers, MTB boards, stamps, trophies, laser-cut work (p4 §04). Customers configure a product,
get an instant price, design in the browser or upload artwork, approve a versioned proof, pay,
track and reorder. Staff run every job through a production pipeline and download print-ready
files that the server generates (p6 §07).

## Architecture

- **One Next.js app** (App Router) on Vercel, with **Supabase** for Postgres, Auth and Storage.
- **`src/domain`** — pure TypeScript shared by browser and server: pricing, text fitting,
  design layout, order state machine, file naming.
- **`src/server`** — server-only services: auth guards, pricing/order/proof services, renderers,
  CSV merge, uploads, payments, email.
- **Reads** go through Row Level Security with the user's session. **Sensitive writes** (orders,
  proofs, payments, files) go only through server code.
- **The design document is the single source of truth**: JSON in millimetres. The browser canvas
  (react-konva), the PDF renderer (pdf-lib) and the PNG renderer (resvg) all draw from the same
  computed layout (`src/domain/design/layout.ts`), using the same font files and the same glyph
  placement (`src/lib/print/fonts.ts`).

## Key rules

- Physical sizes in **millimetres**; money in **integer minor units**; rates in decimals.
- The server **recalculates every price**; the amount charged comes only from the server.
- Production files unlock **only** after a proof is approved (p6 §08), and are **admin-only** (p7 §10).
- Print-file generation and CSV merge run **on the server** (p6 §07, p9 §13).
- New divisions and templates are **data**, not code (p9 §14).

## Order pipeline (p8 §11)

`quote → order → artwork → proof → production → completed`, plus admin-only `cancelled`.
Archive is a flag. Valid transitions live in `src/domain/orderStateMachine.ts` and are
enforced again by a database trigger.

## Pricing formula

```
area_cm2     = width_mm × height_mm / 100
unit_net     = base_unit + area_cm2 × material_rate_per_cm2 + material_per_unit
               + options + variable_data_fee
line_net     = unit_net × qty × (1 − tier_percent)       # all-units tiers, exact decimals
subtotal_net = round(line_net) + setup_fee
tax          = round(subtotal_net × tax_rate)
total_gross  = subtotal_net + tax                         # shown to the customer
```

## Print output

- PDF page = trim + 2 × bleed, in points (mm × 72 / 25.4), with TrimBox and BleedBox set,
  fonts embedded, text kept as vectors.
- PNG pixels = mm / 25.4 × DPI, with DPI metadata written.
- Stored in `production/{OrderID}/` as `OrderID_ProductType_Date_Output`; CSV rows in `rows/`.
- Preflight tests check page boxes, embedded fonts, extractable text, pixel size and DPI.

## Data model (Phase 1)

`profiles`, `divisions`, `products`, `materials`, `product_materials`, `discount_tiers`,
`settings`, `templates`, `designs`, `assets`, `orders`, `order_items`, `payments`,
`webhook_events`, `proof_versions`, `proof_events` (insert-only), `merge_jobs`,
`production_files`, `order_status_history`, `notifications`, `audit_logs`, `gallery_items`.

Storage buckets: `catalogue` (public: product, template and gallery images), `uploads` (per-user folder), `proofs`
(signed URLs after an ownership check), `production` (admin only).

## Testing

Vitest for domain and server logic; Playwright for the PRD testing checklist (p10 §16) at
phone and desktop sizes; a preflight suite for generated print files; RLS tests for
cross-customer isolation.
