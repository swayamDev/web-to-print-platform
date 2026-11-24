-- Cross-tenant isolation (Phase 17): customer B can neither see nor change anything that
-- belongs to customer A, in any table or private storage bucket; visitors see none of it.
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

select plan(49);

-- -----------------------------------------------------------------------------
-- Customer A's data: one row in every customer-owned table, plus private files.
-- -----------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000a0a0a', 'tenant-a@example.test'),
  ('00000000-0000-0000-0000-0000000b0b0b', 'tenant-b@example.test');

insert into public.assets (id, owner_id, path, kind, status) values
  ('30000000-0000-0000-0000-00000000aa01', '00000000-0000-0000-0000-0000000a0a0a',
   '00000000-0000-0000-0000-0000000a0a0a/30000000-0000-0000-0000-00000000aa01.csv', 'csv', 'valid');
insert into public.designs (id, owner_id, product_id, document)
select '20000000-0000-0000-0000-00000000aa01', '00000000-0000-0000-0000-0000000a0a0a', id, '{}'
  from public.products where slug = 'custom-stickers';

insert into public.orders (id, customer_id, currency, subtotal_net_minor, tax_rate, tax_minor, total_gross_minor, pricing_snapshot)
values ('10000000-0000-0000-0000-00000000aa01', '00000000-0000-0000-0000-0000000a0a0a', 'GBP', 1350, 0.2, 270, 1620, '{}');
insert into public.order_items (order_id, product_id, design_id, description, config_snapshot, quantity, unit_net, line_net_minor, line_tax_minor, line_gross_minor)
select '10000000-0000-0000-0000-00000000aa01', id, '20000000-0000-0000-0000-00000000aa01', 'Stickers', '{}', 100, 0.15, 1350, 270, 1620
  from public.products where slug = 'custom-stickers';
update public.orders set paid_at = now(), invoice_number = 'INV-TENANT-A' where id = '10000000-0000-0000-0000-00000000aa01';
select public.transition_order('10000000-0000-0000-0000-00000000aa01', 'order');
select public.transition_order('10000000-0000-0000-0000-00000000aa01', 'artwork');
create temp table ids (name text primary key, id uuid);
grant select on ids to authenticated, anon;
insert into ids select 'proof', (public.create_proof_version('10000000-0000-0000-0000-00000000aa01', 1, 'customer_edit', '{}', '{}', 'hash-a', 'a/proof.pdf', 'a/proof.png')).id;
select public.approve_proof('10000000-0000-0000-0000-00000000aa01', (select id from ids where name = 'proof'), 1, '00000000-0000-0000-0000-0000000a0a0a');
insert into public.production_files (order_id, proof_version_id, kind, storage_path)
values ('10000000-0000-0000-0000-00000000aa01', (select id from ids where name = 'proof'), 'pdf', 'TENANT-A/print.pdf');
insert into public.merge_jobs (order_id, csv_asset_id, rows, row_count, dataset_hash)
values ('10000000-0000-0000-0000-00000000aa01', '30000000-0000-0000-0000-00000000aa01', '[{"NAME":"A"}]', 1, 'h');
insert into public.payments (order_id, provider, provider_payment_id, amount_minor, currency, status)
values ('10000000-0000-0000-0000-00000000aa01', 'stripe', 'pi_tenant_a', 1620, 'GBP', 'succeeded');
insert into public.notifications (user_id, order_id, type, channel, subject, body, status)
values ('00000000-0000-0000-0000-0000000a0a0a', '10000000-0000-0000-0000-00000000aa01', 'order_confirmed', 'in_app', 'Hi A', 'Private', 'sent');
insert into public.audit_logs (actor_id, action, entity_type, entity_id)
values ('00000000-0000-0000-0000-0000000a0a0a', 'test.private', 'order', '10000000-0000-0000-0000-00000000aa01');

insert into storage.objects (bucket_id, name, owner) values
  ('uploads', '00000000-0000-0000-0000-0000000a0a0a/30000000-0000-0000-0000-00000000aa01.csv', '00000000-0000-0000-0000-0000000a0a0a'),
  ('proofs', '10000000-0000-0000-0000-00000000aa01/v1/proof.pdf', null),
  ('production', 'TENANT-A/print.pdf', null);

-- Helpers: how many of A's rows does the current role see / manage to change?
create function pg_temp.visible(p_table text, p_where text) returns integer
language plpgsql as $$
declare n integer;
begin
  execute format('select count(*) from %s where %s', p_table, p_where) into n;
  return n;
exception when insufficient_privilege then
  return 0;
end;
$$;

-- An update or delete is blocked when it errors for lack of privilege or touches no row.
create function pg_temp.blocked(p_statement text) returns boolean
language plpgsql as $$
declare n integer;
begin
  execute format('with changed as (%s returning 1) select count(*) from changed', p_statement) into n;
  return n = 0;
exception when insufficient_privilege or check_violation then
  return true;
end;
$$;
grant execute on function pg_temp.visible(text, text) to authenticated, anon;
grant execute on function pg_temp.blocked(text) to authenticated, anon;

-- Sanity: A sees their own rows (so the zeros below mean isolation, not broken fixtures).
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000a0a0a","role":"authenticated"}';
select is(pg_temp.visible('public.orders', $$id = '10000000-0000-0000-0000-00000000aa01'$$), 1, 'A sees their order');
select is(pg_temp.visible('public.designs', $$owner_id = '00000000-0000-0000-0000-0000000a0a0a'$$), 1, 'A sees their design');
select is(pg_temp.visible('public.assets', $$owner_id = '00000000-0000-0000-0000-0000000a0a0a'$$), 1, 'A sees their upload');
select is(pg_temp.visible('public.proof_versions', $$order_id = '10000000-0000-0000-0000-00000000aa01'$$), 1, 'A sees their proof');
select is(pg_temp.visible('storage.objects', $$bucket_id = 'uploads' and name like '00000000-0000-0000-0000-0000000a0a0a/%'$$), 1, 'A sees their stored upload');

-- -----------------------------------------------------------------------------
-- Customer B: reads.
-- -----------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000b0b0b","role":"authenticated"}';
select is(pg_temp.visible('public.orders', $$id = '10000000-0000-0000-0000-00000000aa01'$$), 0, 'B cannot see A''s order');
select is(pg_temp.visible('public.order_items', $$order_id = '10000000-0000-0000-0000-00000000aa01'$$), 0, 'B cannot see A''s order lines');
select is(pg_temp.visible('public.order_status_history', $$order_id = '10000000-0000-0000-0000-00000000aa01'$$), 0, 'B cannot see A''s order timeline');
select is(pg_temp.visible('public.designs', $$owner_id = '00000000-0000-0000-0000-0000000a0a0a'$$), 0, 'B cannot see A''s designs');
select is(pg_temp.visible('public.assets', $$owner_id = '00000000-0000-0000-0000-0000000a0a0a'$$), 0, 'B cannot see A''s uploads');
select is(pg_temp.visible('public.proof_versions', $$order_id = '10000000-0000-0000-0000-00000000aa01'$$), 0, 'B cannot see A''s proofs');
select is(pg_temp.visible('public.proof_events', $$order_id = '10000000-0000-0000-0000-00000000aa01'$$), 0, 'B cannot see A''s approvals');
select is(pg_temp.visible('public.merge_jobs', $$order_id = '10000000-0000-0000-0000-00000000aa01'$$), 0, 'B cannot see A''s CSV rows');
select is(pg_temp.visible('public.production_files', $$order_id = '10000000-0000-0000-0000-00000000aa01'$$), 0, 'B cannot see print files');
select is(pg_temp.visible('public.payments', $$order_id = '10000000-0000-0000-0000-00000000aa01'$$), 0, 'B cannot see A''s payments');
select is(pg_temp.visible('public.notifications', $$user_id = '00000000-0000-0000-0000-0000000a0a0a'$$), 0, 'B cannot see A''s notifications');
select is(pg_temp.visible('public.audit_logs', $$entity_id = '10000000-0000-0000-0000-00000000aa01'$$), 0, 'B cannot read the audit log');
select is(pg_temp.visible('public.profiles', $$id = '00000000-0000-0000-0000-0000000a0a0a'$$), 0, 'B cannot see A''s profile');
select is(pg_temp.visible('storage.objects', $$bucket_id = 'uploads' and name like '00000000-0000-0000-0000-0000000a0a0a/%'$$), 0, 'B cannot list A''s stored uploads');
select is(pg_temp.visible('storage.objects', $$bucket_id = 'proofs'$$), 0, 'B cannot list proof files directly');
select is(pg_temp.visible('storage.objects', $$bucket_id = 'production'$$), 0, 'B cannot list production files');

-- Customer B: writes.
select ok(pg_temp.blocked($$update public.orders set total_gross_minor = 1 where id = '10000000-0000-0000-0000-00000000aa01'$$), 'B cannot change A''s order');
select ok(pg_temp.blocked($$update public.designs set name = 'Mine now' where id = '20000000-0000-0000-0000-00000000aa01'$$), 'B cannot rename A''s design');
select ok(pg_temp.blocked($$delete from public.designs where id = '20000000-0000-0000-0000-00000000aa01'$$), 'B cannot delete A''s design');
select ok(pg_temp.blocked($$update public.assets set status = 'rejected' where id = '30000000-0000-0000-0000-00000000aa01'$$), 'B cannot change A''s upload record');
select ok(pg_temp.blocked($$delete from public.assets where id = '30000000-0000-0000-0000-00000000aa01'$$), 'B cannot delete A''s upload record');
select ok(pg_temp.blocked($$update public.profiles set full_name = 'Hacked' where id = '00000000-0000-0000-0000-0000000a0a0a'$$), 'B cannot edit A''s profile');
select ok(pg_temp.blocked($$update public.proof_versions set status = 'approved' where order_id = '10000000-0000-0000-0000-00000000aa01'$$), 'B cannot touch A''s proofs');
select ok(pg_temp.blocked($$delete from public.notifications where user_id = '00000000-0000-0000-0000-0000000a0a0a'$$), 'B cannot delete A''s notifications');
select ok(pg_temp.blocked($$delete from storage.objects where bucket_id = 'uploads' and name like '00000000-0000-0000-0000-0000000a0a0a/%'$$), 'B cannot delete A''s stored files');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner) values ('uploads', '00000000-0000-0000-0000-0000000a0a0a/planted.png', '00000000-0000-0000-0000-0000000b0b0b') $$,
  '42501', null, 'B cannot plant a file in A''s folder'
);
select throws_ok(
  $$ insert into public.designs (owner_id, product_id, document) select '00000000-0000-0000-0000-0000000a0a0a', id, '{}' from public.products limit 1 $$,
  '42501', null, 'B cannot create a design owned by A'
);
select throws_ok(
  $$ insert into public.proof_events (proof_version_id, order_id, action, snapshot_hash) select id, order_id, 'approved', 'x' from public.proof_versions limit 1 $$,
  '42501', null, 'B cannot forge an approval'
);
select throws_ok(
  $$ insert into public.payments (order_id, provider, provider_payment_id, amount_minor, currency) values ('10000000-0000-0000-0000-00000000aa01', 'stripe', 'pi_fake', 0, 'GBP') $$,
  '42501', null, 'B cannot record a payment'
);

-- Server-only functions are out of reach for any customer.
select ok(not has_function_privilege('authenticated', 'public.approve_proof(uuid, uuid, integer, uuid, inet, text)', 'execute'), 'customers cannot call approve_proof directly');
select ok(not has_function_privilege('authenticated', 'public.transition_order(uuid, public.order_status, uuid, text)', 'execute'), 'customers cannot move orders');
select ok(not has_function_privilege('authenticated', 'public.start_production(uuid, uuid)', 'execute'), 'customers cannot start production');
select ok(not has_function_privilege('authenticated', 'public.next_invoice_number()', 'execute'), 'customers cannot take invoice numbers');
select ok(not has_function_privilege('authenticated', 'public.admin_order_action(uuid, uuid, text, text)', 'execute'), 'customers cannot run admin actions');
select ok(not has_function_privilege('authenticated', 'public.admin_update_product(uuid, uuid, jsonb, jsonb, jsonb, jsonb)', 'execute'), 'customers cannot edit products');

-- -----------------------------------------------------------------------------
-- Visitors (anon).
-- -----------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select is(pg_temp.visible('public.orders', 'true'), 0, 'visitors see no orders');
select is(pg_temp.visible('public.designs', 'true'), 0, 'visitors see no designs');
select is(pg_temp.visible('public.assets', 'true'), 0, 'visitors see no uploads');
select is(pg_temp.visible('public.proof_versions', 'true'), 0, 'visitors see no proofs');
select is(pg_temp.visible('public.payments', 'true'), 0, 'visitors see no payments');
select is(pg_temp.visible('public.profiles', 'true'), 0, 'visitors see no profiles');
select is(pg_temp.visible('storage.objects', $$bucket_id in ('uploads', 'proofs', 'production')$$), 0, 'visitors see no private files');
select ok(pg_temp.blocked($$update public.settings set tax_rate = 0$$), 'visitors cannot change settings');
select ok(pg_temp.blocked($$update public.products set base_unit_price = 0$$), 'visitors cannot change prices');

set local role postgres;
select * from finish();
rollback;
