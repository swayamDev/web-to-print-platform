-- =============================================================================
-- One-click reorder (PRD p7 §09, DECISIONS D-12).
--
-- A reorder is a new order for exactly the artwork approved on an earlier order, charged at
-- current prices. The customer confirms the artwork is unchanged when they reorder; after
-- payment a proof is rendered from the same snapshot and approved on their behalf, logged as
-- "approved_via_reorder" with the confirmation's time, IP and browser.
-- =============================================================================

alter table public.orders add column reorder_confirmation jsonb;
comment on column public.orders.reorder_confirmation is
  'Reorders only: {"confirmedAt": iso, "ip": text|null, "userAgent": text|null, "sourceProofHash": sha256}';

alter table public.orders add constraint orders_reorder_confirmation check (
  reorder_confirmation is null or reorder_of_order_id is not null
);

-- -----------------------------------------------------------------------------
-- Approve a reorder's proof. Allowed only when the proof's snapshot hash is identical to the
-- proof approved on the original order: the artwork, size, material, quantity, uploaded files
-- and data rows are byte-for-byte what the customer approved before.
-- -----------------------------------------------------------------------------
create function public.approve_reorder_proof(
  p_order_id uuid,
  p_version_id uuid
)
returns public.proof_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_original public.orders;
  v_row public.proof_versions;
  v_original_hash text;
  v_latest integer;
  v_confirmation jsonb;
  v_ip inet;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'no_data_found';
  end if;
  if v_order.reorder_of_order_id is null or v_order.reorder_confirmation is null then
    raise exception 'not_a_reorder' using errcode = 'check_violation';
  end if;
  if v_order.approved_proof_id is not null then
    raise exception 'proof_already_approved' using errcode = 'check_violation';
  end if;
  if v_order.status <> 'proof' then
    raise exception 'order_not_in_proof' using errcode = 'check_violation';
  end if;

  select * into v_row from public.proof_versions
   where id = p_version_id and order_id = p_order_id
   for update;
  if not found then
    raise exception 'proof_not_found' using errcode = 'no_data_found';
  end if;
  select max(version) into v_latest from public.proof_versions where order_id = p_order_id;
  if v_row.version <> v_latest or v_row.status <> 'pending' then
    raise exception 'proof_outdated' using errcode = 'check_violation';
  end if;

  select * into v_original from public.orders where id = v_order.reorder_of_order_id;
  select pv.snapshot_hash into v_original_hash
    from public.proof_versions pv
   where pv.id = v_original.approved_proof_id;
  if v_original_hash is null
     or v_original.customer_id <> v_order.customer_id
     or v_original_hash <> v_row.snapshot_hash then
    raise exception 'reorder_artwork_changed' using errcode = 'check_violation';
  end if;

  v_confirmation := v_order.reorder_confirmation;
  begin
    v_ip := nullif(v_confirmation ->> 'ip', '')::inet;
  exception when others then
    v_ip := null;
  end;

  insert into public.proof_events (
    proof_version_id, order_id, action, actor_id, comment, snapshot_hash, ip, user_agent
  ) values (
    v_row.id, p_order_id, 'approved_via_reorder', v_order.customer_id,
    format('Reorder of %s: the customer confirmed the artwork is unchanged on %s',
           v_original.order_number, v_confirmation ->> 'confirmedAt'),
    v_row.snapshot_hash, v_ip, left(v_confirmation ->> 'userAgent', 500)
  );

  update public.proof_versions set status = 'approved' where id = v_row.id returning * into v_row;
  update public.orders
     set approved_proof_id = v_row.id, files_unlocked_at = now()
   where id = p_order_id;
  return v_row;
end;
$$;

revoke execute on function public.approve_reorder_proof(uuid, uuid) from public, anon, authenticated;
grant execute on function public.approve_reorder_proof(uuid, uuid) to service_role;
