-- Tracking Contract v1 release gate
-- Converts tracking/privacy/identity invariants into a machine-checkable readiness decision.

create table if not exists public.tracking_contract_releases (
  version text primary key,
  status text not null default 'candidate',
  description text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('candidate','ready','retired'))
);

insert into public.tracking_contract_releases(version,status,description)
values(
  'v1','candidate',
  'Canonical tenant-scoped event ingestion, identity resolution, attribution, privacy gates, retry/replay, retention planning, verified privacy export, and search-erasure tombstones.'
)
on conflict (version) do nothing;

create or replace function public.evaluate_tracking_contract_v1(
  p_organization_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_tracking public.v_tracking_integrity_health_v1%rowtype;
  v_identity public.v_identity_resolution_integrity%rowtype;
  v_attr public.v_lead_attribution_integrity%rowtype;
  v_priv public.v_privacy_compliance_health%rowtype;
  v_ret public.v_privacy_retention_health%rowtype;
  v_erase public.v_privacy_erasure_health%rowtype;
  v_export public.v_privacy_export_health%rowtype;
  v_sources integer:=0;
  v_unsafe_sources integer:=0;
  v_secret_sources_missing_hash integer:=0;
  v_rls_missing integer:=0;
  v_anon_sensitive_exec integer:=0;
  v_auth_sensitive_exec integer:=0;
  v_event_idempotency boolean:=false;
  v_recovery_cron boolean:=false;
  v_retention_cron boolean:=false;
  v_erasure_cron boolean:=false;
  v_tracking_clean boolean:=false;
  v_identity_clean boolean:=false;
  v_attr_clean boolean:=false;
  v_sources_safe boolean:=false;
  v_security_safe boolean:=false;
  v_crons_safe boolean:=false;
  v_privacy_ready boolean:=false;
  v_ready boolean:=false;
begin
  if not exists(select 1 from public.organizations where id=p_organization_id) then
    return jsonb_build_object('ok',false,'reason','organization_not_found');
  end if;

  select * into v_tracking from public.v_tracking_integrity_health_v1 where organization_id=p_organization_id;
  select * into v_identity from public.v_identity_resolution_integrity where organization_id=p_organization_id;
  select * into v_attr from public.v_lead_attribution_integrity where organization_id=p_organization_id;
  select * into v_priv from public.v_privacy_compliance_health where organization_id=p_organization_id;
  select * into v_ret from public.v_privacy_retention_health where organization_id=p_organization_id;
  select * into v_erase from public.v_privacy_erasure_health where organization_id=p_organization_id;
  select * into v_export from public.v_privacy_export_health where organization_id=p_organization_id;

  select count(*) into v_sources
  from public.tracking_sources s
  where s.organization_id=p_organization_id and s.status='active';

  select count(*) into v_unsafe_sources
  from public.tracking_sources s
  where s.organization_id=p_organization_id and s.status='active'
    and (
      s.privacy_mode<>'strict'
      or not s.honor_gpc
      or not s.require_consent_for_optional
      or s.auth_mode not in ('origin','secret','hmac','internal')
    );

  select count(*) into v_secret_sources_missing_hash
  from public.tracking_sources s
  where s.organization_id=p_organization_id and s.status='active'
    and s.auth_mode='secret' and nullif(btrim(coalesce(s.secret_hash,'')),'') is null;

  select count(*) into v_rls_missing
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relname in (
      'tracking_sources','raw_events','raw_event_processing','web_sessions','persons','person_identifiers','person_leads','person_sessions',
      'privacy_consent_receipts','privacy_preferences','privacy_data_subject_requests','privacy_subject_restrictions',
      'privacy_verification_challenges','privacy_export_runs','privacy_retention_actions','privacy_erasure_jobs','privacy_erasure_plan_items','privacy_search_tombstones'
    )
    and not c.relrowsecurity;

  select count(*) into v_anon_sensitive_exec
  from (values
    ('ingest_tracking_event_v1'),
    ('process_tracking_raw_event_v1'),
    ('build_privacy_export_v1'),
    ('create_privacy_verification_challenge_v1'),
    ('verify_privacy_challenge_v1'),
    ('plan_privacy_erasure_v1')
  ) f(name)
  where exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=f.name
      and has_function_privilege('anon',p.oid,'EXECUTE')
  );

  select count(*) into v_auth_sensitive_exec
  from (values
    ('ingest_tracking_event_v1'),
    ('process_tracking_raw_event_v1'),
    ('build_privacy_export_v1'),
    ('create_privacy_verification_challenge_v1'),
    ('verify_privacy_challenge_v1'),
    ('plan_privacy_erasure_v1')
  ) f(name)
  where exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=f.name
      and has_function_privilege('authenticated',p.oid,'EXECUTE')
  );

  select exists(
    select 1 from pg_indexes i
    where i.schemaname='public' and i.tablename='raw_events'
      and i.indexdef ilike 'create unique index%'
      and i.indexdef ilike '%organization_id%'
      and i.indexdef ilike '%source_system%'
      and i.indexdef ilike '%source_event_id%'
  ) into v_event_idempotency;

  if exists(select 1 from pg_extension where extname='pg_cron') then
    select exists(select 1 from cron.job where jobname='salsys-tracking-autonomous-recovery-v1' and active) into v_recovery_cron;
    select exists(select 1 from cron.job where jobname='salsys-privacy-retention-v1' and active) into v_retention_cron;
    select exists(select 1 from cron.job where jobname='salsys-privacy-erasure-planner-v1' and active) into v_erasure_cron;
  else
    v_recovery_cron:=false;
    v_retention_cron:=false;
    v_erasure_cron:=false;
  end if;

  v_tracking_clean:=coalesce(v_tracking.dead_letter_total,0)=0
    and coalesce(v_tracking.retry_due,0)=0
    and coalesce(v_tracking.unclassified_events,0)=0
    and coalesce(v_tracking.quarantined_events,0)=0
    and coalesce(v_tracking.leads_without_creation_channel,0)=0
    and coalesce(v_tracking.leads_without_contacts,0)=0
    and coalesce(v_tracking.failed_lead_ingest_events,0)=0
    and coalesce(v_tracking.broken_session_lead_links,0)=0;

  v_identity_clean:=coalesce(v_identity.leads_without_person,0)=0
    and coalesce(v_identity.person_link_tenant_mismatches,0)=0
    and coalesce(v_identity.identifier_tenant_mismatches,0)=0
    and coalesce(v_identity.session_tenant_mismatches,0)=0
    and coalesce(v_identity.open_conflicts,0)=0;

  v_attr_clean:=coalesce(v_attr.leads_without_attribution,0)=0
    and coalesce(v_attr.acquisition_lock_without_creation_touch,0)=0
    and coalesce(v_attr.conversion_lock_without_conversion_touch,0)=0
    and coalesce(v_attr.tenant_mismatches,0)=0
    and coalesce(v_attr.converted_without_lock,0)=0
    and coalesce(v_attr.acquisition_state_without_lock,0)=0;

  v_sources_safe:=v_unsafe_sources=0 and v_secret_sources_missing_hash=0;
  v_security_safe:=v_rls_missing=0 and v_anon_sensitive_exec=0 and v_auth_sensitive_exec=0 and v_event_idempotency;
  v_crons_safe:=v_recovery_cron and v_retention_cron and v_erasure_cron;
  v_privacy_ready:=coalesce(v_priv.active_sources_not_honoring_gpc,0)=0
    and coalesce(v_priv.overdue_subject_requests,0)=0
    and coalesce(v_ret.failed_actions,0)=0;

  v_ready:=v_tracking_clean and v_identity_clean and v_attr_clean and v_sources_safe and v_security_safe and v_crons_safe and v_privacy_ready;

  return jsonb_build_object(
    'ok',true,
    'contract_version','v1',
    'organization_id',p_organization_id,
    'ready_for_external_ingestion',v_ready,
    'ready_for_opensearch_indexing',v_ready,
    'checks',jsonb_build_object(
      'tracking_integrity_clean',v_tracking_clean,
      'identity_integrity_clean',v_identity_clean,
      'attribution_integrity_clean',v_attr_clean,
      'tracking_sources_safe',v_sources_safe,
      'security_boundary_safe',v_security_safe,
      'required_crons_active',v_crons_safe,
      'privacy_controls_healthy',v_privacy_ready,
      'event_idempotency_enforced',v_event_idempotency,
      'rls_missing_tables',v_rls_missing,
      'anon_sensitive_exec_grants',v_anon_sensitive_exec,
      'authenticated_sensitive_exec_grants',v_auth_sensitive_exec,
      'unsafe_active_sources',v_unsafe_sources,
      'secret_sources_missing_hash',v_secret_sources_missing_hash,
      'active_tracking_sources',v_sources,
      'recovery_cron_active',v_recovery_cron,
      'retention_cron_active',v_retention_cron,
      'erasure_planner_cron_active',v_erasure_cron,
      'retention_execution_enabled',coalesce(v_ret.execution_enabled,false),
      'retention_dry_run',coalesce(v_ret.dry_run,true),
      'erasure_execution_enabled',coalesce(v_erase.execution_enabled,false),
      'erasure_dry_run',coalesce(v_erase.dry_run,true),
      'privacy_exports_waiting_verification',coalesce(v_export.awaiting_verification,0),
      'privacy_verified_exports_pending',coalesce(v_export.verified_export_pending,0)
    ),
    'checked_at',now()
  );
end;
$$;

create or replace view public.v_tracking_contract_v1_readiness with (security_invoker=true) as
select o.id organization_id,
       public.evaluate_tracking_contract_v1(o.id) readiness
from public.organizations o;

revoke all on function public.evaluate_tracking_contract_v1(uuid) from public,anon,authenticated;
grant execute on function public.evaluate_tracking_contract_v1(uuid) to service_role;
