-- R2 production lead-reliability PRE-RELEASE diagnostic.
-- ONLY for trusted authorized SQL operators; SELECT-only, aggregate-only output.
-- This tests the OLD canonical function hash expected by migration
-- 20261108080000_r2_browser_lead_primary_contact_v1.sql.
-- It is expected to report drift AFTER that migration is installed.
-- Never treat a matching source/ACL/index as backup/restore readiness,
-- a second human code review, real HTTPS E2E, or a GO decision.
-- No row data, UUIDs, contacts, event IDs, source keys or PII are returned.

with
sig as (
  select to_regprocedure(
    'public.ingest_website_lead(text,text,text,text,text,text,text,text,text,date,text,text,text,text,text,text,jsonb,jsonb,jsonb)'
  ) as oid
),
rpc as (
  select
    md5(btrim(replace(
      split_part(split_part(pg_get_functiondef(p.oid),'AS $function$',2),'$function$',1),
      E'\r\n',E'\n'
    ))) as body_md5,
    coalesce(p.prosecdef,false) as security_definer,
    p.proowner::regrole::text as owner_role,
    p.proacl::text as execute_acl,
    array_to_string(p.proconfig,',') as config
  from sig s left join pg_proc p on p.oid=s.oid
),
idx as (
  select count(*)::int = 1 as unique_primary_index_match
  from pg_indexes i
  join pg_class c on c.relname=i.indexname
  join pg_index pi on pi.indexrelid=c.oid
  where i.schemaname='public' and i.tablename='lead_contacts'
    and i.indexname='uq_lead_contacts_one_primary_per_type_v1'
    and pi.indisvalid and pi.indisready
    and i.indexdef='CREATE UNIQUE INDEX uq_lead_contacts_one_primary_per_type_v1 ON public.lead_contacts USING btree (organization_id, lead_id, contact_type) WHERE (is_primary = true)'
),
health as (
  select
    (select count(*)::int from public.lead_ingest_events e
     where e.organization_id=(select id from public.organizations where lower(name)='yogakulam academy')
       and e.received_at>=now()-interval '24 hours') as lead_receipts_24h,
    (select count(*)::int from public.lead_ingest_events e
     where e.organization_id=(select id from public.organizations where lower(name)='yogakulam academy')
       and e.received_at>=now()-interval '24 hours'
       and lower(e.status) in ('failed','error')) as failed_receipts_24h,
    (select count(*)::int from public.identity_resolution_conflicts
     where status='open') as open_identity_conflict_records,
    (select count(*)::int from (
      select organization_id,lead_id,contact_type
      from public.lead_contacts where is_primary is true
      group by 1,2,3 having count(*)>1
    ) d) as duplicate_primary_contact_groups
)
select jsonb_build_object(
 'report','r2_reliability_pre_release_readonly_v1',
 'technical_guard_status',case when
     r.body_md5='309f9d3ea4929e26f6c44f77099559ed'
     and r.security_definer
     and r.owner_role='postgres'
     and r.execute_acl='{postgres=X/postgres,service_role=X/postgres}'
     and r.config='search_path=public'
     and i.unique_primary_index_match
     then 'source_acl_index_match' else 'STOP_source_acl_or_index_drift' end,
 'source_body_md5',r.body_md5,
 'secure_function_owner_acl',
      (r.security_definer and r.owner_role='postgres'
       and r.execute_acl='{postgres=X/postgres,service_role=X/postgres}'
       and r.config='search_path=public'),
 'primary_unique_index_valid',i.unique_primary_index_match,
 'lead_receipts_last_24h',h.lead_receipts_24h,
 'failed_receipts_last_24h',h.failed_receipts_24h,
 'duplicate_primary_contact_groups',h.duplicate_primary_contact_groups,
 'open_identity_conflict_records',h.open_identity_conflict_records,
 'independent_review_verified',false,
 'isolated_live_e2e_verified',false,
 'production_backup_restore_verified',false,
 'production_merge_authorized',false,
 'operator_note','This SELECT cannot attest human signoffs or backup status. Always NO-GO until separately verified.'
) as aggregate_preflight_only
from rpc r cross join idx i cross join health h;
