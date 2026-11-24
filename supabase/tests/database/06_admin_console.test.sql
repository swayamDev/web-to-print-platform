-- Admin console (PRD p4 §03, D-16, D-17): every helper re-checks the admin role; role changes
-- are audited and can never remove the last admin; pipeline actions follow the rules.
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

select plan(18);

-- Make this test independent of existing admins: only our fixture admin is an admin.
update public.profiles set role = 'customer' where role = 'admin';

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000c0a1', 'console-admin@example.test'),
  ('00000000-0000-0000-0000-00000000c0b2', 'console-customer@example.test');
update public.profiles set role = 'admin', full_name = 'Console Admin'
 where id = '00000000-0000-0000-0000-00000000c0a1';
update public.profiles set full_name = 'Priya Shah', company_name = 'Shah Events'
 where id = '00000000-0000-0000-0000-00000000c0b2';

-- 1–2: customers cannot use the helpers at all, even through the service role.
select throws_like(
  $$ select public.admin_set_role('00000000-0000-0000-0000-00000000c0b2', '00000000-0000-0000-0000-00000000c0b2', 'admin') $$,
  '%admin_required%', 'a customer cannot make themselves an admin'
);
select throws_like(
  $$ select * from public.admin_user_directory('00000000-0000-0000-0000-00000000c0b2') $$,
  '%admin_required%', 'a customer cannot list users'
);

-- 3–4: the directory finds people by email, name or company, with their sign-in email.
select results_eq(
  $$ select email, full_name from public.admin_user_directory('00000000-0000-0000-0000-00000000c0a1', 'shah events') $$,
  $$ values ('console-customer@example.test', 'Priya Shah') $$,
  'search by company'
);
select results_eq(
  $$ select count(*)::int from public.admin_user_directory('00000000-0000-0000-0000-00000000c0a1', 'console-', 'admin') $$,
  array[1], 'filter by role'
);

-- 5–6: no changing your own role, and never the last admin.
select throws_like(
  $$ select public.admin_set_role('00000000-0000-0000-0000-00000000c0a1', '00000000-0000-0000-0000-00000000c0a1', 'customer') $$,
  '%cannot_change_own_role%', 'admins cannot change their own role'
);
select is(
  (public.admin_set_role('00000000-0000-0000-0000-00000000c0a1', '00000000-0000-0000-0000-00000000c0b2', 'admin')).role::text,
  'admin', 'an admin can promote a user'
);
select results_eq(
  $$ select action, diff from public.audit_logs where entity_id = '00000000-0000-0000-0000-00000000c0b2' $$,
  $$ values ('user.role_changed', '{"from":"customer","to":"admin"}'::jsonb) $$,
  'the change is audited'
);
select is(
  (public.admin_set_role('00000000-0000-0000-0000-00000000c0b2', '00000000-0000-0000-0000-00000000c0a1', 'customer')).role::text,
  'customer', 'one admin can demote another while one remains'
);
select throws_like(
  $$ select public.admin_set_role('00000000-0000-0000-0000-00000000c0a1', '00000000-0000-0000-0000-00000000c0b2', 'customer') $$,
  '%admin_required%', 'the demoted admin has lost their powers'
);
-- c0b2 is now the only admin: demoting them is impossible (even via another path).
select ok(
  (select count(*) = 1 from public.profiles where role = 'admin'), 'exactly one admin left'
);

-- Pipeline actions. A paid order in production, and an unpaid quote.
insert into public.orders (id, customer_id, currency, subtotal_net_minor, tax_rate, tax_minor, total_gross_minor, pricing_snapshot)
values
  ('10000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000c0a1', 'GBP', 1350, 0.2, 270, 1620, '{}'),
  ('10000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000c0a1', 'GBP', 1350, 0.2, 270, 1620, '{}');
update public.orders set paid_at = now() where id = '10000000-0000-0000-0000-0000000000c1';
select public.transition_order('10000000-0000-0000-0000-0000000000c1', 'order');
select public.transition_order('10000000-0000-0000-0000-0000000000c1', 'artwork');
create temp table ids (id uuid);
insert into ids select (public.create_proof_version('10000000-0000-0000-0000-0000000000c1', 1, 'admin_upload', '{}', '{}', 'h', 'a.pdf', 'a.png')).id;
select public.approve_proof('10000000-0000-0000-0000-0000000000c1', (select id from ids), 1, '00000000-0000-0000-0000-00000000c0a1');
insert into public.production_files (order_id, proof_version_id, kind, storage_path)
values ('10000000-0000-0000-0000-0000000000c1', (select id from ids), 'pdf', 'C1/print.pdf');
select public.start_production('10000000-0000-0000-0000-0000000000c1');

-- 11–13: cancel needs a reason; production cannot be cancelled; quotes can.
select throws_like(
  $$ select public.admin_order_action('00000000-0000-0000-0000-00000000c0b2', '10000000-0000-0000-0000-0000000000c2', 'cancel', '  ') $$,
  '%reason_required%', 'cancelling needs a reason'
);
select throws_like(
  $$ select public.admin_order_action('00000000-0000-0000-0000-00000000c0b2', '10000000-0000-0000-0000-0000000000c1', 'cancel', 'Too late') $$,
  '%order_cannot_be_cancelled%', 'a job in production cannot be cancelled'
);
select is(
  (public.admin_order_action('00000000-0000-0000-0000-00000000c0b2', '10000000-0000-0000-0000-0000000000c2', 'cancel', 'Customer asked')).status::text,
  'cancelled', 'an unpaid order is cancelled'
);

-- 14–15: archive only finished orders; completing is recorded with the admin as actor.
select throws_like(
  $$ select public.admin_order_action('00000000-0000-0000-0000-00000000c0b2', '10000000-0000-0000-0000-0000000000c1', 'archive') $$,
  '%order_not_finished%', 'an unfinished order cannot be archived'
);
select is(
  (public.admin_order_action('00000000-0000-0000-0000-00000000c0b2', '10000000-0000-0000-0000-0000000000c1', 'complete')).status::text,
  'completed', 'a job in production is completed'
);
select results_eq(
  $$ select actor_id from public.order_status_history
      where order_id = '10000000-0000-0000-0000-0000000000c1' and to_status = 'completed' $$,
  array['00000000-0000-0000-0000-00000000c0b2'::uuid], 'the timeline records which admin completed it'
);

-- 16–17: archived, audited.
select ok(
  (public.admin_order_action('00000000-0000-0000-0000-00000000c0b2', '10000000-0000-0000-0000-0000000000c1', 'archive')).archived_at is not null,
  'a completed order is archived'
);
select results_eq(
  $$ select action from public.audit_logs where entity_id = '10000000-0000-0000-0000-0000000000c1' order by id $$,
  $$ values ('order.complete'), ('order.archive') $$,
  'pipeline actions are audited'
);

select * from finish();
rollback;
