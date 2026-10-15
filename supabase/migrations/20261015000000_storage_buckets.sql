-- Images moved from ImageKit to Supabase Storage. Uploads happen on the server
-- with the service-role key (which bypasses RLS), so no storage policies are
-- needed for writes.
--   catalog          public  — court, product and payment-method images
--   payment-proofs   private — read only through short-lived signed URLs
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('catalog', 'catalog', true, 5242880, array['image/png', 'image/jpeg', 'image/webp']),
  ('payment-proofs', 'payment-proofs', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
