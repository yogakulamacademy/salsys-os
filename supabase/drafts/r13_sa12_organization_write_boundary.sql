-- DESIGN REHEARSAL ONLY. Not a production migration.
-- Preserve existing RLS; narrow authenticated UPDATE to the business name.
-- Must be rehearsed in a disposable database before generating a migration.
revoke update on table public.organizations from public, anon, authenticated;
revoke update (id, name, slug, status, created_at, updated_at)
  on table public.organizations from public, anon, authenticated;
grant update (name) on table public.organizations to authenticated;
-- Check effective privileges, including inherited roles and PUBLIC.
do $guard$
declare c record;
begin
  if has_table_privilege('authenticated','public.organizations','UPDATE')
     or has_table_privilege('anon','public.organizations','UPDATE') then
    raise exception 'Organization table UPDATE remains available';
  end if;
  for c in select attname from pg_attribute
    where attrelid='public.organizations'::regclass and attnum>0 and not attisdropped
  loop
    if has_column_privilege('anon','public.organizations',c.attname,'UPDATE')
       or has_column_privilege('authenticated','public.organizations',c.attname,'UPDATE') is distinct from (c.attname='name') then
      raise exception 'Unexpected effective organization UPDATE privilege: %', c.attname;
    end if;
  end loop;
end;
$guard$;
