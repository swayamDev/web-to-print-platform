-- =============================================================================
-- Storage buckets and policies.
--
--   catalogue   public   product, division, template and gallery images
--   uploads     private  customer artwork, logos and CSV files, in {user_id}/...
--   proofs      private  proof PDFs/PNGs, in {order_id}/v{n}/...; the server
--                        hands owners short-lived signed URLs after an ownership check
--   production  private  print-ready files, in {OrderID}/...; admins only
--
-- Customers have no policy at all on proofs or production: they can only reach a
-- proof through a signed URL the server creates, and can never reach production
-- files (PRD p7 §10, DECISIONS D-10).
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('catalogue', 'catalogue', true, 10485760,
    array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/avif']),
  ('uploads', 'uploads', false, 52428800,
    array[
      'image/png', 'image/jpeg', 'image/svg+xml',
      'application/pdf',
      -- Adobe Illustrator files are sent with inconsistent MIME types by browsers.
      -- The server decides the real format from the file's first bytes (DECISIONS D-20).
      'application/postscript', 'application/illustrator', 'application/octet-stream',
      'text/csv', 'application/vnd.ms-excel', 'text/plain'
    ]),
  ('proofs', 'proofs', false, 52428800,
    array['application/pdf', 'image/png']),
  ('production', 'production', false, 52428800,
    array['application/pdf', 'image/png', 'application/zip'])
on conflict (id) do nothing;

-- catalogue ----------------------------------------------------------------------
create policy "Anyone reads catalogue images"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'catalogue');

create policy "Admins upload catalogue images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'catalogue' and (select public.is_admin()));

create policy "Admins update catalogue images"
  on storage.objects for update to authenticated
  using (bucket_id = 'catalogue' and (select public.is_admin()))
  with check (bucket_id = 'catalogue' and (select public.is_admin()));

create policy "Admins delete catalogue images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'catalogue' and (select public.is_admin()));

-- uploads: each user works only inside their own top-level folder ------------------
create policy "Users upload into own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users read own uploads; admins read all"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'uploads'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.is_admin())
    )
  );

create policy "Users delete own uploads"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- proofs and production: admins may read; all writes come from the service role ----
create policy "Admins read proofs"
  on storage.objects for select to authenticated
  using (bucket_id = 'proofs' and (select public.is_admin()));

create policy "Admins read production files"
  on storage.objects for select to authenticated
  using (bucket_id = 'production' and (select public.is_admin()));
