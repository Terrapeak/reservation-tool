-- Qualify outer-row references in relationship policies and constrain bookings.

drop policy if exists "availability_rules_insert" on public.availability_rules;
drop policy if exists "availability_rules_update" on public.availability_rules;
drop policy if exists "availability_exceptions_insert" on public.availability_exceptions;
drop policy if exists "availability_exceptions_update" on public.availability_exceptions;

create policy "availability_rules_insert"
  on public.availability_rules for insert to authenticated
  with check (
    exists (
      select 1 from public.staff_members staff
      where staff.id = availability_rules.staff_id
        and staff.business_id = availability_rules.business_id
        and (
          (select private.has_business_role(availability_rules.business_id, array['owner', 'manager']))
          or staff.user_id = (select auth.uid())
        )
        and (
          availability_rules.service_id is null or exists (
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
  using (
    (select private.has_business_role(availability_rules.business_id, array['owner', 'manager']))
    or exists (
      select 1 from public.staff_members staff
      where staff.id = availability_rules.staff_id and staff.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.staff_members staff
      where staff.id = availability_rules.staff_id
        and staff.business_id = availability_rules.business_id
        and (
          (select private.has_business_role(availability_rules.business_id, array['owner', 'manager']))
          or staff.user_id = (select auth.uid())
        )
        and (
          availability_rules.service_id is null or exists (
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

create policy "availability_exceptions_insert"
  on public.availability_exceptions for insert to authenticated
  with check (
    exists (
      select 1 from public.staff_members staff
      where staff.id = availability_exceptions.staff_id
        and staff.business_id = availability_exceptions.business_id
        and (
          (select private.has_business_role(availability_exceptions.business_id, array['owner', 'manager']))
          or staff.user_id = (select auth.uid())
        )
        and (
          availability_exceptions.service_id is null or exists (
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
  using (
    (select private.has_business_role(availability_exceptions.business_id, array['owner', 'manager']))
    or exists (
      select 1 from public.staff_members staff
      where staff.id = availability_exceptions.staff_id and staff.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.staff_members staff
      where staff.id = availability_exceptions.staff_id
        and staff.business_id = availability_exceptions.business_id
        and (
          (select private.has_business_role(availability_exceptions.business_id, array['owner', 'manager']))
          or staff.user_id = (select auth.uid())
        )
        and (
          availability_exceptions.service_id is null or exists (
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

drop policy if exists "bookings_member_insert" on public.bookings;
drop policy if exists "bookings_member_update" on public.bookings;

create policy "bookings_manager_insert"
  on public.bookings for insert to authenticated
  with check (
    (select private.has_business_role(bookings.business_id, array['owner', 'manager']))
    and exists (
      select 1 from public.services service
      where service.id = bookings.service_id and service.business_id = bookings.business_id
    )
    and (
      bookings.staff_id is null or exists (
        select 1 from public.staff_members staff
        where staff.id = bookings.staff_id and staff.business_id = bookings.business_id
      )
    )
    and (
      bookings.resource_id is null or exists (
        select 1 from public.resources resource
        where resource.id = bookings.resource_id and resource.business_id = bookings.business_id
      )
    )
  );
create policy "bookings_member_update"
  on public.bookings for update to authenticated
  using (
    (select private.has_business_role(bookings.business_id, array['owner', 'manager']))
    or exists (
      select 1 from public.staff_members staff
      where staff.id = bookings.staff_id and staff.user_id = (select auth.uid())
    )
  )
  with check (
    (
      (select private.has_business_role(bookings.business_id, array['owner', 'manager']))
      or exists (
        select 1 from public.staff_members staff
        where staff.id = bookings.staff_id and staff.user_id = (select auth.uid())
      )
    )
    and exists (
      select 1 from public.services service
      where service.id = bookings.service_id and service.business_id = bookings.business_id
    )
    and (
      bookings.staff_id is null or exists (
        select 1 from public.staff_members staff
        where staff.id = bookings.staff_id and staff.business_id = bookings.business_id
      )
    )
    and (
      bookings.resource_id is null or exists (
        select 1 from public.resources resource
        where resource.id = bookings.resource_id and resource.business_id = bookings.business_id
      )
    )
  );

