-- Retire only the reviewed foreign-template Customer Form leftovers for Terrapeak.
-- This migration is intentionally explicit and does not reclassify or delete rows.

do $$
declare
  target_ids bigint[] := array[278,279,280,281,282,283,284,285,286,287,288,289,290]::bigint[];
  matching_count integer;
  updated_count integer;
  total_count integer;
  active_count integer;
  inactive_count integer;
begin
  select count(*) into total_count
  from public.booking_custom_fields
  where business_id = 10;

  select count(*) into active_count
  from public.booking_custom_fields
  where business_id = 10 and is_active;

  select count(*) into inactive_count
  from public.booking_custom_fields
  where business_id = 10 and not is_active;

  if total_count <> 31 or active_count <> 23 or inactive_count <> 8 then
    raise exception 'Terrapeak Customer Form count precondition failed';
  end if;

  select count(*) into matching_count
  from public.booking_custom_fields
  where business_id = 10
    and id = any(target_ids)
    and is_active
    and field_source = 'legacy';

  if matching_count <> 13 then
    raise exception 'Terrapeak reconciliation target precondition failed';
  end if;

  update public.booking_custom_fields
  set is_active = false
  where business_id = 10
    and id = any(target_ids)
    and is_active
    and field_source = 'legacy';

  get diagnostics updated_count = row_count;
  if updated_count <> 13 then
    raise exception 'Terrapeak reconciliation updated an unexpected number of rows';
  end if;

  if (select count(*) from public.booking_custom_fields where business_id = 10 and id = any(target_ids)) <> 13
     or (select count(*) from public.booking_custom_fields where business_id = 10 and id = any(target_ids) and not is_active) <> 13
     or (select count(*) from public.booking_custom_fields where business_id = 10 and id = any(target_ids) and field_source <> 'legacy') <> 0
  then
    raise exception 'Terrapeak reconciliation postcondition failed';
  end if;

  if (select count(*) from public.booking_custom_fields where business_id = 10) <> 31
     or (select count(*) from public.booking_custom_fields where business_id = 10 and is_active) <> 10
     or (select count(*) from public.booking_custom_fields where business_id = 10 and not is_active) <> 21
  then
    raise exception 'Terrapeak Customer Form post-count precondition failed';
  end if;
end
$$;
