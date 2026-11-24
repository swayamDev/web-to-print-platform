-- Gallery items may carry their own finished design (a full DesignDocument), rendered by the
-- print engine instead of the template. Used where a template's empty logo slot would leave a
-- blank sample (the sticker template expects the customer's logo).

alter table public.gallery_items add column document jsonb;
alter table public.gallery_items add constraint gallery_items_document_object
  check (document is null or jsonb_typeof(document) = 'object');

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
