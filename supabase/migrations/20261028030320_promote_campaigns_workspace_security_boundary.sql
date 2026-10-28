begin;

alter function public.get_campaigns_workspace(
  uuid,
  text,
  text,
  text,
  text,
  integer,
  integer
)
security definer;

comment on function public.get_campaigns_workspace(
  uuid,
  text,
  text,
  text,
  text,
  integer,
  integer
) is
  'Returns Campaigns workspace data for one explicitly authorized organization. SECURITY DEFINER is used only after the function validates the caller session with is_organization_member(); fixed search_path and restricted EXECUTE grants prevent public access while avoiding repeated deep RLS authorization checks.';

commit;
