alter table public.tracking_contract_releases enable row level security;

revoke all on table public.tracking_contract_releases from anon, authenticated;

grant select, insert, update, delete
on table public.tracking_contract_releases
to service_role;

comment on table public.tracking_contract_releases is
  'Internal tracking contract release registry. Access is restricted to trusted server/service-role paths; browser roles have no direct privileges.';
