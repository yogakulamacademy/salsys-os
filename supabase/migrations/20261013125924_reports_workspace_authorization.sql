begin;

-- =============================================================================
-- 056_reports_workspace_authorization.sql
--
-- Moves Team Performance reporting RPC authorization from the legacy global
-- profiles.role = admin check to the functional Reports workspace model.
--
-- IMPORTANT
-- - The reporting query bodies are preserved byte-for-byte as emitted by
--   pg_get_functiondef(). Only the legacy authorization predicate is replaced.
-- - Organization remains the tenant boundary and is still supplied explicitly
--   to each RPC.
-- - Lead assignment remains a separate privileged operation and is NOT
--   broadened by this migration.
-- =============================================================================

do $migration$
declare
  v_signature regprocedure;
  v_definition text;
  v_updated_definition text;
begin
  foreach v_signature in array array[
    'public.get_team_performance_snapshot(uuid,date,date)'::regprocedure,
    'public.get_team_assignment_fairness_snapshot(uuid,date,date)'::regprocedure
  ]
  loop
    select pg_get_functiondef(v_signature::oid)
      into v_definition;

    if v_definition is null then
      raise exception 'Unable to read function definition for %', v_signature;
    end if;

    if position('if not public.is_crm_admin() then' in v_definition) = 0 then
      raise exception
        'Expected legacy CRM-admin authorization gate was not found in %',
        v_signature;
    end if;

    v_updated_definition := replace(
      v_definition,
      'if not public.is_crm_admin() then',
      'if not public.has_workspace_access(p_organization_id, ''reports'') then'
    );

    if v_updated_definition = v_definition then
      raise exception 'Authorization replacement made no change for %', v_signature;
    end if;

    execute v_updated_definition;
  end loop;
end;
$migration$;

-- Keep RPC execution explicit. CREATE OR REPLACE preserves the existing ACL,
-- but these grants document the intended callers and avoid accidental drift.
revoke all on function public.get_team_performance_snapshot(uuid, date, date)
  from public, anon;
revoke all on function public.get_team_assignment_fairness_snapshot(uuid, date, date)
  from public, anon;

grant execute on function public.get_team_performance_snapshot(uuid, date, date)
  to authenticated, service_role;
grant execute on function public.get_team_assignment_fairness_snapshot(uuid, date, date)
  to authenticated, service_role;

comment on function public.get_team_performance_snapshot(uuid, date, date) is
  'Organization-scoped Team Performance report. Requires Reports workspace access.';
comment on function public.get_team_assignment_fairness_snapshot(uuid, date, date) is
  'Organization-scoped assignment-distribution report. Requires Reports workspace access.';

commit;
