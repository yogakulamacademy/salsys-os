begin;

drop function if exists public.get_campaigns_workspace_v2(
  uuid,
  text,
  text,
  text,
  text,
  integer,
  integer
);

commit;
