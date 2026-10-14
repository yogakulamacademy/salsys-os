begin;

-- W5D Tenant Isolation: mutable CRM settings are now organization-scoped and
-- the production application calls only the v2 tenant-bound RPCs. The original
-- mutators change global defaults, so signed-in users must no longer be able to
-- invoke them directly across tenants.

revoke execute on function public.update_crm_stage_probability(text, numeric)
  from authenticated;

revoke execute on function public.update_crm_pipeline_aging_rule(text, numeric, numeric)
  from authenticated;

commit;
