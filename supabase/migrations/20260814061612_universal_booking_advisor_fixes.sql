-- Advisor follow-up for the universal booking foundation.

create index if not exists availability_rules_business_idx
  on public.availability_rules (business_id);
create index if not exists availability_exceptions_business_idx
  on public.availability_exceptions (business_id);
create index if not exists availability_exceptions_service_idx
  on public.availability_exceptions (service_id) where service_id is not null;
create index if not exists bookings_resource_idx
  on public.bookings (resource_id) where resource_id is not null;

drop policy if exists "services_public_read" on public.services;
drop policy if exists "services_member_read" on public.services;
create policy "services_public_read"
  on public.services for select to anon
  using (is_active and is_published);
create policy "services_authenticated_read"
  on public.services for select to authenticated
  using (
    (is_active and is_published)
    or (select private.has_business_role(business_id))
  );

drop policy if exists "staff_public_read" on public.staff_members;
drop policy if exists "staff_member_read" on public.staff_members;
create policy "staff_public_read"
  on public.staff_members for select to anon
  using (is_active and is_published);
create policy "staff_authenticated_read"
  on public.staff_members for select to authenticated
  using (
    (is_active and is_published)
    or (select private.has_business_role(business_id))
  );

drop policy if exists "staff_services_public_read" on public.staff_services;
drop policy if exists "staff_services_member_read" on public.staff_services;
create policy "staff_services_public_read"
  on public.staff_services for select to anon
  using (
    is_active
    and exists (
      select 1 from public.staff_members staff
      where staff.id = staff_id and staff.is_active and staff.is_published
    )
    and exists (
      select 1 from public.services service
      where service.id = service_id and service.is_active and service.is_published
    )
  );
create policy "staff_services_authenticated_read"
  on public.staff_services for select to authenticated
  using (
    (
      is_active
      and exists (
        select 1 from public.staff_members staff
        where staff.id = staff_id and staff.is_active and staff.is_published
      )
      and exists (
        select 1 from public.services service
        where service.id = service_id and service.is_active and service.is_published
      )
    )
    or exists (
      select 1 from public.staff_members staff
      where staff.id = staff_id
        and (select private.has_business_role(staff.business_id))
    )
  );

drop policy if exists "availability_rules_manage" on public.availability_rules;
create policy "availability_rules_insert"
  on public.availability_rules for insert to authenticated
  with check (
    (select private.has_business_role(business_id, array['owner', 'manager']))
    or exists (
      select 1 from public.staff_members staff
      where staff.id = staff_id and staff.user_id = (select auth.uid())
    )
  );
create policy "availability_rules_update"
  on public.availability_rules for update to authenticated
  using (
    (select private.has_business_role(business_id, array['owner', 'manager']))
    or exists (
      select 1 from public.staff_members staff
      where staff.id = staff_id and staff.user_id = (select auth.uid())
    )
  )
  with check (
    (select private.has_business_role(business_id, array['owner', 'manager']))
    or exists (
      select 1 from public.staff_members staff
      where staff.id = staff_id and staff.user_id = (select auth.uid())
    )
  );
create policy "availability_rules_delete"
  on public.availability_rules for delete to authenticated
  using (
    (select private.has_business_role(business_id, array['owner', 'manager']))
    or exists (
      select 1 from public.staff_members staff
      where staff.id = staff_id and staff.user_id = (select auth.uid())
    )
  );

drop policy if exists "availability_exceptions_manage" on public.availability_exceptions;
create policy "availability_exceptions_insert"
  on public.availability_exceptions for insert to authenticated
  with check (
    (select private.has_business_role(business_id, array['owner', 'manager']))
    or exists (
      select 1 from public.staff_members staff
      where staff.id = staff_id and staff.user_id = (select auth.uid())
    )
  );
create policy "availability_exceptions_update"
  on public.availability_exceptions for update to authenticated
  using (
    (select private.has_business_role(business_id, array['owner', 'manager']))
    or exists (
      select 1 from public.staff_members staff
      where staff.id = staff_id and staff.user_id = (select auth.uid())
    )
  )
  with check (
    (select private.has_business_role(business_id, array['owner', 'manager']))
    or exists (
      select 1 from public.staff_members staff
      where staff.id = staff_id and staff.user_id = (select auth.uid())
    )
  );
create policy "availability_exceptions_delete"
  on public.availability_exceptions for delete to authenticated
  using (
    (select private.has_business_role(business_id, array['owner', 'manager']))
    or exists (
      select 1 from public.staff_members staff
      where staff.id = staff_id and staff.user_id = (select auth.uid())
    )
  );

drop policy if exists "resources_manager_manage" on public.resources;
create policy "resources_manager_insert"
  on public.resources for insert to authenticated
  with check ((select private.has_business_role(business_id, array['owner', 'manager'])));
create policy "resources_manager_update"
  on public.resources for update to authenticated
  using ((select private.has_business_role(business_id, array['owner', 'manager'])))
  with check ((select private.has_business_role(business_id, array['owner', 'manager'])));
create policy "resources_manager_delete"
  on public.resources for delete to authenticated
  using ((select private.has_business_role(business_id, array['owner', 'manager'])));
