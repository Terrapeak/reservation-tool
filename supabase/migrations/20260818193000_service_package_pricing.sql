-- Display-oriented package pricing for services. Purchase balances and redemption
-- tracking remain separate future concerns.
alter table public.services
  add column if not exists price_session_count integer not null default 1,
  add column if not exists package_validity_days integer;

alter table public.services
  drop constraint if exists services_price_session_count_check,
  add constraint services_price_session_count_check check (price_session_count >= 1),
  drop constraint if exists services_package_validity_days_check,
  add constraint services_package_validity_days_check
    check (package_validity_days is null or package_validity_days >= 1);

comment on column public.services.price_session_count is
  'Number of sessions covered by the displayed service price. This does not track package redemptions.';
comment on column public.services.package_validity_days is
  'Optional displayed package validity in days. Null means no validity period is advertised.';
