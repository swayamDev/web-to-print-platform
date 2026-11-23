-- =============================================================================
-- Core schema: catalogue, designs, orders, proofs, production, notifications.
--
-- Conventions
--   * Physical sizes are millimetres (numeric).
--   * Money totals are integer minor units (pence / paise), suffix _minor.
--   * Per-unit rates can be fractions of a minor unit, so they are numeric.
--   * Every table gets RLS in a later migration; nothing here is readable until then.
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.user_role as enum ('customer', 'admin');

-- PRD pipeline (p8 §11): quote -> order -> artwork -> proof -> production -> completed.
-- cancelled is admin-only. Archiving is a timestamp, not a status (DECISIONS D-05).
create type public.order_status as enum (
  'quote', 'order', 'artwork', 'proof', 'production', 'completed', 'cancelled'
);

create type public.pricing_model as enum ('area', 'unit');
create type public.design_source as enum ('editor', 'upload');
create type public.asset_kind as enum ('logo', 'artwork', 'csv');
create type public.asset_status as enum ('pending', 'valid', 'rejected');
create type public.proof_status as enum ('pending', 'changes_requested', 'approved', 'superseded');
create type public.proof_source as enum ('customer_edit', 'admin_upload', 'reorder');
create type public.proof_action as enum ('approved', 'changes_requested', 'approved_via_reorder');
create type public.merge_status as enum ('validated', 'processing', 'done', 'failed');
create type public.production_file_kind as enum ('pdf', 'png', 'row_pdf', 'row_png', 'zip');
create type public.payment_status as enum ('pending', 'succeeded', 'failed', 'refunded');
create type public.notification_channel as enum ('email', 'in_app');
create type public.notification_status as enum ('queued', 'sent', 'failed');

-- -----------------------------------------------------------------------------
-- Users
-- -----------------------------------------------------------------------------
create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  full_name        text,
  company_name     text,
  phone            text,
  role             public.user_role not null default 'customer',
  -- Future corporate / multi-account ordering (PRD p9 §14). Unused for now.
  organization_id  uuid,
  marketing_opt_in boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.profiles is 'One row per auth user. role decides customer vs admin access.';

-- -----------------------------------------------------------------------------
-- Settings (single row)
-- -----------------------------------------------------------------------------
create table public.settings (
  id                 boolean primary key default true check (id),
  currency           char(3) not null default 'GBP' check (currency in ('GBP', 'INR')),
  tax_rate           numeric(5, 4) not null default 0.2000 check (tax_rate >= 0 and tax_rate < 1),
  tax_label          text not null default 'VAT',
  prices_entered_net boolean not null default true,
  max_csv_rows       integer not null default 100 check (max_csv_rows between 1 and 5000),
  company_legal      jsonb not null default '{}'::jsonb,
  support_email      text,
  updated_at         timestamptz not null default now()
);
comment on table public.settings is 'Business settings: currency, tax, CSV limit, invoice details (DECISIONS D-02, D-09).';

-- -----------------------------------------------------------------------------
-- Catalogue
-- -----------------------------------------------------------------------------
create table public.divisions (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name            text not null,
  tagline         text,
  description     text,
  hero_image_path text,
  sort_order      integer not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table public.divisions is 'The six print divisions (PRD p4 §04). New divisions are rows, not code.';

create table public.products (
  id                     uuid primary key default gen_random_uuid(),
  division_id            uuid not null references public.divisions (id) on delete restrict,
  slug                   text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name                   text not null,
  short_description      text,
  description            text,

  -- Pricing inputs (see docs/PLAN.md "Pricing formula").
  pricing_model          public.pricing_model not null default 'area',
  base_unit_price        numeric(12, 4) not null default 0 check (base_unit_price >= 0),
  setup_fee_minor        integer not null default 0 check (setup_fee_minor >= 0),
  variable_data_unit_fee numeric(12, 4) not null default 0 check (variable_data_unit_fee >= 0),

  -- Parameter-driven sizing (PRD p4 §04): one product, any size within limits.
  min_width_mm           numeric(8, 2) not null check (min_width_mm > 0),
  max_width_mm           numeric(8, 2) not null,
  min_height_mm          numeric(8, 2) not null check (min_height_mm > 0),
  max_height_mm          numeric(8, 2) not null,
  default_width_mm       numeric(8, 2) not null,
  default_height_mm      numeric(8, 2) not null,
  allow_custom_size      boolean not null default true,
  -- Convenience presets, e.g. [{"label":"A5","width_mm":148,"height_mm":210}]. Not SKUs.
  size_presets           jsonb not null default '[]'::jsonb,
  orientations           text[] not null default array['portrait', 'landscape'],

  -- Print production defaults (DECISIONS D-08).
  bleed_mm               numeric(5, 2) not null default 3 check (bleed_mm >= 0 and bleed_mm <= 20),
  safe_margin_mm         numeric(5, 2) not null default 3 check (safe_margin_mm >= 0 and safe_margin_mm <= 50),
  output_dpi             integer not null default 300 check (output_dpi between 72 and 1200),
  mirror_output          boolean not null default false,

  -- Quantity rules.
  min_qty                integer not null default 1 check (min_qty >= 1),
  max_qty                integer not null default 10000,
  qty_step               integer not null default 1 check (qty_step >= 1),

  -- Variable-data (CSV merge) support (DECISIONS D-09).
  supports_variable_data boolean not null default false,

  -- Extra option groups with price modifiers, validated by Zod in the app, e.g.
  -- [{"key":"ink","label":"Ink colour","values":[{"value":"black","label":"Black","price_per_unit":0,"default":true}]}]
  options                jsonb not null default '[]'::jsonb,

  sort_order             integer not null default 0,
  is_active              boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint products_width_range check (max_width_mm >= min_width_mm),
  constraint products_height_range check (max_height_mm >= min_height_mm),
  constraint products_default_width check (default_width_mm between min_width_mm and max_width_mm),
  constraint products_default_height check (default_height_mm between min_height_mm and max_height_mm),
  constraint products_qty_range check (max_qty >= min_qty),
  constraint products_orientations check (
    orientations <@ array['portrait', 'landscape'] and cardinality(orientations) >= 1
  ),
  constraint products_options_is_array check (jsonb_typeof(options) = 'array'),
  constraint products_presets_is_array check (jsonb_typeof(size_presets) = 'array')
);
create index products_division_active_idx on public.products (division_id, is_active, sort_order);
comment on table public.products is 'Parameter-driven products: size, material, orientation and quantity are configured, not listed as SKUs.';

create table public.materials (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text not null,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.product_materials (
  product_id     uuid not null references public.products (id) on delete cascade,
  material_id    uuid not null references public.materials (id) on delete restrict,
  price_per_cm2  numeric(12, 6) not null default 0 check (price_per_cm2 >= 0),
  price_per_unit numeric(12, 4) not null default 0 check (price_per_unit >= 0),
  is_default     boolean not null default false,
  sort_order     integer not null default 0,
  primary key (product_id, material_id)
);
create unique index product_materials_one_default_idx
  on public.product_materials (product_id) where is_default;
comment on table public.product_materials is 'Which materials a product offers, and their price rates.';

create table public.discount_tiers (
  id          uuid primary key default gen_random_uuid(),
  -- null = global default tier, used when a product has no tiers of its own.
  product_id  uuid references public.products (id) on delete cascade,
  min_qty     integer not null check (min_qty >= 2),
  percent_off numeric(5, 2) not null check (percent_off > 0 and percent_off < 100),
  created_at  timestamptz not null default now(),
  constraint discount_tiers_unique unique nulls not distinct (product_id, min_qty)
);
comment on table public.discount_tiers is 'All-units volume discounts (DECISIONS D-06). product_id null = global default.';

create table public.templates (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references public.products (id) on delete cascade,
  name           text not null,
  -- "Template groups" (PRD p9 §14), e.g. "Running", "Cycling", "Corporate".
  group_name     text,
  description    text,
  -- DesignDocument JSON (see src/domain once Phase 6 lands): print areas, placeholders, elements.
  document       jsonb not null,
  thumbnail_path text,
  sort_order     integer not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint templates_document_is_object check (jsonb_typeof(document) = 'object')
);
create index templates_product_idx on public.templates (product_id, is_active, sort_order);

create table public.gallery_items (
  id          uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions (id) on delete cascade,
  title       text not null,
  caption     text,
  image_path  text not null,
  -- Shown as "Sample work" in the UI (DECISIONS D-19).
  is_sample   boolean not null default true,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index gallery_items_division_idx on public.gallery_items (division_id, is_active, sort_order);

-- -----------------------------------------------------------------------------
-- Customer artwork
-- -----------------------------------------------------------------------------
create table public.assets (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references public.profiles (id) on delete cascade,
  bucket            text not null default 'uploads',
  path              text not null unique,
  kind              public.asset_kind not null,
  original_filename text,
  mime_type         text,
  bytes             bigint check (bytes >= 0),
  sha256            text,
  width_px          integer,
  height_px         integer,
  page_count        integer,
  page_size_mm      jsonb,
  status            public.asset_status not null default 'pending',
  -- Validation results: detected format, effective DPI, warnings, rejection reason.
  validation        jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);
create index assets_owner_idx on public.assets (owner_id, created_at desc);
comment on table public.assets is 'Uploaded files (logos, finished artwork, CSV data). Validated server-side by magic bytes.';

create table public.designs (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles (id) on delete cascade,
  product_id      uuid not null references public.products (id) on delete restrict,
  template_id     uuid references public.templates (id) on delete set null,
  name            text not null default 'Untitled design',
  -- Product configuration: width_mm, height_mm, orientation, material, options, quantity.
  config          jsonb not null default '{}'::jsonb,
  source          public.design_source not null default 'editor',
  -- DesignDocument JSON for editor designs; null for upload-only designs.
  document        jsonb,
  upload_asset_id uuid references public.assets (id) on delete set null,
  thumbnail_path  text,
  -- Locked once used in an approved proof. Editing a locked design means copying it.
  is_locked       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint designs_has_artwork check (
    (source = 'editor' and document is not null) or (source = 'upload')
  )
);
create index designs_owner_idx on public.designs (owner_id, updated_at desc);
comment on table public.designs is 'Saved designs (PRD p5 §06, p7 §09). Reused for one-click reorder.';

-- -----------------------------------------------------------------------------
-- Orders and payments
-- -----------------------------------------------------------------------------
create sequence public.order_number_seq;
create sequence public.invoice_number_seq;

create table public.orders (
  id                  uuid primary key default gen_random_uuid(),
  -- Human-facing ID used in file names (PRD p6 §07), e.g. DH-2026-000123.
  order_number        text not null unique default (
    'DH-' || to_char(now() at time zone 'utc', 'YYYY') || '-' ||
    lpad(nextval('public.order_number_seq')::text, 6, '0')
  ),
  customer_id         uuid not null references public.profiles (id) on delete restrict,
  status              public.order_status not null default 'quote',

  -- Price breakdown, fixed by the server at checkout (never from the client).
  currency            char(3) not null check (currency in ('GBP', 'INR')),
  -- Net after volume discount, plus setup fee.
  subtotal_net_minor  integer not null check (subtotal_net_minor >= 0),
  -- Informational: how much the volume discount saved, net.
  discount_minor      integer not null default 0 check (discount_minor >= 0),
  tax_rate            numeric(5, 4) not null check (tax_rate >= 0 and tax_rate < 1),
  tax_minor           integer not null check (tax_minor >= 0),
  total_gross_minor   integer not null check (total_gross_minor >= 0),
  -- Every input and rule used to compute the price, for audit and invoices.
  pricing_snapshot    jsonb not null,

  payment_provider    text,
  checkout_session_id text unique,
  paid_at             timestamptz,
  invoice_number      text unique,

  -- Approval gate (PRD p6 §08): set only when a proof is approved.
  approved_proof_id   uuid,
  files_unlocked_at   timestamptz,

  archived_at         timestamptz,
  cancelled_at        timestamptz,
  reorder_of_order_id uuid references public.orders (id) on delete set null,
  billing_details     jsonb not null default '{}'::jsonb,
  -- Reserved for the future Xero API integration (PRD p9 §14).
  xero_invoice_id     text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint orders_total_adds_up check (total_gross_minor = subtotal_net_minor + tax_minor),
  constraint orders_unlock_needs_approval check (files_unlocked_at is null or approved_proof_id is not null)
);
create index orders_status_idx on public.orders (status, created_at desc);
create index orders_customer_idx on public.orders (customer_id, created_at desc);
create index orders_archived_idx on public.orders (archived_at);
create index orders_number_trgm_idx on public.orders using gin (order_number extensions.gin_trgm_ops);
comment on table public.orders is 'One order = one print job (DECISIONS D-04). Status follows the PRD pipeline.';

create table public.order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders (id) on delete cascade,
  product_id       uuid not null references public.products (id) on delete restrict,
  design_id        uuid references public.designs (id) on delete set null,
  description      text not null,
  config_snapshot  jsonb not null,
  quantity         integer not null check (quantity > 0),
  unit_net         numeric(12, 4) not null check (unit_net >= 0),
  discount_percent numeric(5, 2) not null default 0,
  line_net_minor   integer not null check (line_net_minor >= 0),
  line_tax_minor   integer not null check (line_tax_minor >= 0),
  line_gross_minor integer not null check (line_gross_minor >= 0),
  is_variable_data boolean not null default false,
  created_at       timestamptz not null default now()
);
create index order_items_order_idx on public.order_items (order_id);
comment on table public.order_items is 'Xero-shaped invoice lines. One per order for now; ready for a future cart.';

create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders (id) on delete restrict,
  provider            text not null,
  provider_payment_id text not null,
  amount_minor        integer not null check (amount_minor >= 0),
  currency            char(3) not null,
  status              public.payment_status not null,
  raw                 jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  constraint payments_provider_ref_unique unique (provider, provider_payment_id)
);
create index payments_order_idx on public.payments (order_id);

-- Idempotency for payment webhooks: an event is processed at most once.
create table public.webhook_events (
  provider     text not null,
  event_id     text not null,
  event_type   text not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  primary key (provider, event_id)
);

-- -----------------------------------------------------------------------------
-- Proofs (PRD p6 §08)
-- -----------------------------------------------------------------------------
create table public.proof_versions (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.orders (id) on delete restrict,
  version            integer not null check (version > 0),
  source             public.proof_source not null,
  -- Immutable copy of exactly what the customer is approving.
  document_snapshot  jsonb,
  config_snapshot    jsonb not null,
  upload_asset_id    uuid references public.assets (id) on delete restrict,
  -- For CSV jobs: hash of the mapped data set the proof covers.
  merge_dataset_hash text,
  -- SHA-256 of the snapshot; embedded in production files to prove approved = printed.
  snapshot_hash      text not null,
  proof_pdf_path     text,
  proof_png_path     text,
  status             public.proof_status not null default 'pending',
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  constraint proof_versions_order_version_unique unique (order_id, version)
);
-- At most one approved and at most one pending version per order.
create unique index proof_versions_one_approved_idx
  on public.proof_versions (order_id) where status = 'approved';
create unique index proof_versions_one_pending_idx
  on public.proof_versions (order_id) where status = 'pending';

alter table public.orders
  add constraint orders_approved_proof_fk
  foreign key (approved_proof_id) references public.proof_versions (id) on delete restrict;

-- Insert-only approval log: who approved or rejected which version, and when.
create table public.proof_events (
  id               uuid primary key default gen_random_uuid(),
  proof_version_id uuid not null references public.proof_versions (id) on delete restrict,
  order_id         uuid not null references public.orders (id) on delete restrict,
  action           public.proof_action not null,
  actor_id         uuid references public.profiles (id) on delete set null,
  comment          text,
  snapshot_hash    text not null,
  ip               inet,
  user_agent       text,
  created_at       timestamptz not null default now(),
  constraint proof_events_change_needs_comment check (
    action <> 'changes_requested' or length(btrim(coalesce(comment, ''))) > 0
  )
);
create index proof_events_order_idx on public.proof_events (order_id, created_at);

-- -----------------------------------------------------------------------------
-- Production (PRD p6 §07, p8 §11)
-- -----------------------------------------------------------------------------
create table public.merge_jobs (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders (id) on delete restrict,
  csv_asset_id    uuid not null references public.assets (id) on delete restrict,
  -- placeholder key -> CSV column name
  mapping         jsonb not null default '{}'::jsonb,
  -- Parsed, normalised rows (capped by settings.max_csv_rows).
  rows            jsonb not null default '[]'::jsonb,
  row_count       integer not null default 0 check (row_count >= 0),
  processed_count integer not null default 0 check (processed_count >= 0),
  status          public.merge_status not null default 'validated',
  -- Per-row preflight findings: [{"row":12,"severity":"error","code":"overflow","field":"NAME"}]
  row_issues      jsonb not null default '[]'::jsonb,
  dataset_hash    text,
  zip_path        text,
  started_at      timestamptz,
  finished_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint merge_jobs_progress check (processed_count <= row_count)
);
create index merge_jobs_order_idx on public.merge_jobs (order_id, created_at desc);

create table public.production_files (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders (id) on delete restrict,
  proof_version_id uuid not null references public.proof_versions (id) on delete restrict,
  merge_job_id     uuid references public.merge_jobs (id) on delete set null,
  kind             public.production_file_kind not null,
  row_index        integer check (row_index >= 1),
  storage_path     text not null unique,
  bytes            bigint check (bytes >= 0),
  sha256           text,
  width_px         integer,
  height_px        integer,
  dpi              integer,
  trim_mm          jsonb,
  bleed_mm         numeric(5, 2),
  created_at       timestamptz not null default now(),
  constraint production_files_row_index check (
    (kind in ('row_pdf', 'row_png')) = (row_index is not null)
  )
);
create index production_files_order_idx on public.production_files (order_id, kind, row_index);
comment on table public.production_files is 'Print-ready outputs. Admin-only; customers have no access (PRD p7 §10).';

-- -----------------------------------------------------------------------------
-- History, notifications, audit
-- -----------------------------------------------------------------------------
create table public.order_status_history (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references public.orders (id) on delete restrict,
  from_status public.order_status,
  to_status   public.order_status not null,
  actor_id    uuid references public.profiles (id) on delete set null,
  note        text,
  created_at  timestamptz not null default now()
);
create index order_status_history_order_idx on public.order_status_history (order_id, created_at);

create table public.notifications (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  order_id            uuid references public.orders (id) on delete set null,
  type                text not null,
  channel             public.notification_channel not null,
  subject             text not null,
  body                text,
  status              public.notification_status not null default 'queued',
  provider_message_id text,
  error               text,
  read_at             timestamptz,
  created_at          timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null,
  entity_type text not null,
  entity_id   text,
  diff        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);

-- Fixed-window rate limiting without an external service.
create table public.rate_limits (
  key          text not null,
  window_start timestamptz not null,
  count        integer not null default 0,
  primary key (key, window_start)
);
