-- One-click reorder (PRD p7 §09, DECISIONS D-12): a reorder's proof is approved on the
-- customer's behalf only when it is byte-for-byte the artwork approved on the original order.
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

select plan(10);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000d0a1', 'reorder-owner@example.test'),
  ('00000000-0000-0000-0000-00000000d0b2', 'reorder-other@example.test');

-- A paid order in "artwork", ready for proof v1. p_reorder_of links it to an earlier order.
create function pg_temp.paid_order(p_id uuid, p_customer uuid, p_reorder_of uuid default null, p_confirmed boolean default true)
returns void language plpgsql as $$
begin
  insert into public.orders (id, customer_id, currency, subtotal_net_minor, tax_rate, tax_minor, total_gross_minor, pricing_snapshot,
                             reorder_of_order_id, reorder_confirmation)
  values (p_id, p_customer, 'GBP', 1350, 0.2, 270, 1620, '{}', p_reorder_of,
          case when p_reorder_of is not null and p_confirmed
               then '{"confirmedAt":"2026-11-24T10:00:00Z","ip":"203.0.113.7","userAgent":"Test browser"}'::jsonb end);
  insert into public.order_items (order_id, product_id, description, config_snapshot, quantity, unit_net, line_net_minor, line_tax_minor, line_gross_minor)
  select p_id, id, 'Stickers', '{}', 100, 0.15, 1350, 270, 1620 from public.products where slug = 'custom-stickers';
  update public.orders set paid_at = now() where id = p_id;
  perform public.transition_order(p_id, 'order');
  perform public.transition_order(p_id, 'artwork');
end;
$$;

create temp table ids (name text primary key, id uuid);

-- The original order: proof v1 (hash H) approved by the customer.
select pg_temp.paid_order('10000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000d0a1');
insert into ids select 'orig', (public.create_proof_version('10000000-0000-0000-0000-0000000000d1', 1, 'customer_edit', '{}', '{}', 'H', 'o.pdf', 'o.png')).id;
select public.approve_proof('10000000-0000-0000-0000-0000000000d1', (select id from ids where name = 'orig'), 1, '00000000-0000-0000-0000-00000000d0a1');

-- 1: the confirmation can only be stored on a reorder.
select throws_ok(
  $$ insert into public.orders (customer_id, currency, subtotal_net_minor, tax_rate, tax_minor, total_gross_minor, pricing_snapshot, reorder_confirmation)
     values ('00000000-0000-0000-0000-00000000d0a1', 'GBP', 0, 0.2, 0, 0, '{}', '{"confirmedAt":"x"}') $$,
  '23514', null, 'a reorder confirmation needs a reorder'
);

-- 2: an ordinary order cannot be approved through the reorder path.
select pg_temp.paid_order('10000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-00000000d0a1');
insert into ids select 'plain', (public.create_proof_version('10000000-0000-0000-0000-0000000000d2', 1, 'customer_edit', '{}', '{}', 'H', 'p.pdf', 'p.png')).id;
select throws_like(
  $$ select public.approve_reorder_proof('10000000-0000-0000-0000-0000000000d2', (select id from ids where name = 'plain')) $$,
  '%not_a_reorder%', 'only reorders are approved this way'
);

-- 3: a reorder whose proof differs from the approved original is refused.
select pg_temp.paid_order('10000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-00000000d0a1', '10000000-0000-0000-0000-0000000000d1');
insert into ids select 'changed', (public.create_proof_version('10000000-0000-0000-0000-0000000000d3', 1, 'reorder', '{}', '{}', 'DIFFERENT', 'c.pdf', 'c.png')).id;
select throws_like(
  $$ select public.approve_reorder_proof('10000000-0000-0000-0000-0000000000d3', (select id from ids where name = 'changed')) $$,
  '%reorder_artwork_changed%', 'changed artwork is never approved automatically'
);

-- 4: another customer's order cannot be reordered into their account.
select pg_temp.paid_order('10000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-00000000d0b2', '10000000-0000-0000-0000-0000000000d1');
insert into ids select 'stolen', (public.create_proof_version('10000000-0000-0000-0000-0000000000d4', 1, 'reorder', '{}', '{}', 'H', 's.pdf', 's.png')).id;
select throws_like(
  $$ select public.approve_reorder_proof('10000000-0000-0000-0000-0000000000d4', (select id from ids where name = 'stolen')) $$,
  '%reorder_artwork_changed%', 'a reorder must belong to the original customer'
);

-- 5–9: the identical artwork is approved, logged with the confirmation, and unlocks files.
select pg_temp.paid_order('10000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-00000000d0a1', '10000000-0000-0000-0000-0000000000d1');
insert into ids select 'same', (public.create_proof_version('10000000-0000-0000-0000-0000000000d5', 1, 'reorder', '{}', '{}', 'H', 'r.pdf', 'r.png')).id;
select is(
  (public.approve_reorder_proof('10000000-0000-0000-0000-0000000000d5', (select id from ids where name = 'same'))).status::text,
  'approved', 'the identical proof is approved'
);
select results_eq(
  $$ select action::text, actor_id, host(ip), user_agent, comment like 'Reorder of DH-%confirmed the artwork is unchanged%'
       from public.proof_events where order_id = '10000000-0000-0000-0000-0000000000d5' $$,
  $$ values ('approved_via_reorder', '00000000-0000-0000-0000-00000000d0a1'::uuid, '203.0.113.7', 'Test browser', true) $$,
  'the approval is logged as the customer''s reorder confirmation'
);
select ok(
  (select approved_proof_id = (select id from ids where name = 'same') and files_unlocked_at is not null
     from public.orders where id = '10000000-0000-0000-0000-0000000000d5'),
  'print files are unlocked'
);
select throws_like(
  $$ select public.approve_reorder_proof('10000000-0000-0000-0000-0000000000d5', (select id from ids where name = 'same')) $$,
  '%proof_already_approved%', 'it cannot be approved twice'
);

-- 9: an unconfirmed reorder is refused.
select pg_temp.paid_order('10000000-0000-0000-0000-0000000000d6', '00000000-0000-0000-0000-00000000d0a1', '10000000-0000-0000-0000-0000000000d1', false);
insert into ids select 'unconfirmed', (public.create_proof_version('10000000-0000-0000-0000-0000000000d6', 1, 'reorder', '{}', '{}', 'H', 'u.pdf', 'u.png')).id;
select throws_like(
  $$ select public.approve_reorder_proof('10000000-0000-0000-0000-0000000000d6', (select id from ids where name = 'unconfirmed')) $$,
  '%not_a_reorder%', 'a reorder without the customer''s confirmation is not approved'
);

-- 10: customers cannot call it.
select ok(
  not has_function_privilege('authenticated', 'public.approve_reorder_proof(uuid, uuid)', 'execute'),
  'only the server can approve a reorder'
);

select * from finish();
rollback;
