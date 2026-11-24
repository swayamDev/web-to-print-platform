-- Production files behind the approval gate (PRD p6 §08, p7 §10).
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

select plan(9);

-- Fixtures: a paid order with proof v1 (changes requested) and proof v2 (pending).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000e0a1', 'production-owner@example.test');
insert into public.orders (id, customer_id, currency, subtotal_net_minor, tax_rate, tax_minor, total_gross_minor, pricing_snapshot)
values ('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000e0a1', 'GBP', 1350, 0.2, 270, 1620, '{}');
insert into public.order_items (order_id, product_id, description, config_snapshot, quantity, unit_net, line_net_minor, line_tax_minor, line_gross_minor)
select '10000000-0000-0000-0000-0000000000e1', id, 'Stickers', '{}', 100, 0.15, 1350, 270, 1620
from public.products where slug = 'custom-stickers';
update public.orders set paid_at = now() where id = '10000000-0000-0000-0000-0000000000e1';
select public.transition_order('10000000-0000-0000-0000-0000000000e1', 'order');
select public.transition_order('10000000-0000-0000-0000-0000000000e1', 'artwork');

create temp table ids (name text primary key, id uuid);
insert into ids select 'v1', (public.create_proof_version('10000000-0000-0000-0000-0000000000e1', 1, 'customer_edit', '{}', '{}', 'h1', 'a.pdf', 'a.png')).id;
select public.request_proof_changes('10000000-0000-0000-0000-0000000000e1', (select id from ids where name = 'v1'), 1, '00000000-0000-0000-0000-00000000e0a1', 'Fix it');
insert into ids select 'v2', (public.create_proof_version('10000000-0000-0000-0000-0000000000e1', 2, 'customer_edit', '{}', '{}', 'h2', 'b.pdf', 'b.png')).id;

create function pg_temp.file(p_version text, p_kind public.production_file_kind, p_path text) returns void
language sql as $$
  insert into public.production_files (order_id, proof_version_id, kind, storage_path)
  values ('10000000-0000-0000-0000-0000000000e1', (select id from ids where name = p_version), p_kind, p_path);
$$;

-- 1–2: nothing can be filed or produced before approval.
select throws_like($$ select pg_temp.file('v2', 'pdf', 'E1/early.pdf') $$, '%production_files_locked%',
  'no print file before the proof is approved');
select throws_like($$ select public.start_production('10000000-0000-0000-0000-0000000000e1') $$, '%proof_not_approved%',
  'production cannot start before approval');

select public.approve_proof('10000000-0000-0000-0000-0000000000e1', (select id from ids where name = 'v2'), 2, '00000000-0000-0000-0000-00000000e0a1');

-- 3–4: only the approved version can be filed, and a print PDF must exist first.
select throws_like($$ select pg_temp.file('v1', 'pdf', 'E1/old.pdf') $$, '%production_files_locked%',
  'files of a superseded version are refused');
select throws_like($$ select public.start_production('10000000-0000-0000-0000-0000000000e1') $$, '%production_files_missing%',
  'production needs the print PDF');

-- 5–7: with the approved PDF filed, production starts and is recorded.
select lives_ok($$ select pg_temp.file('v2', 'pdf', 'E1/E1_custom-stickers_2026-11-24_print.pdf') $$,
  'the approved version can be filed');
select is((public.start_production('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000e0a1')).status::text,
  'production', 'production starts');
select is(
  (select note from public.order_status_history where order_id = '10000000-0000-0000-0000-0000000000e1' and to_status = 'production'),
  'Print files generated', 'the timeline records why');

-- 8–9: regenerating is harmless, and files cannot be re-pointed to another version.
select lives_ok($$ select public.start_production('10000000-0000-0000-0000-0000000000e1') $$,
  'starting again is a no-op');
select throws_like(
  $$ update public.production_files set proof_version_id = (select id from ids where name = 'v1')
     where order_id = '10000000-0000-0000-0000-0000000000e1' $$,
  '%production_files_locked%', 'a file cannot be moved to another proof version'
);

select * from finish();
rollback;
