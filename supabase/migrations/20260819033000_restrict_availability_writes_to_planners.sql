-- TerraPeak company roles remain authoritative. The session bridge maps owner
-- to owner and both admin/manager to the Reservations compatibility manager
-- role. Staff may read their schedule but may not mutate availability.

drop policy if exists "availability_rules_insert" on public.availability_rules;
drop policy if exists "availability_rules_update" on public.availability_rules;
drop policy if exists "availability_rules_delete" on public.availability_rules;

create policy "availability_rules_insert"
  on public.availability_rules for insert to authenticated
  with check (
    (select private.has_business_role(availability_rules.business_id, array['owner', 'manager']))
    and exists (
      select 1 from public.staff_members staff
      where staff.id = availability_rules.staff_id
        and staff.business_id = availability_rules.business_id
        and (
          availability_rules.service_id is null
          or exists (
            select 1 from public.staff_services assignment
            join public.services service on service.id = assignment.service_id
            where assignment.staff_id = staff.id
              and assignment.service_id = availability_rules.service_id
              and assignment.is_active
              and service.business_id = availability_rules.business_id
          )
        )
    )
  );

create policy "availability_rules_update"
  on public.availability_rules for update to authenticated
  using ((select private.has_business_role(availability_rules.business_id, array['owner', 'manager'])))
  with check (
    (select private.has_business_role(availability_rules.business_id, array['owner', 'manager']))
    and exists (
      select 1 from public.staff_members staff
      where staff.id = availability_rules.staff_id
        and staff.business_id = availability_rules.business_id
        and (
          availability_rules.service_id is null
          or exists (
            select 1 from public.staff_services assignment
            join public.services service on service.id = assignment.service_id
            where assignment.staff_id = staff.id
              and assignment.service_id = availability_rules.service_id
              and assignment.is_active
              and service.business_id = availability_rules.business_id
          )
        )
    )
  );

create policy "availability_rules_delete"
  on public.availability_rules for delete to authenticated
  using ((select private.has_business_role(availability_rules.business_id, array['owner', 'manager'])));

drop policy if exists "availability_exceptions_insert" on public.availability_exceptions;
drop policy if exists "availability_exceptions_update" on public.availability_exceptions;
drop policy if exists "availability_exceptions_delete" on public.availability_exceptions;

create policy "availability_exceptions_insert"
  on public.availability_exceptions for insert to authenticated
  with check (
    (select private.has_business_role(availability_exceptions.business_id, array['owner', 'manager']))
    and exists (
      select 1 from public.staff_members staff
      where staff.id = availability_exceptions.staff_id
        and staff.business_id = availability_exceptions.business_id
        and (
          availability_exceptions.service_id is null
          or exists (
            select 1 from public.staff_services assignment
            join public.services service on service.id = assignment.service_id
            where assignment.staff_id = staff.id
              and assignment.service_id = availability_exceptions.service_id
              and assignment.is_active
              and service.business_id = availability_exceptions.business_id
          )
        )
    )
  );

create policy "availability_exceptions_update"
  on public.availability_exceptions for update to authenticated
  using ((select private.has_business_role(availability_exceptions.business_id, array['owner', 'manager'])))
  with check (
    (select private.has_business_role(availability_exceptions.business_id, array['owner', 'manager']))
    and exists (
      select 1 from public.staff_members staff
      where staff.id = availability_exceptions.staff_id
        and staff.business_id = availability_exceptions.business_id
        and (
          availability_exceptions.service_id is null
          or exists (
            select 1 from public.staff_services assignment
            join public.services service on service.id = assignment.service_id
            where assignment.staff_id = staff.id
              and assignment.service_id = availability_exceptions.service_id
              and assignment.is_active
              and service.business_id = availability_exceptions.business_id
          )
        )
    )
  );

create policy "availability_exceptions_delete"
  on public.availability_exceptions for delete to authenticated
  using ((select private.has_business_role(availability_exceptions.business_id, array['owner', 'manager'])));
