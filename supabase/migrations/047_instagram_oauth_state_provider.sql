begin;

alter table public.integration_oauth_states
drop constraint if exists integration_oauth_states_provider_check;

alter table public.integration_oauth_states
add constraint integration_oauth_states_provider_check
check (
  provider = any (
    array[
      'google'::text,
      'meta'::text,
      'whatsapp'::text,
      'instagram'::text
    ]
  )
);

commit;
