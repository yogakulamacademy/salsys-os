-- ============================================================
-- 036 - Integration connection subject uniqueness
-- ============================================================

do $$
begin

  if exists (
    select 1
    from public.integration_connections
    where external_account_id is not null
    group by
      organization_id,
      provider,
      external_account_id
    having count(*) > 1
  ) then

    raise exception
      'Cannot enforce integration connection subject uniqueness: duplicate organization/provider/external_account_id rows exist';

  end if;

end;
$$;


create unique index if not exists
integration_connections_org_provider_external_uidx
on public.integration_connections (
  organization_id,
  provider,
  external_account_id
)
where external_account_id is not null;