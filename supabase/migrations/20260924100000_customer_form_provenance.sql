alter table public.booking_custom_fields
  add column if not exists field_source text not null default 'legacy',
  add column if not exists template_key text,
  add column if not exists template_field_key text;

-- Existing non-system rows are intentionally legacy. Ownership is never inferred
-- from labels during this compatibility migration.
update public.booking_custom_fields
set field_source = case when system_key is not null then 'system' else 'legacy' end
where (field_source = 'legacy' and system_key is not null)
   or field_source is null
   or field_source not in ('system', 'template', 'customer', 'legacy');

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'booking_custom_fields_field_source_check'
      and conrelid = 'public.booking_custom_fields'::regclass
  ) then
    alter table public.booking_custom_fields
      add constraint booking_custom_fields_field_source_check
      check (field_source in ('system', 'template', 'customer', 'legacy'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'booking_custom_fields_provenance_shape_check'
      and conrelid = 'public.booking_custom_fields'::regclass
  ) then
    alter table public.booking_custom_fields
      add constraint booking_custom_fields_provenance_shape_check
      check (
        (field_source = 'system'
          and system_key is not null
          and template_key is null
          and template_field_key is null)
        or (field_source = 'template'
          and system_key is null
          and template_key is not null
          and template_field_key is not null)
        or (field_source in ('customer', 'legacy')
          and template_key is null
          and template_field_key is null)
      );
  end if;
end
$$;

create unique index if not exists booking_custom_fields_business_template_identity_key
  on public.booking_custom_fields (business_id, template_key, template_field_key)
  where field_source = 'template';
