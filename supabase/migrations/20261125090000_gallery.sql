-- =============================================================================
-- Gallery (PRD R-45: work organised by product family, filterable by division; D-19).
--
-- There are no real customer photos, so each item is SAMPLE work: one of our templates with
-- its own text, rendered on request by the same print engine that makes proofs and print
-- files. The UI labels every item "Sample work". An uploaded photo (image_path) can replace
-- the rendering later without code changes.
-- =============================================================================

alter table public.gallery_items alter column image_path drop not null;
alter table public.gallery_items
  add column template_id uuid references public.templates (id) on delete cascade,
  add column sample_values jsonb not null default '{}'::jsonb,
  add constraint gallery_items_has_picture check (image_path is not null or template_id is not null),
  add constraint gallery_items_values_object check (jsonb_typeof(sample_values) = 'object');

create index gallery_items_template_idx on public.gallery_items (template_id);

-- Sample items: two per division, each a template with different text.
insert into public.gallery_items (division_id, template_id, title, caption, sample_values, sort_order)
select d.id, t.id, v.title, v.caption, v.sample_values::jsonb, v.sort_order
  from (values
    ('custom-stickers', 'Café stickers', 'Logo and name stickers, 50 mm, gloss vinyl.',
     '{"BRAND":"NORTH BEAN CAFÉ"}', 1),
    ('custom-stickers', 'Brewery labels', 'Round product stickers for bottle caps.',
     '{"BRAND":"HOPWORKS"}', 2),
    ('race-numbers', 'City 10K bibs', 'A5 Tyvek race numbers, personalised from the entry list.',
     '{"BIB":"0417","NAME":"PRIYA SHAH"}', 1),
    ('race-numbers', 'Trail marathon bibs', 'Tear-proof bibs with long names shrunk to fit.',
     '{"BIB":"2208","NAME":"ALEKSANDRA NOWAK"}', 2),
    ('mtb-number-boards', 'Enduro series plates', 'Rigid PVC handlebar boards with rider names.',
     '{"NUMBER":"7","NAME":"J. OKAFOR"}', 1),
    ('mtb-number-boards', 'BMX club plates', 'Number boards for a club race night.',
     '{"NUMBER":"113","NAME":"LUCA ROSSI"}', 2),
    ('custom-stamps', 'Company address stamp', 'Self-inking stamp, mirrored automatically for print.',
     '{"LINE1":"HARBOUR & CO LTD","LINE2":"4 Quay Street","LINE3":"Bristol, BS1 4QA"}', 1),
    ('custom-stamps', 'Studio return stamp', 'Three-line stamp for parcels.',
     '{"LINE1":"FERN STUDIO","LINE2":"Unit 2, Mill Lane","LINE3":"York, YO1 7EP"}', 2),
    ('engraved-plates', 'Club award plates', 'Engraved plates for end-of-season trophies.',
     '{"TITLE":"PLAYER OF THE SEASON","WINNER":"Mia Thompson","YEAR":"2026"}', 1),
    ('engraved-plates', 'Long service plaque', 'Brushed plate for a staff award.',
     '{"TITLE":"TEN YEARS OF SERVICE","WINNER":"Daniel Evans","YEAR":"2016–2026"}', 2),
    ('laser-cut-signs', 'House sign', 'Laser-cut acrylic house number and name.',
     '{"NUMBER":"18","NAME":"ROSE COTTAGE"}', 1),
    ('laser-cut-signs', 'Workshop sign', 'Birch ply sign for a maker''s studio.',
     '{"NUMBER":"3","NAME":"THE PRINT SHED"}', 2)
  ) as v(product_slug, title, caption, sample_values, sort_order)
  join public.products p on p.slug = v.product_slug
  join public.divisions d on d.id = p.division_id
  join lateral (
    select id from public.templates where product_id = p.id order by sort_order limit 1
  ) t on true;
