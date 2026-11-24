-- Proof workflow (PRD p6 §08): versions, approval gate, change requests, stale approvals.
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

select plan(17);

-- Fixtures: a customer, another customer, a paid order in "artwork" with a saved design.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000c0a1', 'proof-owner@example.test'),
  ('00000000-0000-0000-0000-00000000c0b2', 'proof-other@example.test');

insert into public.designs (id, owner_id, product_id, document)
select '20000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000c0a1', id, '{}'
from public.products where slug = 'custom-stickers';

insert into public.orders (id, customer_id, currency, subtotal_net_minor, tax_rate, tax_minor, total_gross_minor, pricing_snapshot)
values ('10000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c0a1', 'GBP', 1350, 0.2, 270, 1620, '{}');
insert into public.order_items (order_id, product_id, design_id, description, config_snapshot, quantity, unit_net, line_net_minor, line_tax_minor, line_gross_minor)
select '10000000-0000-0000-0000-0000000000f1', id, '20000000-0000-0000-0000-0000000000d1', 'Stickers', '{}', 100, 0.15, 1350, 270, 1620
from public.products where slug = 'custom-stickers';
update public.orders set paid_at = now() where id = '10000000-0000-0000-0000-0000000000f1';
select public.transition_order('10000000-0000-0000-0000-0000000000f1', 'order');
select public.transition_order('10000000-0000-0000-0000-0000000000f1', 'artwork');

-- Helpers to keep the assertions readable.
create temp table ids (name text primary key, id uuid);
create function pg_temp.v(p integer) returns public.proof_versions language sql as $$
  select public.create_proof_version('10000000-0000-0000-0000-0000000000f1', p, 'customer_edit', '{}', '{}',
                                     'hash-v' || p, 'p.pdf', 'p.png', '00000000-0000-0000-0000-00000000c0a1');
$$;
create function pg_temp.status() returns text language sql as $$
  select status::text from public.orders where id = '10000000-0000-0000-0000-0000000000f1';
$$;

-- 1–3: proof v1 moves the order to "proof"; version numbers must be consecutive.
insert into ids select 'v1', (pg_temp.v(1)).id;
select is(pg_temp.status(), 'proof', 'creating proof v1 moves the order to proof');
select is((select status::text from public.proof_versions where id = (select id from ids where name = 'v1')), 'pending', 'v1 waits for a decision');
select throws_like($$ select pg_temp.v(3) $$, '%proof_version_conflict%', 'versions must be consecutive');

-- 4–5: only the owner can act, and a change request needs a comment.
select throws_like(
  $$ select public.approve_proof('10000000-0000-0000-0000-0000000000f1', (select id from ids where name = 'v1'), 1, '00000000-0000-0000-0000-00000000c0b2') $$,
  '%order_not_found%', 'another customer cannot approve this proof'
);
select throws_like(
  $$ select public.request_proof_changes('10000000-0000-0000-0000-0000000000f1', (select id from ids where name = 'v1'), 1, '00000000-0000-0000-0000-00000000c0a1', '   ') $$,
  '%comment_required%', 'a change request needs a comment'
);

-- 6–8: requesting changes logs the comment and sends the order back to artwork.
select lives_ok(
  $$ select public.request_proof_changes('10000000-0000-0000-0000-0000000000f1', (select id from ids where name = 'v1'), 1, '00000000-0000-0000-0000-00000000c0a1', 'Name is misspelt') $$,
  'the owner can request changes'
);
select is(pg_temp.status(), 'artwork', 'the order goes back to artwork');
select is(
  (select comment from public.proof_events where order_id = '10000000-0000-0000-0000-0000000000f1' and action = 'changes_requested'),
  'Name is misspelt', 'the comment is logged'
);

-- 9–10: v2 supersedes v1, which can no longer be approved.
insert into ids select 'v2', (pg_temp.v(2)).id;
select is((select status::text from public.proof_versions where id = (select id from ids where name = 'v1')), 'superseded', 'v1 is superseded by v2');
select throws_like(
  $$ select public.approve_proof('10000000-0000-0000-0000-0000000000f1', (select id from ids where name = 'v1'), 1, '00000000-0000-0000-0000-00000000c0a1') $$,
  '%proof_outdated%', 'an outdated proof cannot be approved'
);

-- 11–14: approving v2 logs it, unlocks print files and locks the design.
select lives_ok(
  $$ select public.approve_proof('10000000-0000-0000-0000-0000000000f1', (select id from ids where name = 'v2'), 2, '00000000-0000-0000-0000-00000000c0a1', '203.0.113.7', 'test-agent') $$,
  'the owner approves the latest proof'
);
select results_eq(
  $$ select approved_proof_id, files_unlocked_at is not null from public.orders where id = '10000000-0000-0000-0000-0000000000f1' $$,
  $$ values ((select id from ids where name = 'v2'), true) $$,
  'approval records the approved version and unlocks print files'
);
select results_eq(
  $$ select action::text, actor_id, snapshot_hash, host(ip) from public.proof_events where order_id = '10000000-0000-0000-0000-0000000000f1' and action = 'approved' $$,
  $$ values ('approved', '00000000-0000-0000-0000-00000000c0a1'::uuid, 'hash-v2', '203.0.113.7') $$,
  'the log records who approved which version, from where'
);
select is((select is_locked from public.designs where id = '20000000-0000-0000-0000-0000000000d1'), true, 'the design is locked');

-- 15–17: no second approval, no new versions after approval, and the log cannot be edited.
select throws_like(
  $$ select public.approve_proof('10000000-0000-0000-0000-0000000000f1', (select id from ids where name = 'v2'), 2, '00000000-0000-0000-0000-00000000c0a1') $$,
  '%proof_outdated%', 'a proof cannot be approved twice'
);
select throws_like($$ select pg_temp.v(3) $$, '%proof_already_approved%', 'no new proofs after approval');
select throws_like(
  $$ update public.proof_events set comment = 'edited' where order_id = '10000000-0000-0000-0000-0000000000f1' $$,
  '%insert-only%', 'the approval log cannot be edited'
);

select * from finish();
rollback;
