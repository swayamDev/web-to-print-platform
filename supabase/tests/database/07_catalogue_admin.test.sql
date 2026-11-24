-- Catalogue management (PRD p9 §14): product edits are atomic, admin-only and audited.
-- Run with: pnpm db:test
begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
select set_config(
  'search_path',
  coalesce(
    (select quote_ident(n.nspname) from pg_extension e
     join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap'),
    'extensions'
  ) || ', public, extensions',
  true
);

select plan(12);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000b0a1', 'catalogue-admin@example.test'),
  ('00000000-0000-0000-0000-00000000b0b2', 'catalogue-customer@example.test');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000b0a1';

create temp table t as
select p.id as product_id,
       (select id from public.materials where slug = 'gloss-vinyl') as gloss,
       (select id from public.materials where slug = 'matte-vinyl') as matte
  from public.products p where p.slug = 'custom-stickers';

create function pg_temp.patch(p_name text, p_min_width numeric default 20) returns jsonb language sql as $$
  select jsonb_build_object(
    'name', p_name, 'short_description', 'Any shape', 'is_active', true,
    'base_unit_price', '0.06', 'setup_fee_minor', 500, 'variable_data_unit_fee', '0',
    'min_width_mm', p_min_width, 'max_width_mm', 300, 'min_height_mm', 20, 'max_height_mm', 300,
    'default_width_mm', 50, 'default_height_mm', 50, 'min_qty', 10, 'max_qty', 10000, 'qty_step', 10,
    'bleed_mm', 2, 'safe_margin_mm', 3, 'output_dpi', 300);
$$;

-- 1: customers cannot edit the catalogue.
select throws_like(
  $$ select public.admin_update_product('00000000-0000-0000-0000-00000000b0b2', (select product_id from t),
       pg_temp.patch('Hacked'), jsonb_build_array(jsonb_build_object('materialId', (select gloss from t),
       'pricePerCm2', '0', 'pricePerUnit', '0', 'isDefault', true)), '[]') $$,
  '%admin_required%', 'a customer cannot change prices'
);

-- 2–3: exactly one default material is required.
select throws_like(
  $$ select public.admin_update_product('00000000-0000-0000-0000-00000000b0a1', (select product_id from t),
       pg_temp.patch('X'), jsonb_build_array(
         jsonb_build_object('materialId', (select gloss from t), 'pricePerCm2', '0.004', 'pricePerUnit', '0', 'isDefault', false)), '[]') $$,
  '%one_default_material%', 'a default material is required'
);
select throws_like(
  $$ select public.admin_update_product('00000000-0000-0000-0000-00000000b0a1', (select product_id from t),
       pg_temp.patch('X'), '[]', '[]') $$,
  '%materials_required%', 'at least one material is required'
);

-- 4: table constraints still apply (default width outside the limits).
select throws_ok(
  $$ select public.admin_update_product('00000000-0000-0000-0000-00000000b0a1', (select product_id from t),
       pg_temp.patch('X', 60), jsonb_build_array(jsonb_build_object('materialId', (select gloss from t),
       'pricePerCm2', '0.004', 'pricePerUnit', '0', 'isDefault', true)), '[]') $$,
  '23514', null, 'inconsistent sizes are refused by the database too'
);

-- 5–9: a valid edit updates the product, its materials and tiers together, and is audited.
select is(
  (public.admin_update_product('00000000-0000-0000-0000-00000000b0a1', (select product_id from t),
     pg_temp.patch('Custom Stickers Pro'),
     jsonb_build_array(
       jsonb_build_object('materialId', (select matte from t), 'pricePerCm2', '0.005', 'pricePerUnit', '0', 'isDefault', true),
       jsonb_build_object('materialId', (select gloss from t), 'pricePerCm2', '0.004', 'pricePerUnit', '0.01', 'isDefault', false)),
     '[{"minQty": 50, "percentOff": "5"}, {"minQty": 250, "percentOff": "12.5"}]',
     '{"name": {"from": "Custom Stickers", "to": "Custom Stickers Pro"}}')).name,
  'Custom Stickers Pro', 'the product is updated'
);
select results_eq(
  $$ select m.slug, pm.price_per_cm2, pm.is_default, pm.sort_order
       from public.product_materials pm join public.materials m on m.id = pm.material_id
      where pm.product_id = (select product_id from t) order by pm.sort_order $$,
  $$ values ('matte-vinyl', 0.005::numeric(12,6), true, 0), ('gloss-vinyl', 0.004::numeric(12,6), false, 1) $$,
  'the material set and default are replaced'
);
select results_eq(
  $$ select min_qty, percent_off from public.discount_tiers where product_id = (select product_id from t) order by min_qty $$,
  $$ values (50, 5.00::numeric(5,2)), (250, 12.50::numeric(5,2)) $$,
  'the product''s own tiers are replaced'
);
select ok(
  (select diff ? 'materials' and diff ? 'tiers' and diff -> 'fields' ? 'name'
     from public.audit_logs where entity_id = (select product_id::text from t) and action = 'product.updated'),
  'the audit row records fields, materials and tiers'
);
select is(
  (select setup_fee_minor from public.products where id = (select product_id from t)), 500,
  'money is stored in minor units'
);

-- 10–11: templates: admin-only, name required, audited.
select throws_like(
  $$ select public.admin_update_template('00000000-0000-0000-0000-00000000b0a1',
       (select id from public.templates limit 1), '{"name": "  "}') $$,
  '%name_required%', 'a template needs a name'
);
select is(
  (public.admin_update_template('00000000-0000-0000-0000-00000000b0a1',
     (select id from public.templates order by sort_order limit 1),
     '{"name": "Classic", "group_name": "Running", "is_active": false, "sort_order": 3}')).is_active,
  false, 'a template can be hidden'
);

-- 12: Xero settings keep their required fields.
select throws_ok(
  $$ select public.admin_update_xero_settings('00000000-0000-0000-0000-00000000b0a1',
       '{"salesAccountCode": "", "taxType": "20% (VAT on Income)", "trackingName": ""}') $$,
  '23514', null, 'Xero settings need an account code'
);

select * from finish();
rollback;
