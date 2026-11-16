-- Fix: RLS policies called public.session_is_bound_to_organization(uuid)
-- directly, but EXECUTE on that helper was revoked from `authenticated` on
-- 2026-10-14 (internal_authorization_helper_execute_hardening). Policy
-- expressions run with the caller's privileges, so every signed-in read of
-- these tables failed with "permission denied for function
-- session_is_bound_to_organization". Visible effects in production:
--   * /api/workspace 500 -> capability navigation fails closed (Admissions,
--     Operations and Batches links hidden)
--   * Home "Recommended actions" never load
--   * lead objection signals unreadable/unwritable
--
-- public.is_organization_member(uuid) is SECURITY DEFINER, executable by
-- `authenticated`, and already requires session_is_bound_to_organization()
-- AND active membership. Replacing the direct helper call with it keeps the
-- session-binding guarantee (and adds membership where it was implicit),
-- without re-granting EXECUTE on the internal helper.
--
-- Also fixes a tautology in lead_objection_signals insert/update checks:
-- `l.organization_id = l.organization_id` -> compare to the row's tenant.

begin;

alter policy organization_capabilities_member_select
  on public.organization_capabilities
  using (public.is_organization_member(organization_id));

alter policy system_intelligence_learning_profiles_select
  on public.system_intelligence_learning_profiles
  using (public.is_organization_member(organization_id));

alter policy system_intelligence_outcome_runs_select
  on public.system_intelligence_outcome_runs
  using (public.is_organization_member(organization_id));

alter policy system_intelligence_recommendation_events_select
  on public.system_intelligence_recommendation_events
  using (public.is_organization_member(organization_id));

alter policy system_intelligence_recommendation_signal_state_select
  on public.system_intelligence_recommendation_signal_state
  using (public.is_organization_member(organization_id));

alter policy system_intelligence_recommendations_select
  on public.system_intelligence_recommendations
  using (public.is_organization_member(organization_id));

alter policy lead_objection_signals_read_v1
  on public.lead_objection_signals
  using (
    public.is_organization_member(organization_id)
    and public.can_access_lead(lead_id)
  );

alter policy lead_objection_signals_insert_v1
  on public.lead_objection_signals
  with check (
    public.is_organization_member(organization_id)
    and public.can_write_organization_crm(organization_id)
    and public.can_access_lead(lead_id)
    and exists (
      select 1
      from public.leads l
      where l.id = lead_objection_signals.lead_id
        and l.organization_id = lead_objection_signals.organization_id
    )
    and (created_by is null or created_by = (select auth.uid()))
  );

alter policy lead_objection_signals_update_v1
  on public.lead_objection_signals
  using (
    public.is_organization_member(organization_id)
    and public.can_write_organization_crm(organization_id)
    and public.can_access_lead(lead_id)
  )
  with check (
    public.is_organization_member(organization_id)
    and public.can_write_organization_crm(organization_id)
    and public.can_access_lead(lead_id)
    and exists (
      select 1
      from public.leads l
      where l.id = lead_objection_signals.lead_id
        and l.organization_id = lead_objection_signals.organization_id
    )
  );

-- Guard: no policy in public may call the revoked helper directly again.
do $$
declare
  offending text;
begin
  select string_agg(c.relname || '.' || p.polname, ', ')
    into offending
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  where c.relnamespace = 'public'::regnamespace
    and (
      coalesce(pg_get_expr(p.polqual, p.polrelid), '') like '%session_is_bound_to_organization%'
      or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') like '%session_is_bound_to_organization%'
    );
  if offending is not null then
    raise exception 'Policies still call session_is_bound_to_organization directly: %', offending;
  end if;
end
$$;

commit;
