-- CSV variable-data merge (PRD p6 §07): locked data, one merge job per order, privacy.
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

select plan(5);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000f0a1', 'merge-owner@example.test'),
  ('00000000-0000-0000-0000-00000000f0b2', 'merge-other@example.test');
insert into public.assets (id, owner_id, path, kind, status) values
  ('30000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000f0a1',
   '00000000-0000-0000-0000-00000000f0a1/30000000-0000-0000-0000-0000000000c1.csv', 'csv', 'valid');
insert into public.designs (id, owner_id, product_id, document, data_merge)
select '20000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000f0a1', id, '{}',
       '{"csvAssetId":"30000000-0000-0000-0000-0000000000c1","mapping":{"BIB":"bib"}}'
from public.products where slug = 'race-numbers';
insert into public.orders (id, customer_id, currency, subtotal_net_minor, tax_rate, tax_minor, total_gross_minor, pricing_snapshot)
values ('10000000-0000-0000-0000-0000000000f9', '00000000-0000-0000-0000-00000000f0a1', 'GBP', 1000, 0.2, 200, 1200, '{}');
insert into public.merge_jobs (order_id, csv_asset_id, rows, row_count, dataset_hash)
values ('10000000-0000-0000-0000-0000000000f9', '30000000-0000-0000-0000-0000000000c1', '[{"BIB":"1"}]', 1, 'h');

-- 1–2: once a proof locks the design, its data file is frozen too.
update public.designs set is_locked = true where id = '20000000-0000-0000-0000-0000000000f1';
select throws_like(
  $$ update public.designs set data_merge = '{"csvAssetId":"30000000-0000-0000-0000-0000000000c1","mapping":{"BIB":null}}'
     where id = '20000000-0000-0000-0000-0000000000f1' $$,
  '%locked%', 'a locked design cannot change its data mapping'
);
select lives_ok(
  $$ update public.designs set name = 'Renamed' where id = '20000000-0000-0000-0000-0000000000f1' $$,
  'a locked design can still be renamed'
);

-- 3: one merge job per order.
select throws_ok(
  $$ insert into public.merge_jobs (order_id, csv_asset_id) values ('10000000-0000-0000-0000-0000000000f9', '30000000-0000-0000-0000-0000000000c1') $$,
  '23505', null, 'an order has at most one merge job'
);

-- 4–5: customers see their own merge job and data file only.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000f0a1","role":"authenticated"}';
select results_eq($$ select row_count from public.merge_jobs where order_id = '10000000-0000-0000-0000-0000000000f9' $$,
  array[1], 'the owner can read their merge job');
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000f0b2","role":"authenticated"}';
select is_empty($$ select * from public.merge_jobs where order_id = '10000000-0000-0000-0000-0000000000f9' $$,
  'another customer cannot see it');
set local role postgres;

select * from finish();
rollback;
