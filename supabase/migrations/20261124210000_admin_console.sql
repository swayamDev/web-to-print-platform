-- =============================================================================
-- Admin console (PRD p4 §03, p8 §11–12, DECISIONS D-16, D-17).
--
-- Server-only helpers for the admin pages. Each is called by server code after
-- requireAdmin(); each also re-checks that the actor is an admin, so a bug in the app can
-- never turn a customer into an admin or cancel someone's order.
-- =============================================================================

create function public.assert_admin(p_actor uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_actor is null or not exists (
    select 1 from public.profiles where id = p_actor and role = 'admin'
  ) then
    raise exception 'admin_required' using errcode = 'insufficient_privilege';
  end if;
end;
$$;
revoke execute on function public.assert_admin(uuid) from public, anon, authenticated;
grant execute on function public.assert_admin(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- Users: directory with sign-in email and order counts (emails live in auth.users).
-- -----------------------------------------------------------------------------
create function public.admin_user_directory(
  p_actor uuid,
  p_query text default null,
  p_role public.user_role default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  email text,
  full_name text,
  company_name text,
  phone text,
  role public.user_role,
  created_at timestamptz,
  order_count bigint,
  paid_total_minor bigint,
  last_order_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
begin
  perform public.assert_admin(p_actor);
  return query
  with matches as (
    select p.id, u.email::text as email, p.full_name, p.company_name, p.phone, p.role, p.created_at
      from public.profiles p
      join auth.users u on u.id = p.id
     where (p_role is null or p.role = p_role)
       and (v_query is null
            or u.email ilike '%' || v_query || '%'
            or p.full_name ilike '%' || v_query || '%'
            or p.company_name ilike '%' || v_query || '%')
  )
  select m.id, m.email, m.full_name, m.company_name, m.phone, m.role, m.created_at,
         count(o.id) as order_count,
         coalesce(sum(o.total_gross_minor) filter (where o.paid_at is not null), 0)::bigint,
         max(o.created_at) as last_order_at,
         count(*) over () as total_count
    from matches m
    left join public.orders o on o.customer_id = m.id
   group by m.id, m.email, m.full_name, m.company_name, m.phone, m.role, m.created_at
   order by m.created_at desc
   limit least(greatest(p_limit, 1), 200)
  offset greatest(p_offset, 0);
end;
$$;
revoke execute on function public.admin_user_directory(uuid, text, public.user_role, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_user_directory(uuid, text, public.user_role, integer, integer) to service_role;

-- -----------------------------------------------------------------------------
-- Change a user's role (D-17), audited. Admins cannot change their own role, and the last
-- admin can never be demoted, so the console can never lock everyone out.
-- -----------------------------------------------------------------------------
create function public.admin_set_role(
  p_actor uuid,
  p_target uuid,
  p_role public.user_role
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_from public.user_role;
begin
  perform public.assert_admin(p_actor);
  if p_actor = p_target then
    raise exception 'cannot_change_own_role' using errcode = 'check_violation';
  end if;

  -- Serialise role changes so two admins cannot demote each other at the same moment.
  perform pg_advisory_xact_lock(hashtext('admin_set_role'));

  select * into v_profile from public.profiles where id = p_target for update;
  if not found then
    raise exception 'user_not_found' using errcode = 'no_data_found';
  end if;
  v_from := v_profile.role;
  if v_from = p_role then
    return v_profile;
  end if;
  if v_from = 'admin' and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'last_admin' using errcode = 'check_violation';
  end if;

  update public.profiles set role = p_role where id = p_target returning * into v_profile;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, diff)
  values (p_actor, 'user.role_changed', 'profile', p_target::text,
          jsonb_build_object('from', v_from, 'to', p_role));
  return v_profile;
end;
$$;
revoke execute on function public.admin_set_role(uuid, uuid, public.user_role) from public, anon, authenticated;
grant execute on function public.admin_set_role(uuid, uuid, public.user_role) to service_role;

-- -----------------------------------------------------------------------------
-- Pipeline actions on one order, audited.
--   complete: production -> completed
--   cancel:   any unfinished stage -> cancelled (a reason is required; refunds are manual, D-16)
--   archive / unarchive: completed or cancelled orders only (enforced by orders_guard)
-- -----------------------------------------------------------------------------
create function public.admin_order_action(
  p_actor uuid,
  p_order_id uuid,
  p_action text,
  p_note text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform public.assert_admin(p_actor);
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'no_data_found';
  end if;

  case p_action
    when 'complete' then
      if v_order.status <> 'production' then
        raise exception 'order_not_in_production' using errcode = 'check_violation';
      end if;
      v_order := public.transition_order(p_order_id, 'completed', p_actor, coalesce(v_note, 'Completed'));
    when 'cancel' then
      if v_note is null then
        raise exception 'reason_required' using errcode = 'check_violation';
      end if;
      if v_order.status in ('production', 'completed', 'cancelled') then
        raise exception 'order_cannot_be_cancelled' using errcode = 'check_violation';
      end if;
      v_order := public.transition_order(p_order_id, 'cancelled', p_actor, v_note);
    when 'archive' then
      if v_order.archived_at is not null then
        return v_order;
      end if;
      if v_order.status not in ('completed', 'cancelled') then
        raise exception 'order_not_finished' using errcode = 'check_violation';
      end if;
      update public.orders set archived_at = now() where id = p_order_id returning * into v_order;
    when 'unarchive' then
      update public.orders set archived_at = null where id = p_order_id returning * into v_order;
    else
      raise exception 'unknown_action' using errcode = 'invalid_parameter_value';
  end case;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, diff)
  values (p_actor, 'order.' || p_action, 'order', p_order_id::text,
          jsonb_build_object('status', v_order.status) ||
          case when v_note is not null then jsonb_build_object('note', v_note) else '{}'::jsonb end);
  return v_order;
end;
$$;
revoke execute on function public.admin_order_action(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_order_action(uuid, uuid, text, text) to service_role;
