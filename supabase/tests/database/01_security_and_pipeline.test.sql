-- Database tests: access rules (RLS + grants) and the order pipeline guards.
-- Run with: pnpm exec supabase test db
begin;
create extension if not exists pgtap with schema extensions;

select plan(24);

-- ---------------------------------------------------------------------------
-- Fixtures (as the database owner)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'customer-a@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'customer-b@test.local'),
  ('00000000-0000-0000-0000-0000000000ad', 'admin@test.local');

update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000ad';

insert into public.orders (id, customer_id, currency, subtotal_net_minor, tax_rate, tax_minor, total_gross_minor, pricing_snapshot)
values
  ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'GBP', 1350, 0.2, 270, 1620, '{}'),
  ('10000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b2', 'GBP', 28648, 0.2, 5730, 34378, '{}');

insert into storage.objects (bucket_id, name)
values ('production', 'DH-TEST/DH-TEST_race-numbers_2026-11-24_print.pdf');

-- 1. Profiles are created automatically for new users, as customers.
select results_eq(
  $$ select role::text from public.profiles where id = '00000000-0000-0000-0000-0000000000a1' $$,
  array['customer'],
  'new users get a customer profile'
);

-- ---------------------------------------------------------------------------
-- Visitor (anon)
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select results_eq(
  $$ select count(*)::int from public.products $$, array[6],
  'visitors can read the six active products'
);
select results_eq(
  $$ select count(*)::int from public.discount_tiers $$, array[3],
  'visitors can read discount tiers for the price calculator'
);
select throws_ok(
  $$ select * from public.orders $$, '42501', null,
  'visitors cannot read orders at all'
);
select throws_ok(
  $$ select * from public.profiles $$, '42501', null,
  'visitors cannot read profiles'
);

reset role;

-- ---------------------------------------------------------------------------
-- Customer A
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select results_eq(
  $$ select id::text from public.orders $$,
  array['10000000-0000-0000-0000-0000000000a1'],
  'a customer sees only their own order'
);
select results_eq(
  $$ select count(*)::int from public.profiles $$, array[1],
  'a customer sees only their own profile'
);
select throws_ok(
  $$ insert into public.orders (customer_id, currency, subtotal_net_minor, tax_rate, tax_minor, total_gross_minor, pricing_snapshot)
     values ('00000000-0000-0000-0000-0000000000a1', 'GBP', 1, 0, 0, 1, '{}') $$,
  '42501', null,
  'a customer cannot create orders directly (prices come from the server)'
);
select throws_ok(
  $$ update public.orders set total_gross_minor = 1 where id = '10000000-0000-0000-0000-0000000000a1' $$,
  '42501', null,
  'a customer cannot change an order'
);
select throws_ok(
  $$ update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000a1' $$,
  '42501', null,
  'a customer cannot make themselves an admin'
);
select lives_ok(
  $$ update public.profiles set full_name = 'Priya' where id = '00000000-0000-0000-0000-0000000000a1' $$,
  'a customer can edit their own name'
);
select throws_ok(
  $$ insert into public.designs (owner_id, product_id, document)
     select '00000000-0000-0000-0000-0000000000b2', id, '{}' from public.products limit 1 $$,
  '42501', null,
  'a customer cannot create a design in someone else''s account'
);
select lives_ok(
  $$ insert into public.designs (owner_id, product_id, document)
     select '00000000-0000-0000-0000-0000000000a1', id, '{}' from public.products limit 1 $$,
  'a customer can save their own design'
);
select is_empty(
  $$ select * from public.production_files $$,
  'a customer cannot see production file records'
);
select is_empty(
  $$ select * from storage.objects where bucket_id = 'production' $$,
  'a customer cannot see production files in storage'
);
select throws_ok(
  $$ select * from public.webhook_events $$, '42501', null,
  'a customer cannot read payment webhook records'
);

reset role;

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000ad","role":"authenticated"}';

select results_eq(
  $$ select count(*)::int from public.orders $$, array[2],
  'an admin sees every order'
);
select isnt_empty(
  $$ select * from storage.objects where bucket_id = 'production' $$,
  'an admin can see production files in storage'
);

reset role;

-- ---------------------------------------------------------------------------
-- Pipeline guards (as the server would run them)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.orders (customer_id, status, currency, subtotal_net_minor, tax_rate, tax_minor, total_gross_minor, pricing_snapshot)
     values ('00000000-0000-0000-0000-0000000000a1', 'order', 'GBP', 1, 0, 0, 1, '{}') $$,
  '23514', null,
  'new orders must start as a quote'
);
select throws_ok(
  $$ update public.orders set status = 'order' where id = '10000000-0000-0000-0000-0000000000a1' $$,
  '23514', null,
  'an order cannot be marked paid without a payment time'
);
select throws_ok(
  $$ update public.orders set status = 'production' where id = '10000000-0000-0000-0000-0000000000a1' $$,
  '23514', null,
  'a quote cannot jump straight to production'
);

update public.orders set paid_at = now() where id = '10000000-0000-0000-0000-0000000000a1';
select public.transition_order('10000000-0000-0000-0000-0000000000a1', 'order', '00000000-0000-0000-0000-0000000000ad', 'paid');
select public.transition_order('10000000-0000-0000-0000-0000000000a1', 'artwork', null, null);
select public.transition_order('10000000-0000-0000-0000-0000000000a1', 'proof', null, null);

select throws_ok(
  $$ select public.transition_order('10000000-0000-0000-0000-0000000000a1', 'production', null, null) $$,
  '23514', null,
  'production is blocked until a proof is approved (approval gate)'
);

select results_eq(
  $$ select array_agg(to_status::text order by id) from public.order_status_history
     where order_id = '10000000-0000-0000-0000-0000000000a1' $$,
  $$ values (array['quote', 'order', 'artwork', 'proof']) $$,
  'every status change is recorded in the timeline'
);
select throws_ok(
  $$ delete from public.order_status_history where order_id = '10000000-0000-0000-0000-0000000000a1' $$,
  '23514', null,
  'the timeline cannot be deleted'
);

select * from finish();
rollback;
