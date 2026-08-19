-- Limit availability reads to planners or the linked staff member.
drop policy if exists "availability_rules_member_read" on public.availability_rules;
create policy "availability_rules_member_read"
  on public.availability_rules for select to authenticated
  using (
    (select private.has_business_role(availability_rules.business_id, array['owner', 'manager']))
    or (
      (select private.has_business_role(availability_rules.business_id, array['staff']))
      and exists (
        select 1
        from public.staff_members staff
        where staff.id = availability_rules.staff_id
          and staff.business_id = availability_rules.business_id
          and staff.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "availability_exceptions_member_read" on public.availability_exceptions;
create policy "availability_exceptions_member_read"
  on public.availability_exceptions for select to authenticated
  using (
    (select private.has_business_role(availability_exceptions.business_id, array['owner', 'manager']))
    or (
      (select private.has_business_role(availability_exceptions.business_id, array['staff']))
      and exists (
        select 1
        from public.staff_members staff
        where staff.id = availability_exceptions.staff_id
          and staff.business_id = availability_exceptions.business_id
          and staff.user_id = (select auth.uid())
      )
    )
  );
