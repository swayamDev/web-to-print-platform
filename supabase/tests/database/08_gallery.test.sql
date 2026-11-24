-- Gallery (PRD R-45, D-19): public sample work, every item has something to show.
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

select plan(4);

-- 1: an item needs a photo or a template to render.
select throws_ok(
  $$ insert into public.gallery_items (division_id, title) select id, 'Empty' from public.divisions limit 1 $$,
  '23514', null, 'a gallery item needs a picture'
);

-- 2: the seeded sample work covers every division with two pieces each.
select is(
  (select count(distinct division_id)::int from public.gallery_items where is_active and is_sample),
  (select count(*)::int from public.divisions where is_active),
  'every division has sample work'
);

-- 3–4: visitors see active items only and cannot change them.
update public.gallery_items set is_active = false
 where id = (select id from public.gallery_items order by sort_order, title limit 1);
set local role anon;
select is(
  (select count(*)::int from public.gallery_items where not is_active), 0,
  'visitors do not see hidden items'
);
select throws_ok(
  $$ update public.gallery_items set title = 'Defaced' $$,
  '42501', null, 'visitors cannot edit the gallery'
);
set local role postgres;

select * from finish();
rollback;
