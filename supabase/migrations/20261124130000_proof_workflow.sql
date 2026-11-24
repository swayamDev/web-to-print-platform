-- =============================================================================
-- Proof workflow (PRD p6 §08): versioned proofs, approval log, change requests and the
-- approval gate. Each step is one transaction with row locks, so two browser tabs (or a
-- customer and an admin) can never approve an old version or approve twice.
--
-- All three functions run as the service role only; the server calls them after it has
-- checked who the caller is, and passes that user in as the actor.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Create proof version N for an order (N must be the next number), superseding any open
-- version, and move the order to "proof".
-- -----------------------------------------------------------------------------
create function public.create_proof_version(
  p_order_id uuid,
  p_version integer,
  p_source public.proof_source,
  p_document jsonb,
  p_config jsonb,
  p_snapshot_hash text,
  p_pdf_path text,
  p_png_path text,
  p_actor_id uuid default null
)
returns public.proof_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_next integer;
  v_row public.proof_versions;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'no_data_found';
  end if;
  if v_order.status not in ('artwork', 'proof') then
    raise exception 'order_not_awaiting_proof' using errcode = 'check_violation';
  end if;
  if v_order.approved_proof_id is not null then
    raise exception 'proof_already_approved' using errcode = 'check_violation';
  end if;

  select coalesce(max(version), 0) + 1 into v_next from public.proof_versions where order_id = p_order_id;
  if p_version <> v_next then
    raise exception 'proof_version_conflict' using errcode = 'check_violation';
  end if;

  update public.proof_versions
     set status = 'superseded'
   where order_id = p_order_id and status in ('pending', 'changes_requested');

  insert into public.proof_versions (
    order_id, version, source, document_snapshot, config_snapshot, snapshot_hash,
    proof_pdf_path, proof_png_path, status, created_by
  ) values (
    p_order_id, p_version, p_source, p_document, p_config, p_snapshot_hash,
    p_pdf_path, p_png_path, 'pending', p_actor_id
  )
  returning * into v_row;

  if v_order.status = 'artwork' then
    perform public.transition_order(p_order_id, 'proof', p_actor_id, format('Proof v%s ready', p_version));
  end if;
  return v_row;
end;
$$;

-- -----------------------------------------------------------------------------
-- Shared checks for a customer acting on a proof: their order, in "proof", and the version
-- is the newest one and still waiting for a decision.
-- -----------------------------------------------------------------------------
create function public.lock_open_proof(
  p_order_id uuid,
  p_version_id uuid,
  p_version integer,
  p_actor_id uuid
)
returns public.proof_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_row public.proof_versions;
  v_latest integer;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.customer_id <> p_actor_id then
    raise exception 'order_not_found' using errcode = 'no_data_found';
  end if;
  if v_order.status <> 'proof' then
    raise exception 'order_not_in_proof' using errcode = 'check_violation';
  end if;

  select * into v_row from public.proof_versions
   where id = p_version_id and order_id = p_order_id
   for update;
  if not found or v_row.version <> p_version then
    raise exception 'proof_not_found' using errcode = 'no_data_found';
  end if;

  select max(version) into v_latest from public.proof_versions where order_id = p_order_id;
  if v_row.version <> v_latest or v_row.status <> 'pending' then
    -- Someone is looking at an outdated proof (another tab, or a newer version exists).
    raise exception 'proof_outdated' using errcode = 'check_violation';
  end if;
  return v_row;
end;
$$;

-- -----------------------------------------------------------------------------
-- Approve: log who approved which version and when, unlock print files, lock the design.
-- -----------------------------------------------------------------------------
create function public.approve_proof(
  p_order_id uuid,
  p_version_id uuid,
  p_version integer,
  p_actor_id uuid,
  p_ip inet default null,
  p_user_agent text default null
)
returns public.proof_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.proof_versions;
begin
  v_row := public.lock_open_proof(p_order_id, p_version_id, p_version, p_actor_id);

  insert into public.proof_events (proof_version_id, order_id, action, actor_id, snapshot_hash, ip, user_agent)
  values (v_row.id, p_order_id, 'approved', p_actor_id, v_row.snapshot_hash, p_ip, left(p_user_agent, 500));

  update public.proof_versions set status = 'approved' where id = v_row.id returning * into v_row;

  -- The approval gate (PRD p6 §08): print files may be produced from now on.
  update public.orders
     set approved_proof_id = v_row.id, files_unlocked_at = now()
   where id = p_order_id;

  -- The saved design behind this order cannot be edited any more (copies can).
  update public.designs set is_locked = true
   where id in (select design_id from public.order_items where order_id = p_order_id and design_id is not null);

  return v_row;
end;
$$;

-- -----------------------------------------------------------------------------
-- Request changes: log the comment, close this version, send the order back to artwork.
-- -----------------------------------------------------------------------------
create function public.request_proof_changes(
  p_order_id uuid,
  p_version_id uuid,
  p_version integer,
  p_actor_id uuid,
  p_comment text,
  p_ip inet default null,
  p_user_agent text default null
)
returns public.proof_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.proof_versions;
begin
  if length(btrim(coalesce(p_comment, ''))) = 0 then
    raise exception 'comment_required' using errcode = 'check_violation';
  end if;
  v_row := public.lock_open_proof(p_order_id, p_version_id, p_version, p_actor_id);

  insert into public.proof_events (proof_version_id, order_id, action, actor_id, comment, snapshot_hash, ip, user_agent)
  values (v_row.id, p_order_id, 'changes_requested', p_actor_id, left(btrim(p_comment), 2000),
          v_row.snapshot_hash, p_ip, left(p_user_agent, 500));

  update public.proof_versions set status = 'changes_requested' where id = v_row.id returning * into v_row;
  perform public.transition_order(p_order_id, 'artwork', p_actor_id,
                                  format('Changes requested on proof v%s', v_row.version));
  return v_row;
end;
$$;

revoke execute on function public.create_proof_version(uuid, integer, public.proof_source, jsonb, jsonb, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.lock_open_proof(uuid, uuid, integer, uuid) from public, anon, authenticated;
revoke execute on function public.approve_proof(uuid, uuid, integer, uuid, inet, text) from public, anon, authenticated;
revoke execute on function public.request_proof_changes(uuid, uuid, integer, uuid, text, inet, text) from public, anon, authenticated;
grant execute on function public.create_proof_version(uuid, integer, public.proof_source, jsonb, jsonb, text, text, text, uuid) to service_role;
grant execute on function public.lock_open_proof(uuid, uuid, integer, uuid) to service_role;
grant execute on function public.approve_proof(uuid, uuid, integer, uuid, inet, text) to service_role;
grant execute on function public.request_proof_changes(uuid, uuid, integer, uuid, text, inet, text) to service_role;
