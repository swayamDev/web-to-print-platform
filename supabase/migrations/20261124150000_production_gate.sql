-- =============================================================================
-- Production files (PRD p6 §07, p7 §10) behind the approval gate (p6 §08).
--
-- 1. A production file can only be recorded for the order's approved proof, after approval
--    unlocked print files. The server cannot accidentally file an unapproved version.
-- 2. start_production moves an order to "production" only once the print PDF of the approved
--    proof exists (DECISIONS D-05: production = approved and print files generated).
-- =============================================================================

create function public.production_files_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = new.order_id;
  if not found
     or v_order.files_unlocked_at is null
     or v_order.approved_proof_id is distinct from new.proof_version_id then
    raise exception 'production_files_locked: files need the approved proof of this order'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger production_files_guard
  before insert or update on public.production_files
  for each row execute function public.production_files_guard();

create function public.start_production(p_order_id uuid, p_actor_id uuid default null)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'no_data_found';
  end if;
  if v_order.status = 'production' then
    return v_order; -- files regenerated for an order already in production
  end if;
  if v_order.status <> 'proof' or v_order.approved_proof_id is null then
    raise exception 'proof_not_approved' using errcode = 'check_violation';
  end if;
  if not exists (
    select 1 from public.production_files
     where order_id = p_order_id and proof_version_id = v_order.approved_proof_id and kind = 'pdf'
  ) then
    raise exception 'production_files_missing' using errcode = 'check_violation';
  end if;

  perform public.transition_order(p_order_id, 'production', p_actor_id, 'Print files generated');
  select * into v_order from public.orders where id = p_order_id;
  return v_order;
end;
$$;

revoke execute on function public.start_production(uuid, uuid) from public, anon, authenticated;
grant execute on function public.start_production(uuid, uuid) to service_role;
