-- =============================================================================
-- Catalogue management, reports and the Xero export (PRD p4 §03, p9 §14).
-- =============================================================================

-- Xero import settings (sales account, tax rate name, tracking category for divisions).
alter table public.settings add column xero jsonb not null default
  '{"salesAccountCode":"200","taxType":"20% (VAT on Income)","trackingName":"Division"}'::jsonb;
alter table public.settings add constraint settings_xero_shape check (
  jsonb_typeof(xero) = 'object'
  and length(coalesce(xero ->> 'salesAccountCode', '')) between 1 and 20
  and length(coalesce(xero ->> 'taxType', '')) between 1 and 60
  and length(coalesce(xero ->> 'trackingName', '')) <= 30
);

-- -----------------------------------------------------------------------------
-- Update one product with its materials and its own discount tiers, in one transaction,
-- and record what changed. The app validates the input (src/domain/catalogue-admin.ts);
-- the table constraints check it again.
--   p_patch:     column values (see toProductPatch)
--   p_materials: [{"materialId": uuid, "pricePerCm2": "0.004", "pricePerUnit": "0", "isDefault": bool}]
--                (only offered materials; others are removed from the product)
--   p_tiers:     [{"minQty": 100, "percentOff": "10"}] (empty = use the global tiers)
--   p_changes:   the changed fields, for the audit log
-- -----------------------------------------------------------------------------
create function public.admin_update_product(
  p_actor uuid,
  p_product_id uuid,
  p_patch jsonb,
  p_materials jsonb,
  p_tiers jsonb,
  p_changes jsonb default '{}'::jsonb
)
returns public.products
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_before_materials jsonb;
  v_before_tiers jsonb;
  v_after_materials jsonb;
  v_after_tiers jsonb;
begin
  perform public.assert_admin(p_actor);
  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    raise exception 'product_not_found' using errcode = 'no_data_found';
  end if;
  if jsonb_typeof(p_materials) <> 'array' or jsonb_array_length(p_materials) = 0 then
    raise exception 'materials_required' using errcode = 'check_violation';
  end if;
  if (select count(*) from jsonb_array_elements(p_materials) m where (m ->> 'isDefault')::boolean) <> 1 then
    raise exception 'one_default_material' using errcode = 'check_violation';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('material', m.slug, 'perCm2', pm.price_per_cm2,
                                               'perUnit', pm.price_per_unit, 'default', pm.is_default)
                            order by m.slug), '[]')
    into v_before_materials
    from public.product_materials pm join public.materials m on m.id = pm.material_id
   where pm.product_id = p_product_id;
  select coalesce(jsonb_agg(jsonb_build_object('minQty', min_qty, 'percentOff', percent_off) order by min_qty), '[]')
    into v_before_tiers
    from public.discount_tiers where product_id = p_product_id;

  update public.products set
    name                   = p_patch ->> 'name',
    short_description      = p_patch ->> 'short_description',
    is_active              = (p_patch ->> 'is_active')::boolean,
    base_unit_price        = (p_patch ->> 'base_unit_price')::numeric,
    setup_fee_minor        = (p_patch ->> 'setup_fee_minor')::integer,
    variable_data_unit_fee = (p_patch ->> 'variable_data_unit_fee')::numeric,
    min_width_mm           = (p_patch ->> 'min_width_mm')::numeric,
    max_width_mm           = (p_patch ->> 'max_width_mm')::numeric,
    min_height_mm          = (p_patch ->> 'min_height_mm')::numeric,
    max_height_mm          = (p_patch ->> 'max_height_mm')::numeric,
    default_width_mm       = (p_patch ->> 'default_width_mm')::numeric,
    default_height_mm      = (p_patch ->> 'default_height_mm')::numeric,
    min_qty                = (p_patch ->> 'min_qty')::integer,
    max_qty                = (p_patch ->> 'max_qty')::integer,
    qty_step               = (p_patch ->> 'qty_step')::integer,
    bleed_mm               = (p_patch ->> 'bleed_mm')::numeric,
    safe_margin_mm         = (p_patch ->> 'safe_margin_mm')::numeric,
    output_dpi             = (p_patch ->> 'output_dpi')::integer,
    updated_at             = now()
  where id = p_product_id
  returning * into v_product;

  -- Materials: replace the set (the one-default index needs the old rows gone first).
  delete from public.product_materials where product_id = p_product_id;
  insert into public.product_materials (product_id, material_id, price_per_cm2, price_per_unit, is_default, sort_order)
  select p_product_id, (m ->> 'materialId')::uuid, (m ->> 'pricePerCm2')::numeric,
         (m ->> 'pricePerUnit')::numeric, (m ->> 'isDefault')::boolean, (ord - 1)::integer
    from jsonb_array_elements(p_materials) with ordinality as t(m, ord);

  delete from public.discount_tiers where product_id = p_product_id;
  insert into public.discount_tiers (product_id, min_qty, percent_off)
  select p_product_id, (t ->> 'minQty')::integer, (t ->> 'percentOff')::numeric
    from jsonb_array_elements(coalesce(p_tiers, '[]'::jsonb)) t;

  select coalesce(jsonb_agg(jsonb_build_object('material', m.slug, 'perCm2', pm.price_per_cm2,
                                               'perUnit', pm.price_per_unit, 'default', pm.is_default)
                            order by m.slug), '[]')
    into v_after_materials
    from public.product_materials pm join public.materials m on m.id = pm.material_id
   where pm.product_id = p_product_id;
  select coalesce(jsonb_agg(jsonb_build_object('minQty', min_qty, 'percentOff', percent_off) order by min_qty), '[]')
    into v_after_tiers
    from public.discount_tiers where product_id = p_product_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, diff)
  values (p_actor, 'product.updated', 'product', p_product_id::text,
          jsonb_build_object('fields', coalesce(p_changes, '{}'::jsonb))
          || case when v_before_materials is distinct from v_after_materials
                  then jsonb_build_object('materials', jsonb_build_object('from', v_before_materials, 'to', v_after_materials))
                  else '{}'::jsonb end
          || case when v_before_tiers is distinct from v_after_tiers
                  then jsonb_build_object('tiers', jsonb_build_object('from', v_before_tiers, 'to', v_after_tiers))
                  else '{}'::jsonb end);
  return v_product;
end;
$$;
revoke execute on function public.admin_update_product(uuid, uuid, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.admin_update_product(uuid, uuid, jsonb, jsonb, jsonb, jsonb) to service_role;

-- -----------------------------------------------------------------------------
-- Template details (name, group, description, order, visibility), audited.
-- The layout itself is edited as JSON in a later phase; templates in use stay valid because
-- saved designs keep their own copy of the document.
-- -----------------------------------------------------------------------------
create function public.admin_update_template(
  p_actor uuid,
  p_template_id uuid,
  p_patch jsonb
)
returns public.templates
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.templates;
  v_after public.templates;
begin
  perform public.assert_admin(p_actor);
  select * into v_before from public.templates where id = p_template_id for update;
  if not found then
    raise exception 'template_not_found' using errcode = 'no_data_found';
  end if;
  if length(btrim(coalesce(p_patch ->> 'name', ''))) = 0 then
    raise exception 'name_required' using errcode = 'check_violation';
  end if;

  update public.templates set
    name        = btrim(p_patch ->> 'name'),
    group_name  = nullif(btrim(coalesce(p_patch ->> 'group_name', '')), ''),
    description = nullif(btrim(coalesce(p_patch ->> 'description', '')), ''),
    sort_order  = coalesce((p_patch ->> 'sort_order')::integer, v_before.sort_order),
    is_active   = coalesce((p_patch ->> 'is_active')::boolean, v_before.is_active),
    updated_at  = now()
  where id = p_template_id
  returning * into v_after;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, diff)
  values (p_actor, 'template.updated', 'template', p_template_id::text,
          jsonb_build_object(
            'from', jsonb_build_object('name', v_before.name, 'group', v_before.group_name,
                                       'active', v_before.is_active, 'sort', v_before.sort_order),
            'to',   jsonb_build_object('name', v_after.name, 'group', v_after.group_name,
                                       'active', v_after.is_active, 'sort', v_after.sort_order)));
  return v_after;
end;
$$;
revoke execute on function public.admin_update_template(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.admin_update_template(uuid, uuid, jsonb) to service_role;

-- Xero settings change, audited.
create function public.admin_update_xero_settings(p_actor uuid, p_xero jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
begin
  perform public.assert_admin(p_actor);
  select xero into v_before from public.settings for update;
  update public.settings set xero = p_xero, updated_at = now();
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, diff)
  values (p_actor, 'settings.xero_updated', 'settings', 'xero',
          jsonb_build_object('from', v_before, 'to', p_xero));
  return p_xero;
end;
$$;
revoke execute on function public.admin_update_xero_settings(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.admin_update_xero_settings(uuid, jsonb) to service_role;
