-- =============================================================================
-- Row Level Security and table privileges.
--
-- Two layers of defence:
--   1. GRANTs decide which *operations* a role may attempt on a table at all.
--   2. RLS policies decide which *rows* those operations may touch.
--
-- Roles:
--   anon           visitor, not signed in
--   authenticated  any signed-in user; admins are authenticated users whose
--                  profiles.role = 'admin' (checked with public.is_admin())
--   service_role   server code only (bypasses RLS). Used for orders, payments,
--                  proofs and production files, after the server has checked
--                  the caller's identity and role.
--
-- Customers can never write orders, payments, proofs or production files directly
-- (prices must come from the server), and have no access at all to production
-- files (PRD p7 §10, DECISIONS D-10).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Privileges: start from nothing for API roles, then grant what is needed.
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Catalogue: everyone may read; signed-in users may attempt writes, which RLS
-- limits to admins.
grant select on
  public.settings, public.divisions, public.products, public.materials,
  public.product_materials, public.discount_tiers, public.templates, public.gallery_items
to anon, authenticated;

grant insert, update, delete on
  public.divisions, public.products, public.materials, public.product_materials,
  public.discount_tiers, public.templates, public.gallery_items
to authenticated;
grant update on public.settings to authenticated;

-- Profiles: customers may edit their own contact details, never their role.
grant select on public.profiles to authenticated;
grant update (full_name, company_name, phone, marketing_opt_in) on public.profiles to authenticated;

-- Customer-owned working data.
grant select, insert, update, delete on public.designs to authenticated;
grant select, insert, delete on public.assets to authenticated;

-- Read-only for signed-in users (rows limited by RLS below).
grant select on
  public.orders, public.order_items, public.payments, public.proof_versions,
  public.proof_events, public.merge_jobs, public.order_status_history,
  public.production_files, public.audit_logs
to authenticated;

grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- webhook_events and rate_limits: server only, no grants to API roles.

-- -----------------------------------------------------------------------------
-- 2. Enable RLS everywhere.
-- -----------------------------------------------------------------------------
alter table public.profiles             enable row level security;
alter table public.settings             enable row level security;
alter table public.divisions            enable row level security;
alter table public.products             enable row level security;
alter table public.materials            enable row level security;
alter table public.product_materials    enable row level security;
alter table public.discount_tiers       enable row level security;
alter table public.templates            enable row level security;
alter table public.gallery_items        enable row level security;
alter table public.assets               enable row level security;
alter table public.designs              enable row level security;
alter table public.orders               enable row level security;
alter table public.order_items          enable row level security;
alter table public.payments             enable row level security;
alter table public.webhook_events       enable row level security;
alter table public.proof_versions       enable row level security;
alter table public.proof_events         enable row level security;
alter table public.merge_jobs           enable row level security;
alter table public.production_files     enable row level security;
alter table public.order_status_history enable row level security;
alter table public.notifications        enable row level security;
alter table public.audit_logs           enable row level security;
alter table public.rate_limits          enable row level security;

-- -----------------------------------------------------------------------------
-- 3. Policies
-- (select auth.uid()) / (select public.is_admin()) are wrapped in sub-selects so
-- Postgres evaluates them once per query instead of once per row.
-- -----------------------------------------------------------------------------

-- Catalogue ------------------------------------------------------------------
create policy "Anyone can read settings" on public.settings
  for select to anon, authenticated using (true);
create policy "Admins update settings" on public.settings
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "Anyone reads active divisions; admins read all" on public.divisions
  for select to anon, authenticated using (is_active or (select public.is_admin()));
create policy "Admins manage divisions" on public.divisions
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "Anyone reads active products; admins read all" on public.products
  for select to anon, authenticated using (is_active or (select public.is_admin()));
create policy "Admins manage products" on public.products
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "Anyone reads active materials; admins read all" on public.materials
  for select to anon, authenticated using (is_active or (select public.is_admin()));
create policy "Admins manage materials" on public.materials
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "Anyone reads product materials" on public.product_materials
  for select to anon, authenticated using (true);
create policy "Admins manage product materials" on public.product_materials
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "Anyone reads discount tiers" on public.discount_tiers
  for select to anon, authenticated using (true);
create policy "Admins manage discount tiers" on public.discount_tiers
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "Anyone reads active templates; admins read all" on public.templates
  for select to anon, authenticated using (is_active or (select public.is_admin()));
create policy "Admins manage templates" on public.templates
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "Anyone reads active gallery items; admins read all" on public.gallery_items
  for select to anon, authenticated using (is_active or (select public.is_admin()));
create policy "Admins manage gallery items" on public.gallery_items
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Profiles ---------------------------------------------------------------------
create policy "Users read own profile; admins read all" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
-- Column grants above stop anyone changing role through the API.
create policy "Users update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Customer working data --------------------------------------------------------
create policy "Owners read own assets; admins read all" on public.assets
  for select to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_admin()));
create policy "Owners register own uploads" on public.assets
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and bucket = 'uploads'
    and status = 'pending'
    -- Must point inside the user's own storage folder.
    and split_part(path, '/', 1) = (select auth.uid())::text
  );
create policy "Owners delete own assets" on public.assets
  for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy "Owners read own designs; admins read all" on public.designs
  for select to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_admin()));
create policy "Owners create own designs" on public.designs
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and is_locked = false);
create policy "Owners update own designs" on public.designs
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "Owners delete own unlocked designs" on public.designs
  for delete to authenticated
  using (owner_id = (select auth.uid()) and is_locked = false);

-- Orders and everything hanging off them: read-only for the owner and admins ---
create policy "Customers read own orders; admins read all" on public.orders
  for select to authenticated
  using (customer_id = (select auth.uid()) or (select public.is_admin()));

create policy "Customers read own order items; admins read all" on public.order_items
  for select to authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.orders o
               where o.id = order_id and o.customer_id = (select auth.uid()))
  );

create policy "Customers read own payments; admins read all" on public.payments
  for select to authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.orders o
               where o.id = order_id and o.customer_id = (select auth.uid()))
  );

create policy "Customers read own proofs; admins read all" on public.proof_versions
  for select to authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.orders o
               where o.id = order_id and o.customer_id = (select auth.uid()))
  );

create policy "Customers read own proof history; admins read all" on public.proof_events
  for select to authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.orders o
               where o.id = order_id and o.customer_id = (select auth.uid()))
  );

create policy "Customers read own merge jobs; admins read all" on public.merge_jobs
  for select to authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.orders o
               where o.id = order_id and o.customer_id = (select auth.uid()))
  );

create policy "Customers read own order timeline; admins read all" on public.order_status_history
  for select to authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.orders o
               where o.id = order_id and o.customer_id = (select auth.uid()))
  );

-- Production files: admins only. There is deliberately no customer policy.
create policy "Admins read production files" on public.production_files
  for select to authenticated using ((select public.is_admin()));

create policy "Admins read audit log" on public.audit_logs
  for select to authenticated using ((select public.is_admin()));

-- Notifications ----------------------------------------------------------------
create policy "Users read own notifications" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Users mark own notifications read" on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- webhook_events and rate_limits have RLS enabled and no policies: server only.

-- -----------------------------------------------------------------------------
-- 4. Future tables: do not silently expose them. Each new migration must add
--    its own grants and policies.
-- -----------------------------------------------------------------------------
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
