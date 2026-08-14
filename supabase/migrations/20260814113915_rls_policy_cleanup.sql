-- Avoid duplicate permissive SELECT policies for signed-in users.

drop policy if exists "booking_custom_fields_public_read" on public.booking_custom_fields;
create policy "booking_custom_fields_public_read"
  on public.booking_custom_fields for select to anon
  using (coalesce(is_active, true));

