-- Phase 6 finalization: all active management and backend flows use bookings.
-- Keep historical rows read-only; prohibit every future legacy mutation.

create or replace function public.prevent_legacy_reservation_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'The legacy reservations table is read-only; use canonical bookings'
    using errcode = '55000';
end;
$$;

drop trigger if exists prevent_canonical_tenant_legacy_reservation_write on public.reservations;
drop trigger if exists prevent_legacy_reservation_write on public.reservations;
create trigger prevent_legacy_reservation_write
before insert or update or delete on public.reservations
for each row execute function public.prevent_legacy_reservation_write();

drop function if exists public.prevent_canonical_tenant_legacy_reservation_write();

drop policy if exists reservations_manager_insert on public.reservations;
drop policy if exists reservations_manager_update on public.reservations;
drop policy if exists reservations_manager_delete on public.reservations;

revoke insert, update, delete on table public.reservations from public, anon, authenticated;
revoke all on function public.prevent_legacy_reservation_write() from public, anon, authenticated;
grant execute on function public.prevent_legacy_reservation_write() to service_role;

comment on table public.reservations is
  'Read-only historical booking records. All active reads and writes use public.bookings.';
