-- Universal booking foundation for staff-led services, classes and resources.
-- This migration is additive: existing restaurant tables and reservations remain unchanged.

create extension if not exists btree_gist with schema extensions;

create schema if not exists private;
revoke all on schema private from public;

create table if not exists public.business_memberships (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'staff' check (role in ('owner', 'manager', 'staff')),
  created_at timestamptz not null default now(),
  unique (business_id, user_id)
);

create table if not exists public.services (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  booking_type text not null default 'appointment'
    check (booking_type in ('appointment', 'class', 'course', 'restaurant')),
  duration_minutes integer not null default 60 check (duration_minutes > 0),
  slot_interval_minutes integer not null default 30 check (slot_interval_minutes > 0),
  buffer_before_minutes integer not null default 0 check (buffer_before_minutes >= 0),
  buffer_after_minutes integer not null default 0 check (buffer_after_minutes >= 0),
  capacity integer not null default 1 check (capacity > 0),
  price numeric(12, 2) check (price is null or price >= 0),
  currency text not null default 'MYR',
  is_active boolean not null default true,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, slug)
);

create table if not exists public.staff_members (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  display_name text not null,
  slug text not null,
  bio text,
  photo_url text,
  timezone text not null default 'Asia/Kuala_Lumpur',
  is_active boolean not null default true,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, slug),
  unique (business_id, user_id)
);

create table if not exists public.staff_services (
  staff_id bigint not null references public.staff_members(id) on delete cascade,
  service_id bigint not null references public.services(id) on delete cascade,
  custom_duration_minutes integer check (custom_duration_minutes is null or custom_duration_minutes > 0),
  custom_price numeric(12, 2) check (custom_price is null or custom_price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (staff_id, service_id)
);

create table if not exists public.availability_rules (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  staff_id bigint not null references public.staff_members(id) on delete cascade,
  service_id bigint references public.services(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  valid_from date,
  valid_until date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (end_time > start_time),
  check (valid_until is null or valid_from is null or valid_until >= valid_from)
);

create table if not exists public.availability_exceptions (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  staff_id bigint not null references public.staff_members(id) on delete cascade,
  service_id bigint references public.services(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  exception_type text not null check (exception_type in ('unavailable', 'available')),
  reason text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.resources (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  name text not null,
  slug text not null,
  resource_type text not null default 'other'
    check (resource_type in ('room', 'table', 'equipment', 'space', 'other')),
  capacity integer not null default 1 check (capacity > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, slug)
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  business_id bigint not null references public.businesses(id) on delete restrict,
  service_id bigint not null references public.services(id) on delete restrict,
  staff_id bigint references public.staff_members(id) on delete restrict,
  resource_id bigint references public.resources(id) on delete restrict,
  customer_name text not null,
  customer_email text,
  customer_phone text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  quantity integer not null default 1 check (quantity > 0),
  status text not null default 'confirmed'
    check (status in ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')),
  reference text not null,
  notes text,
  custom_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (business_id, reference)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bookings_prevent_staff_overlap'
      and conrelid = 'public.bookings'::regclass
  ) then
    alter table public.bookings
      add constraint bookings_prevent_staff_overlap
      exclude using gist (
        staff_id with =,
        tstzrange(starts_at, ends_at, '[)') with &&
      )
      where (staff_id is not null and status in ('pending', 'confirmed'));
  end if;
end $$;

create index if not exists business_memberships_user_business_idx
  on public.business_memberships (user_id, business_id);
create index if not exists services_business_active_idx
  on public.services (business_id, is_active, is_published);
create index if not exists staff_members_business_active_idx
  on public.staff_members (business_id, is_active, is_published);
create index if not exists staff_members_user_idx
  on public.staff_members (user_id) where user_id is not null;
create index if not exists staff_services_service_idx
  on public.staff_services (service_id, staff_id) where is_active;
create index if not exists availability_rules_staff_day_idx
  on public.availability_rules (staff_id, day_of_week) where is_active;
create index if not exists availability_rules_service_idx
  on public.availability_rules (service_id) where service_id is not null and is_active;
create index if not exists availability_exceptions_staff_range_idx
  on public.availability_exceptions using gist (staff_id, tstzrange(starts_at, ends_at, '[)'));
create index if not exists resources_business_active_idx
  on public.resources (business_id, is_active);
create index if not exists bookings_business_start_idx
  on public.bookings (business_id, starts_at desc);
create index if not exists bookings_service_start_idx
  on public.bookings (service_id, starts_at) where status in ('pending', 'confirmed');
create index if not exists bookings_staff_start_idx
  on public.bookings (staff_id, starts_at) where staff_id is not null and status in ('pending', 'confirmed');

create or replace function private.has_business_role(
  requested_business_id bigint,
  allowed_roles text[] default array['owner', 'manager', 'staff']::text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_memberships membership
    where membership.business_id = requested_business_id
      and membership.user_id = (select auth.uid())
      and membership.role = any(allowed_roles)
  );
$$;

revoke all on function private.has_business_role(bigint, text[]) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.has_business_role(bigint, text[]) to authenticated;

alter table public.business_memberships enable row level security;
alter table public.services enable row level security;
alter table public.staff_members enable row level security;
alter table public.staff_services enable row level security;
alter table public.availability_rules enable row level security;
alter table public.availability_exceptions enable row level security;
alter table public.resources enable row level security;
alter table public.bookings enable row level security;

create policy "memberships_read_own"
  on public.business_memberships for select to authenticated
  using (user_id = (select auth.uid()));

create policy "services_public_read"
  on public.services for select to anon, authenticated
  using (is_active and is_published);
create policy "services_member_read"
  on public.services for select to authenticated
  using ((select private.has_business_role(business_id)));
create policy "services_manager_insert"
  on public.services for insert to authenticated
  with check ((select private.has_business_role(business_id, array['owner', 'manager']))));
create policy "services_manager_update"
  on public.services for update to authenticated
  using ((select private.has_business_role(business_id, array['owner', 'manager'])))
  with check ((select private.has_business_role(business_id, array['owner', 'manager']))));
create policy "services_manager_delete"
  on public.services for delete to authenticated
  using ((select private.has_business_role(business_id, array['owner', 'manager'])));

create policy "staff_public_read"
  on public.staff_members for select to anon, authenticated
  using (is_active and is_published);
create policy "staff_member_read"
  on public.staff_members for select to authenticated
  using ((select private.has_business_role(business_id)));
create policy "staff_manager_insert"
  on public.staff_members for insert to authenticated
  with check ((select private.has_business_role(business_id, array['owner', 'manager']))));
create policy "staff_manager_update"
  on public.staff_members for update to authenticated
  using ((select private.has_business_role(business_id, array['owner', 'manager'])))
  with check ((select private.has_business_role(business_id, array['owner', 'manager']))));
create policy "staff_manager_delete"
  on public.staff_members for delete to authenticated
  using ((select private.has_business_role(business_id, array['owner', 'manager'])));

create policy "staff_services_public_read"
  on public.staff_services for select to anon, authenticated
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
create policy "staff_services_member_read"
  on public.staff_services for select to authenticated
  using (
    exists (
      select 1 from public.staff_members staff
      where staff.id = staff_id
        and (select private.has_business_role(staff.business_id))
    )
  );
create policy "staff_services_manager_insert"
  on public.staff_services for insert to authenticated
  with check (
    exists (
      select 1 from public.staff_members staff
      join public.services service on service.id = service_id
      where staff.id = staff_id
        and staff.business_id = service.business_id
        and (select private.has_business_role(staff.business_id, array['owner', 'manager']))
    )
  );
create policy "staff_services_manager_update"
  on public.staff_services for update to authenticated
  using (
    exists (
      select 1 from public.staff_members staff
      where staff.id = staff_id
        and (select private.has_business_role(staff.business_id, array['owner', 'manager']))
    )
  )
  with check (
    exists (
      select 1 from public.staff_members staff
      join public.services service on service.id = service_id
      where staff.id = staff_id
        and staff.business_id = service.business_id
        and (select private.has_business_role(staff.business_id, array['owner', 'manager']))
    )
  );
create policy "staff_services_manager_delete"
  on public.staff_services for delete to authenticated
  using (
    exists (
      select 1 from public.staff_members staff
      where staff.id = staff_id
        and (select private.has_business_role(staff.business_id, array['owner', 'manager']))
    )
  );

create policy "availability_rules_member_read"
  on public.availability_rules for select to authenticated
  using ((select private.has_business_role(business_id)));
create policy "availability_rules_manage"
  on public.availability_rules for all to authenticated
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

create policy "availability_exceptions_member_read"
  on public.availability_exceptions for select to authenticated
  using ((select private.has_business_role(business_id)));
create policy "availability_exceptions_manage"
  on public.availability_exceptions for all to authenticated
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

create policy "resources_member_read"
  on public.resources for select to authenticated
  using ((select private.has_business_role(business_id)));
create policy "resources_manager_manage"
  on public.resources for all to authenticated
  using ((select private.has_business_role(business_id, array['owner', 'manager'])))
  with check ((select private.has_business_role(business_id, array['owner', 'manager'])));

create policy "bookings_member_read"
  on public.bookings for select to authenticated
  using (
    (select private.has_business_role(business_id, array['owner', 'manager']))
    or exists (
      select 1 from public.staff_members staff
      where staff.id = staff_id and staff.user_id = (select auth.uid())
    )
  );
create policy "bookings_member_insert"
  on public.bookings for insert to authenticated
  with check ((select private.has_business_role(business_id)));
create policy "bookings_member_update"
  on public.bookings for update to authenticated
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

grant select on public.services, public.staff_members, public.staff_services to anon;
grant select, insert, update, delete on
  public.business_memberships,
  public.services,
  public.staff_members,
  public.staff_services,
  public.availability_rules,
  public.availability_exceptions,
  public.resources,
  public.bookings
to authenticated;
grant usage, select on all sequences in schema public to authenticated;

comment on table public.services is 'Bookable offerings such as appointments, classes, courses and restaurant reservations.';
comment on table public.staff_members is 'People who can deliver one or more services for a business.';
comment on table public.availability_rules is 'Recurring staff-wide or service-specific weekly availability.';
comment on table public.availability_exceptions is 'One-off availability additions and blocked periods such as leave.';
comment on constraint bookings_prevent_staff_overlap on public.bookings is
  'Prevents one staff member from holding overlapping pending or confirmed bookings across every service.';
