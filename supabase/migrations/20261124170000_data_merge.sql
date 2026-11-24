-- =============================================================================
-- CSV variable-data merge (PRD p6 §07, DECISIONS D-09).
--
-- A design for a variable-data product can carry a data file: which uploaded CSV, and which
-- column fills each placeholder. At checkout the server freezes the parsed rows in
-- merge_jobs; proofs and print files are made from that frozen copy.
-- =============================================================================

alter table public.designs add column data_merge jsonb;
comment on column public.designs.data_merge is
  'CSV merge settings: {"csvAssetId": uuid, "mapping": {"PLACEHOLDER": "column" | null}}';

-- A design locked by an approved proof cannot change its data file either.
create or replace function public.designs_guard()
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
    or new.data_merge is distinct from old.data_merge
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

-- One merge job per order (re-validation after a change request updates it in place).
create unique index merge_jobs_one_per_order_idx on public.merge_jobs (order_id);

-- Proof versions record the CSV data set they cover in the same transaction that creates
-- them (no window where a version exists without its dataset hash).
drop function public.create_proof_version(uuid, integer, public.proof_source, jsonb, jsonb, text, text, text, uuid);

create function public.create_proof_version(
  p_order_id uuid,
  p_version integer,
  p_source public.proof_source,
  p_document jsonb,
  p_config jsonb,
  p_snapshot_hash text,
  p_pdf_path text,
  p_png_path text,
  p_actor_id uuid default null,
  p_merge_dataset_hash text default null
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
    order_id, version, source, document_snapshot, config_snapshot, merge_dataset_hash,
    snapshot_hash, proof_pdf_path, proof_png_path, status, created_by
  ) values (
    p_order_id, p_version, p_source, p_document, p_config, p_merge_dataset_hash,
    p_snapshot_hash, p_pdf_path, p_png_path, 'pending', p_actor_id
  )
  returning * into v_row;

  if v_order.status = 'artwork' then
    perform public.transition_order(p_order_id, 'proof', p_actor_id, format('Proof v%s ready', p_version));
  end if;
  return v_row;
end;
$$;

revoke execute on function public.create_proof_version(uuid, integer, public.proof_source, jsonb, jsonb, text, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.create_proof_version(uuid, integer, public.proof_source, jsonb, jsonb, text, text, text, uuid, text) to service_role;
