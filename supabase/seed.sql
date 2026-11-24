-- =============================================================================
-- Seed data: settings, the six divisions, materials, one configurable product per
-- division, volume-discount tiers and starter templates.
--
-- All prices are ILLUSTRATIVE sample rates (the PRD gives none). They are data, so
-- an admin can change them without code. Currency/tax follow DECISIONS D-02,
-- tiers D-06, print defaults D-08, CSV products D-09.
--
-- Users are not seeded here; test accounts are created by a script in Phase 2.
-- =============================================================================

-- Settings ---------------------------------------------------------------------
insert into public.settings (id, currency, tax_rate, tax_label, prices_entered_net, max_csv_rows, company_legal)
values (
  true, 'GBP', 0.2000, 'VAT', true, 100,
  jsonb_build_object(
    'name', 'Digital Heroes Print (demo)',
    'address', jsonb_build_array('Demo address only', 'Not a real business'),
    'vat_number', null
  )
);

-- Divisions (PRD p4 §04) ---------------------------------------------------------
insert into public.divisions (slug, name, tagline, description, sort_order) values
  ('labels-stickers', 'Labels & Stickers', 'Die-cut, kiss-cut and sheet labels',
   'Custom stickers and product labels in any size, on vinyl or paper.', 1),
  ('race-event-numbers', 'Race & Event Numbers', 'Personalised bibs for every runner',
   'Tear-proof race numbers with names and bib numbers merged from your entry list.', 2),
  ('mtb-boards', 'MTB Boards', 'Handlebar plates built for mud',
   'Rigid number boards for mountain-bike and BMX events, personalised per rider.', 3),
  ('stamps', 'Stamps', 'Self-inking and wooden stamps',
   'Address, logo and approval stamps made to your exact layout.', 4),
  ('trophies', 'Trophies', 'Engraved plates and awards',
   'Engraved trophy plates in brass, silver or laminate, sized to your award.', 5),
  ('laser-cut', 'Laser-Cut Work', 'Acrylic and wood, cut to shape',
   'House signs, plaques and shapes laser-cut and engraved in acrylic or birch ply.', 6);

-- Materials ------------------------------------------------------------------------
insert into public.materials (slug, name, description) values
  ('gloss-vinyl',     'Gloss vinyl',            'Waterproof vinyl with a gloss finish'),
  ('matte-vinyl',     'Matte vinyl',            'Waterproof vinyl with a matte finish'),
  ('clear-vinyl',     'Clear vinyl',            'Transparent vinyl for glass and bottles'),
  ('paper-label',     'Paper',                  'Uncoated paper for indoor use'),
  ('tyvek',           'Tyvek',                  'Tear-proof, water-resistant synthetic'),
  ('synthetic-paper', 'Synthetic paper',        'Waterproof polypropylene paper'),
  ('race-paper',      'Coated paper',           'Budget option for short events'),
  ('correx',          'Correx (corrugated PP)', 'Light, weatherproof fluted board'),
  ('rigid-pvc',       'Rigid PVC 1 mm',         'Stiff, smooth board for premium plates'),
  ('self-inking',     'Self-inking mount',      'Built-in ink pad, thousands of impressions'),
  ('wood-mount',      'Wooden handle',          'Classic beech handle, separate ink pad'),
  ('brushed-brass',   'Brushed brass',          'Engraved brass plate'),
  ('brushed-silver',  'Brushed silver aluminium', 'Engraved aluminium plate'),
  ('black-gold',      'Black/gold laminate',    'Engraves through to a gold core'),
  ('acrylic-clear-3', 'Clear acrylic 3 mm',     'Crystal-clear cast acrylic'),
  ('acrylic-black-5', 'Black acrylic 5 mm',     'Gloss black, engraves white'),
  ('birch-ply-3',     'Birch ply 3 mm',         'Laser-grade birch plywood');

-- Products: one parameter-driven product per division -----------------------------
insert into public.products (
  division_id, slug, name, short_description, pricing_model,
  base_unit_price, setup_fee_minor, variable_data_unit_fee,
  min_width_mm, max_width_mm, min_height_mm, max_height_mm,
  default_width_mm, default_height_mm, size_presets,
  bleed_mm, safe_margin_mm, output_dpi, mirror_output,
  min_qty, max_qty, supports_variable_data, options, sort_order
)
select
  d.id, v.slug, v.name, v.short_description, v.pricing_model,
  v.base_unit_price, v.setup_fee_minor, v.variable_data_unit_fee,
  v.min_width_mm, v.max_width_mm, v.min_height_mm, v.max_height_mm,
  v.default_width_mm, v.default_height_mm, v.size_presets,
  v.bleed_mm, v.safe_margin_mm, v.output_dpi, v.mirror_output,
  v.min_qty, v.max_qty, v.supports_variable_data, v.options, v.sort_order
from (values
  ('labels-stickers', 'custom-stickers', 'Custom Stickers',
   'Any shape size from 20 to 300 mm.', 'area'::public.pricing_model,
   0.0500, 0, 0.0000,
   20, 300, 20, 300, 50, 50,
   '[{"label":"50 × 50 mm","width_mm":50,"height_mm":50},{"label":"75 × 75 mm","width_mm":75,"height_mm":75},{"label":"100 × 50 mm","width_mm":100,"height_mm":50}]'::jsonb,
   2, 3, 300, false,
   25, 10000, false, '[]'::jsonb, 1),

  ('race-event-numbers', 'race-numbers', 'Race Numbers',
   'Personalised bibs, merged from your CSV entry list.', 'area',
   0.2000, 0, 0.0500,
   100, 297, 80, 210, 148, 210,
   '[{"label":"A5","width_mm":148,"height_mm":210},{"label":"A6","width_mm":105,"height_mm":148},{"label":"200 × 150 mm","width_mm":200,"height_mm":150}]'::jsonb,
   3, 3, 300, false,
   10, 5000, true, '[]'::jsonb, 1),

  ('mtb-boards', 'mtb-number-boards', 'MTB Number Boards',
   'Weatherproof handlebar plates, one per rider.', 'area',
   1.5000, 0, 0.1000,
   150, 250, 120, 200, 200, 165,
   '[{"label":"Standard 200 × 165 mm","width_mm":200,"height_mm":165},{"label":"Small 160 × 130 mm","width_mm":160,"height_mm":130}]'::jsonb,
   3, 3, 300, false,
   5, 2000, true,
   '[{"key":"fixing","label":"Fixing holes","values":[{"value":"three-hole","label":"3 holes + cable ties","price_per_unit":0.30,"default":true},{"value":"none","label":"No holes","price_per_unit":0}]}]'::jsonb,
   1),

  ('stamps', 'custom-stamps', 'Custom Stamps',
   'Text or logo stamps, self-inking or wooden.', 'unit',
   8.0000, 0, 0.0000,
   20, 80, 10, 60, 58, 22,
   '[{"label":"58 × 22 mm","width_mm":58,"height_mm":22},{"label":"38 × 14 mm","width_mm":38,"height_mm":14},{"label":"40 mm square","width_mm":40,"height_mm":40}]'::jsonb,
   3, 3, 600, true,
   1, 500, false,
   '[{"key":"ink","label":"Ink colour","values":[{"value":"black","label":"Black","price_per_unit":0,"default":true},{"value":"blue","label":"Blue","price_per_unit":0},{"value":"red","label":"Red","price_per_unit":0},{"value":"green","label":"Green","price_per_unit":0}]}]'::jsonb,
   1),

  ('trophies', 'engraved-plates', 'Engraved Trophy Plates',
   'Plates for cups, shields and awards.', 'area',
   3.0000, 0, 0.0000,
   30, 150, 15, 100, 70, 25,
   '[{"label":"70 × 25 mm","width_mm":70,"height_mm":25},{"label":"50 × 20 mm","width_mm":50,"height_mm":20},{"label":"100 × 40 mm","width_mm":100,"height_mm":40}]'::jsonb,
   3, 3, 600, false,
   1, 1000, false,
   '[{"key":"fixing","label":"Fixing","values":[{"value":"adhesive","label":"Self-adhesive","price_per_unit":0.20,"default":true},{"value":"pins","label":"Pin holes","price_per_unit":0}]}]'::jsonb,
   1),

  ('laser-cut', 'laser-cut-signs', 'Laser-Cut Signs',
   'Signs and plaques cut and engraved to size.', 'area',
   2.0000, 500, 0.0000,
   50, 600, 50, 600, 300, 200,
   '[{"label":"300 × 200 mm","width_mm":300,"height_mm":200},{"label":"200 × 100 mm","width_mm":200,"height_mm":100},{"label":"400 × 300 mm","width_mm":400,"height_mm":300}]'::jsonb,
   3, 3, 300, false,
   1, 500, false,
   '[{"key":"mounting","label":"Mounting","values":[{"value":"none","label":"None","price_per_unit":0,"default":true},{"value":"four-holes","label":"4 screw holes","price_per_unit":0.50},{"value":"standoffs","label":"Steel stand-offs","price_per_unit":6.00}]}]'::jsonb,
   1)
) as v(
  division_slug, slug, name, short_description, pricing_model,
  base_unit_price, setup_fee_minor, variable_data_unit_fee,
  min_width_mm, max_width_mm, min_height_mm, max_height_mm,
  default_width_mm, default_height_mm, size_presets,
  bleed_mm, safe_margin_mm, output_dpi, mirror_output,
  min_qty, max_qty, supports_variable_data, options, sort_order
)
join public.divisions d on d.slug = v.division_slug;

-- Guard against a division slug typo silently dropping a product from the join.
do $$
begin
  if (select count(*) from public.products) <> 6 then
    raise exception 'Expected 6 seeded products';
  end if;
end;
$$;

-- Product materials and rates -------------------------------------------------------
insert into public.product_materials (product_id, material_id, price_per_cm2, price_per_unit, is_default, sort_order)
select p.id, m.id, v.per_cm2, v.per_unit, v.is_default, v.sort_order
from (values
  ('custom-stickers',   'gloss-vinyl',     0.004000, 0.0000, true,  1),
  ('custom-stickers',   'matte-vinyl',     0.004500, 0.0000, false, 2),
  ('custom-stickers',   'clear-vinyl',     0.005000, 0.0000, false, 3),
  ('custom-stickers',   'paper-label',     0.002500, 0.0000, false, 4),
  ('race-numbers',      'tyvek',           0.001500, 0.0000, true,  1),
  ('race-numbers',      'synthetic-paper', 0.001200, 0.0000, false, 2),
  ('race-numbers',      'race-paper',      0.000800, 0.0000, false, 3),
  ('mtb-number-boards', 'correx',          0.004000, 0.0000, true,  1),
  ('mtb-number-boards', 'rigid-pvc',       0.006000, 0.0000, false, 2),
  ('custom-stamps',     'self-inking',     0.000000, 6.0000, true,  1),
  ('custom-stamps',     'wood-mount',      0.000000, 2.0000, false, 2),
  ('engraved-plates',   'brushed-brass',   0.020000, 0.0000, true,  1),
  ('engraved-plates',   'brushed-silver',  0.015000, 0.0000, false, 2),
  ('engraved-plates',   'black-gold',      0.012000, 0.0000, false, 3),
  ('laser-cut-signs',   'acrylic-clear-3', 0.012000, 0.0000, true,  1),
  ('laser-cut-signs',   'acrylic-black-5', 0.018000, 0.0000, false, 2),
  ('laser-cut-signs',   'birch-ply-3',     0.008000, 0.0000, false, 3)
) as v(product_slug, material_slug, per_cm2, per_unit, is_default, sort_order)
join public.products p on p.slug = v.product_slug
join public.materials m on m.slug = v.material_slug;

-- Global volume-discount tiers (DECISIONS D-06) ----------------------------------------
insert into public.discount_tiers (product_id, min_qty, percent_off) values
  (null, 100, 10.00),
  (null, 250, 15.00),
  (null, 500, 20.00);

-- Templates ----------------------------------------------------------------------------
-- DesignDocument v1: coordinates in mm from the trim's top-left corner; bleed extends
-- into negative/oversize coordinates. Font sizes are points. fontId values must exist in
-- the font registry added in Phase 6. Text with placeholderKey is filled per order or per
-- CSV row and fitted with the min/max size and tracking rules (PRD p4 §04, p6 §07).
insert into public.templates (product_id, name, group_name, description, document, sort_order)
select p.id, v.name, v.group_name, v.description, v.document::jsonb, v.sort_order
from (values
  ('race-numbers', 'Classic Bib', 'Running',
   'Event band, big bib number and runner name.',
   $json${
     "version": 1, "unit": "mm",
     "trim": {"w": 148, "h": 210}, "bleed": 3, "safeMargin": 3,
     "background": {"color": "#FFFFFF"},
     "printAreas": [{"id": "main", "x": 0, "y": 0, "w": 148, "h": 210, "shape": "rect", "allowBleed": true}],
     "elements": [
       {"id": "band", "type": "rect", "areaId": "main", "x": -3, "y": -3, "w": 154, "h": 33, "rotation": 0, "fill": "#FF4D00", "locked": true},
       {"id": "event", "type": "text", "areaId": "main", "x": 8, "y": 6, "w": 132, "h": 18, "rotation": 0,
        "text": "CITY 10K 2026", "fontId": "sora-bold", "fontSize": 28, "minFontSize": 14, "maxFontSize": 28,
        "tracking": 0, "minTracking": -40, "fit": "shrink", "align": "center", "color": "#FFFFFF"},
       {"id": "bib", "type": "text", "areaId": "main", "x": 8, "y": 42, "w": 132, "h": 95, "rotation": 0,
        "placeholderKey": "BIB", "text": "1234", "fontId": "sora-bold", "fontSize": 240, "minFontSize": 90, "maxFontSize": 240,
        "tracking": 0, "minTracking": -60, "fit": "shrink", "align": "center", "color": "#121212"},
       {"id": "name", "type": "text", "areaId": "main", "x": 8, "y": 145, "w": 132, "h": 22, "rotation": 0,
        "placeholderKey": "NAME", "text": "ALEX MORGAN", "fontId": "inter-semibold", "fontSize": 48, "minFontSize": 20, "maxFontSize": 48,
        "tracking": 20, "minTracking": -40, "fit": "shrink", "align": "center", "color": "#121212"},
       {"id": "footer", "type": "text", "areaId": "main", "x": 8, "y": 186, "w": 132, "h": 14, "rotation": 0,
        "text": "Pin at all four corners", "fontId": "inter-regular", "fontSize": 12, "minFontSize": 8, "maxFontSize": 12,
        "tracking": 0, "minTracking": -20, "fit": "shrink", "align": "center", "color": "#555555"}
     ]
   }$json$, 1),

  ('mtb-number-boards', 'Classic Plate', 'Cycling',
   'Large race number with rider name underneath.',
   $json${
     "version": 1, "unit": "mm",
     "trim": {"w": 200, "h": 165}, "bleed": 3, "safeMargin": 3,
     "background": {"color": "#FFDD00"},
     "printAreas": [{"id": "main", "x": 0, "y": 0, "w": 200, "h": 165, "shape": "rect", "allowBleed": true}],
     "elements": [
       {"id": "number", "type": "text", "areaId": "main", "x": 10, "y": 15, "w": 180, "h": 100, "rotation": 0,
        "placeholderKey": "NUMBER", "text": "27", "fontId": "sora-bold", "fontSize": 280, "minFontSize": 120, "maxFontSize": 280,
        "tracking": 0, "minTracking": -60, "fit": "shrink", "align": "center", "color": "#121212"},
       {"id": "name", "type": "text", "areaId": "main", "x": 10, "y": 125, "w": 180, "h": 28, "rotation": 0,
        "placeholderKey": "NAME", "text": "RIDER NAME", "fontId": "inter-semibold", "fontSize": 56, "minFontSize": 24, "maxFontSize": 56,
        "tracking": 20, "minTracking": -40, "fit": "shrink", "align": "center", "color": "#121212"}
     ]
   }$json$, 1),

  ('custom-stickers', 'Logo & Name', 'Business',
   'Logo above your brand name.',
   $json${
     "version": 1, "unit": "mm",
     "trim": {"w": 50, "h": 50}, "bleed": 2, "safeMargin": 3,
     "background": {"color": "#FFFFFF"},
     "printAreas": [{"id": "main", "x": 0, "y": 0, "w": 50, "h": 50, "shape": "rect", "allowBleed": true}],
     "elements": [
       {"id": "logo", "type": "image", "areaId": "main", "x": 12, "y": 6, "w": 26, "h": 26, "rotation": 0,
        "assetId": null, "role": "logo-slot"},
       {"id": "brand", "type": "text", "areaId": "main", "x": 4, "y": 35, "w": 42, "h": 10, "rotation": 0,
        "placeholderKey": "BRAND", "text": "YOUR BRAND", "fontId": "sora-bold", "fontSize": 18, "minFontSize": 8, "maxFontSize": 18,
        "tracking": 0, "minTracking": -30, "fit": "shrink", "align": "center", "color": "#121212"}
     ]
   }$json$, 1),

  ('custom-stamps', 'Address Stamp', 'Office',
   'Three-line address stamp.',
   $json${
     "version": 1, "unit": "mm",
     "trim": {"w": 58, "h": 22}, "bleed": 3, "safeMargin": 3,
     "background": {"color": "#FFFFFF"},
     "printAreas": [{"id": "main", "x": 0, "y": 0, "w": 58, "h": 22, "shape": "rect", "allowBleed": false}],
     "elements": [
       {"id": "line1", "type": "text", "areaId": "main", "x": 3, "y": 3, "w": 52, "h": 5.5, "rotation": 0,
        "placeholderKey": "LINE1", "text": "COMPANY NAME LTD", "fontId": "inter-semibold", "fontSize": 12, "minFontSize": 6, "maxFontSize": 12,
        "tracking": 0, "minTracking": -30, "fit": "shrink", "align": "center", "color": "#000000"},
       {"id": "line2", "type": "text", "areaId": "main", "x": 3, "y": 9, "w": 52, "h": 4.5, "rotation": 0,
        "placeholderKey": "LINE2", "text": "12 Example Street", "fontId": "inter-regular", "fontSize": 9, "minFontSize": 6, "maxFontSize": 9,
        "tracking": 0, "minTracking": -30, "fit": "shrink", "align": "center", "color": "#000000"},
       {"id": "line3", "type": "text", "areaId": "main", "x": 3, "y": 14, "w": 52, "h": 4.5, "rotation": 0,
        "placeholderKey": "LINE3", "text": "Town, AB1 2CD", "fontId": "inter-regular", "fontSize": 9, "minFontSize": 6, "maxFontSize": 9,
        "tracking": 0, "minTracking": -30, "fit": "shrink", "align": "center", "color": "#000000"}
     ]
   }$json$, 1),

  ('engraved-plates', 'Three-Line Plate', 'Awards',
   'Award title, winner name and year.',
   $json${
     "version": 1, "unit": "mm",
     "trim": {"w": 70, "h": 25}, "bleed": 3, "safeMargin": 3,
     "background": {"color": "#D4B26A"},
     "printAreas": [{"id": "main", "x": 0, "y": 0, "w": 70, "h": 25, "shape": "rect", "allowBleed": false}],
     "elements": [
       {"id": "title", "type": "text", "areaId": "main", "x": 4, "y": 3, "w": 62, "h": 6, "rotation": 0,
        "placeholderKey": "TITLE", "text": "PLAYER OF THE YEAR", "fontId": "sora-bold", "fontSize": 12, "minFontSize": 6, "maxFontSize": 12,
        "tracking": 20, "minTracking": -30, "fit": "shrink", "align": "center", "color": "#121212"},
       {"id": "winner", "type": "text", "areaId": "main", "x": 4, "y": 10, "w": 62, "h": 6, "rotation": 0,
        "placeholderKey": "WINNER", "text": "Sam Taylor", "fontId": "inter-semibold", "fontSize": 13, "minFontSize": 6, "maxFontSize": 13,
        "tracking": 0, "minTracking": -30, "fit": "shrink", "align": "center", "color": "#121212"},
       {"id": "year", "type": "text", "areaId": "main", "x": 4, "y": 17, "w": 62, "h": 5, "rotation": 0,
        "placeholderKey": "YEAR", "text": "2026", "fontId": "inter-regular", "fontSize": 10, "minFontSize": 6, "maxFontSize": 10,
        "tracking": 0, "minTracking": -20, "fit": "shrink", "align": "center", "color": "#121212"}
     ]
   }$json$, 1),

  ('laser-cut-signs', 'House Sign', 'Home',
   'House number with a name line.',
   $json${
     "version": 1, "unit": "mm",
     "trim": {"w": 300, "h": 200}, "bleed": 3, "safeMargin": 3,
     "background": {"color": "#1A1A1A"},
     "printAreas": [{"id": "main", "x": 0, "y": 0, "w": 300, "h": 200, "shape": "rect", "allowBleed": false}],
     "elements": [
       {"id": "number", "type": "text", "areaId": "main", "x": 20, "y": 20, "w": 260, "h": 110, "rotation": 0,
        "placeholderKey": "NUMBER", "text": "42", "fontId": "sora-bold", "fontSize": 300, "minFontSize": 120, "maxFontSize": 300,
        "tracking": 0, "minTracking": -40, "fit": "shrink", "align": "center", "color": "#FFFFFF"},
       {"id": "name", "type": "text", "areaId": "main", "x": 20, "y": 140, "w": 260, "h": 40, "rotation": 0,
        "placeholderKey": "NAME", "text": "THE OLD BAKERY", "fontId": "inter-semibold", "fontSize": 72, "minFontSize": 28, "maxFontSize": 72,
        "tracking": 60, "minTracking": -20, "fit": "shrink", "align": "center", "color": "#FFFFFF"}
     ]
   }$json$, 1)
) as v(product_slug, name, group_name, description, document, sort_order)
join public.products p on p.slug = v.product_slug;

-- Gallery: sample work (DECISIONS D-19), the same rows as migration 20261125090000_gallery.sql,
-- which only finds templates on databases created before it. Skipped if items already exist.
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
  ) t on true
 where not exists (select 1 from public.gallery_items);

-- Gallery sticker samples carry their own artwork (same as migration 20261125091000).
create function pg_temp.sticker(
  p_background text, p_mark text, p_rotation integer, p_text_colour text,
  p_brand text, p_tagline text, p_tagline_colour text
) returns jsonb language sql as $$
  select jsonb_build_object(
    'version', 1, 'unit', 'mm', 'trim', jsonb_build_object('w', 50, 'h', 50), 'bleed', 2,
    'safeMargin', 3, 'background', jsonb_build_object('color', p_background),
    'printAreas', jsonb_build_array(jsonb_build_object(
      'id', 'main', 'x', 0, 'y', 0, 'w', 50, 'h', 50, 'shape', 'rect', 'allowBleed', true)),
    'elements', jsonb_build_array(
      jsonb_build_object('id', 'mark', 'type', 'rect', 'areaId', 'main', 'x', 17, 'y', 7,
        'w', 16, 'h', 16, 'rotation', p_rotation, 'fill', p_mark),
      jsonb_build_object('id', 'brand', 'type', 'text', 'areaId', 'main', 'x', 4, 'y', 28,
        'w', 42, 'h', 10, 'rotation', 0, 'text', p_brand, 'placeholderKey', 'BRAND',
        'fontId', 'sora-bold', 'fontSize', 16, 'minFontSize', 7, 'maxFontSize', 16,
        'tracking', 0, 'minTracking', -30, 'fit', 'shrink', 'align', 'center', 'color', p_text_colour),
      jsonb_build_object('id', 'tagline', 'type', 'text', 'areaId', 'main', 'x', 6, 'y', 39,
        'w', 38, 'h', 5, 'rotation', 0, 'text', p_tagline,
        'fontId', 'inter-semibold', 'fontSize', 7, 'minFontSize', 5, 'maxFontSize', 7,
        'tracking', 80, 'minTracking', 0, 'fit', 'shrink', 'align', 'center', 'color', p_tagline_colour))
  );
$$;

update public.gallery_items
   set document = pg_temp.sticker('#2B1D16', '#FF4D00', 45, '#F4F2ED', 'NORTH BEAN CAFÉ', 'EST. 2019', '#FF8A4D')
 where title = 'Café stickers';
update public.gallery_items
   set document = pg_temp.sticker('#1F3A2E', '#F4C430', 0, '#F4F2ED', 'HOPWORKS', 'PALE ALE · 4.5%', '#F4C430')
 where title = 'Brewery labels';
