begin;

alter table public.integration_connections
drop constraint if exists integration_connections_provider_check;

alter table public.integration_connections
add constraint integration_connections_provider_check
check (
  provider = any (
    array[
      'google'::text,
      'meta'::text,
      'whatsapp'::text,
      'instagram'::text,
      'salsys'::text
    ]
  )
);

commit;
