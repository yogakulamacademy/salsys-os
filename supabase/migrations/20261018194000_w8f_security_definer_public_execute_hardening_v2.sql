begin;

-- PostgreSQL function EXECUTE can be inherited through PUBLIC. Revoke PUBLIC as
-- well as browser roles on internal SECURITY DEFINER functions, then preserve
-- the trusted service runtime explicitly.

revoke execute on function public.automation_enrollment_whatsapp_send_approval_trigger_v1() from public, anon, authenticated;
revoke execute on function public.enforce_automation_tenant_alignment_v1() from public, anon, authenticated;
revoke execute on function public.ensure_seo_embedding_settings_v1() from public, anon, authenticated;
revoke execute on function public.ensure_seo_learning_settings_for_organization_v1() from public, anon, authenticated;
revoke execute on function public.reconcile_person_after_contact_change_v1() from public, anon, authenticated;
revoke execute on function public.reconcile_person_after_session_link_v1() from public, anon, authenticated;
revoke execute on function public.search_enqueue_row_trigger_v1() from public, anon, authenticated;
revoke execute on function public.search_privacy_tombstone_trigger_v1() from public, anon, authenticated;
revoke execute on function public.seo_embedding_enqueue_trigger_v1() from public, anon, authenticated;
revoke execute on function public.sync_tracking_consent_to_privacy_v1() from public, anon, authenticated;
revoke execute on function public.sync_tracking_processor_settings_for_org_v1() from public, anon, authenticated;
revoke execute on function public.sync_tracking_source_from_organization_site_v1() from public, anon, authenticated;

revoke execute on function public.consume_tracking_source_rate_limit_v1(uuid,uuid,timestamptz) from public, anon, authenticated;
revoke execute on function public.ingest_external_lead_from_raw_event_v1(uuid,uuid) from public, anon, authenticated;
revoke execute on function public.sweep_tracking_events_v1(integer) from public, anon, authenticated;

grant execute on function public.automation_enrollment_whatsapp_send_approval_trigger_v1() to service_role;
grant execute on function public.enforce_automation_tenant_alignment_v1() to service_role;
grant execute on function public.ensure_seo_embedding_settings_v1() to service_role;
grant execute on function public.ensure_seo_learning_settings_for_organization_v1() to service_role;
grant execute on function public.reconcile_person_after_contact_change_v1() to service_role;
grant execute on function public.reconcile_person_after_session_link_v1() to service_role;
grant execute on function public.search_enqueue_row_trigger_v1() to service_role;
grant execute on function public.search_privacy_tombstone_trigger_v1() to service_role;
grant execute on function public.seo_embedding_enqueue_trigger_v1() to service_role;
grant execute on function public.sync_tracking_consent_to_privacy_v1() to service_role;
grant execute on function public.sync_tracking_processor_settings_for_org_v1() to service_role;
grant execute on function public.sync_tracking_source_from_organization_site_v1() to service_role;

grant execute on function public.consume_tracking_source_rate_limit_v1(uuid,uuid,timestamptz) to service_role;
grant execute on function public.ingest_external_lead_from_raw_event_v1(uuid,uuid) to service_role;
grant execute on function public.sweep_tracking_events_v1(integer) to service_role;

commit;
