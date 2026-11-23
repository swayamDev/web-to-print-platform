-- =============================================================================
-- Functions and triggers: profile creation, role checks, order state machine,
-- immutable history, design locking, invoice numbers, rate limiting.
--
-- All SECURITY DEFINER functions pin search_path to '' and use qualified names.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- updated_at maintenance
-- -----------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'settings', 'divisions', 'products', 'materials', 'templates',
    'designs', 'orders', 'merge_jobs'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t
    );
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Profiles: created automatically for every new auth user, always as 'customer'.
-- Admins are promoted by a server-side script or by another admin (DECISIONS D-17).
-- -----------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Role check used by RLS policies. SECURITY DEFINER so it can read profiles
-- without recursing through the profiles policies.
-- -----------------------------------------------------------------------------
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Order state machine (DECISIONS D-05). Mirrors src/domain/orderStateMachine.ts.
-- -----------------------------------------------------------------------------
create function public.order_transition_allowed(
  from_status public.order_status,
  to_status public.order_status
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (from_status, to_status) in (
    ('quote'::public.order_status,      'order'::public.order_status),
    ('quote',      'cancelled'),
    ('order',      'artwork'),
    ('order',      'cancelled'),
    ('artwork',    'proof'),
    ('artwork',    'cancelled'),
    -- Customer requested changes: back to artwork until a new proof exists.
    ('proof',      'artwork'),
    ('proof',      'production'),
    ('proof',      'cancelled'),
    ('production', 'completed')
  );
$$;

-- Validates every status change, whoever makes it (customer, admin or service role).
create function public.orders_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'quote' then
      raise exception 'New orders must start in status quote, got %', new.status
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- Money and identity are fixed once the order exists.
  if new.customer_id is distinct from old.customer_id
     or new.order_number is distinct from old.order_number
     or (old.paid_at is not null and (
           new.total_gross_minor is distinct from old.total_gross_minor
           or new.subtotal_net_minor is distinct from old.subtotal_net_minor
           or new.tax_minor is distinct from old.tax_minor
           or new.currency is distinct from old.currency))
  then
    raise exception 'Order identity and paid amounts cannot be changed'
      using errcode = 'check_violation';
  end if;

  -- Once approved, the approved proof cannot be swapped.
  if old.approved_proof_id is not null
     and new.approved_proof_id is distinct from old.approved_proof_id then
    raise exception 'The approved proof of an order cannot be changed'
      using errcode = 'check_violation';
  end if;

  if new.status is distinct from old.status then
    if not public.order_transition_allowed(old.status, new.status) then
      raise exception 'Invalid order status transition % -> %', old.status, new.status
        using errcode = 'check_violation';
    end if;

    if new.status = 'order' and new.paid_at is null then
      raise exception 'An order can only move to status order once it is paid'
        using errcode = 'check_violation';
    end if;

    -- Approval gate (PRD p6 §08).
    if new.status = 'production'
       and (new.approved_proof_id is null or new.files_unlocked_at is null) then
      raise exception 'An order needs an approved proof before production'
        using errcode = 'check_violation';
    end if;

    if new.status = 'cancelled' then
      new.cancelled_at := coalesce(new.cancelled_at, now());
    end if;
  end if;

  if new.archived_at is not null and old.archived_at is null
     and new.status not in ('completed', 'cancelled') then
    raise exception 'Only completed or cancelled orders can be archived'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger orders_guard
  before insert or update on public.orders
  for each row execute function public.orders_guard();

-- Writes the pipeline timeline for every status change. The acting user comes from
-- the transaction-local setting app.actor_id (set by transition_order), else auth.uid().
create function public.orders_log_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := coalesce(
    nullif(current_setting('app.actor_id', true), '')::uuid,
    (select auth.uid())
  );
  v_note text := nullif(current_setting('app.status_note', true), '');
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_history (order_id, from_status, to_status, actor_id, note)
    values (new.id, null, new.status, v_actor, v_note);
  elsif new.status is distinct from old.status then
    insert into public.order_status_history (order_id, from_status, to_status, actor_id, note)
    values (new.id, old.status, new.status, v_actor, v_note);
  end if;
  return null;
end;
$$;

create trigger orders_log_status
  after insert or update of status on public.orders
  for each row execute function public.orders_log_status();

-- The one way server code moves an order through the pipeline: validates, records
-- who did it and why, and returns the updated order. Callable by the service role only.
create function public.transition_order(
  p_order_id uuid,
  p_to_status public.order_status,
  p_actor_id uuid default null,
  p_note text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  perform set_config('app.actor_id', coalesce(p_actor_id::text, ''), true);
  perform set_config('app.status_note', coalesce(p_note, ''), true);

  update public.orders
     set status = p_to_status
   where id = p_order_id
  returning * into v_order;

  if not found then
    raise exception 'Order % not found', p_order_id using errcode = 'no_data_found';
  end if;

  perform set_config('app.actor_id', '', true);
  perform set_config('app.status_note', '', true);
  return v_order;
end;
$$;

revoke execute on function public.transition_order(uuid, public.order_status, uuid, text) from public, anon, authenticated;
grant execute on function public.transition_order(uuid, public.order_status, uuid, text) to service_role;

-- -----------------------------------------------------------------------------
-- Proof versions: the snapshot is immutable; status only moves forward.
-- -----------------------------------------------------------------------------
create function public.proof_versions_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.order_id is distinct from old.order_id
     or new.version is distinct from old.version
     or new.source is distinct from old.source
     or new.document_snapshot is distinct from old.document_snapshot
     or new.config_snapshot is distinct from old.config_snapshot
     or new.upload_asset_id is distinct from old.upload_asset_id
     or new.merge_dataset_hash is distinct from old.merge_dataset_hash
     or new.snapshot_hash is distinct from old.snapshot_hash
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
  then
    raise exception 'Proof version content is immutable; create a new version instead'
      using errcode = 'check_violation';
  end if;

  -- Rendered files can be attached once, never replaced.
  if (old.proof_pdf_path is not null and new.proof_pdf_path is distinct from old.proof_pdf_path)
     or (old.proof_png_path is not null and new.proof_png_path is distinct from old.proof_png_path)
  then
    raise exception 'Proof files cannot be replaced' using errcode = 'check_violation';
  end if;

  if new.status is distinct from old.status and not (
       (old.status = 'pending' and new.status in ('approved', 'changes_requested', 'superseded'))
    or (old.status = 'changes_requested' and new.status = 'superseded')
  ) then
    raise exception 'Invalid proof status change % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger proof_versions_guard
  before update on public.proof_versions
  for each row execute function public.proof_versions_guard();

create function public.prevent_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% rows cannot be deleted', tg_table_name using errcode = 'check_violation';
end;
$$;

create trigger proof_versions_no_delete
  before delete on public.proof_versions
  for each row execute function public.prevent_delete();

-- -----------------------------------------------------------------------------
-- Insert-only logs (approval history, pipeline history, audit log).
-- -----------------------------------------------------------------------------
create function public.prevent_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is insert-only', tg_table_name using errcode = 'check_violation';
end;
$$;

create trigger proof_events_immutable
  before update or delete on public.proof_events
  for each row execute function public.prevent_mutation();

create trigger order_status_history_immutable
  before update or delete on public.order_status_history
  for each row execute function public.prevent_mutation();

create trigger audit_logs_immutable
  before update or delete on public.audit_logs
  for each row execute function public.prevent_mutation();

-- -----------------------------------------------------------------------------
-- Locked designs cannot change their artwork or configuration.
-- -----------------------------------------------------------------------------
create function public.designs_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.is_locked and (
       new.document is distinct from old.document
    or new.config is distinct from old.config
    or new.product_id is distinct from old.product_id
    or new.upload_asset_id is distinct from old.upload_asset_id
    or new.source is distinct from old.source
    or new.is_locked = false
  ) then
    raise exception 'This design is locked by an approved proof; save a copy to edit it'
      using errcode = 'check_violation';
  end if;
  if new.owner_id is distinct from old.owner_id then
    raise exception 'Design owner cannot be changed' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger designs_guard
  before update on public.designs
  for each row execute function public.designs_guard();

-- -----------------------------------------------------------------------------
-- Invoice numbers are assigned when payment is confirmed: INV-2026-000001.
-- -----------------------------------------------------------------------------
create function public.next_invoice_number()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select 'INV-' || to_char(now() at time zone 'utc', 'YYYY') || '-' ||
         lpad(nextval('public.invoice_number_seq')::text, 6, '0');
$$;

revoke execute on function public.next_invoice_number() from public, anon, authenticated;
grant execute on function public.next_invoice_number() to service_role;

-- -----------------------------------------------------------------------------
-- Rate limiting: returns true if the call is allowed, false if over the limit.
-- -----------------------------------------------------------------------------
create function public.check_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );
  v_count integer;
begin
  insert into public.rate_limits (key, window_start, count)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set count = public.rate_limits.count + 1
  returning count into v_count;

  -- Opportunistic cleanup of old windows.
  delete from public.rate_limits where window_start < now() - interval '1 day';

  return v_count <= p_max;
end;
$$;

revoke execute on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;

-- Trigger functions are not meant to be called over the API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.orders_log_status() from public, anon, authenticated;
