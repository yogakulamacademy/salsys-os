begin;

-- W8F: trigger functions must not be directly callable by authenticated users.
-- PostgreSQL triggers continue to invoke these functions through the trigger binding;
-- direct RPC execution is unnecessary and expands the privilege surface.
revoke execute on function public.automation_enrollment_whatsapp_send_approval_trigger_v1() from authenticated;
revoke execute on function public.enforce_automation_tenant_alignment_v1() from authenticated;
revoke execute on function public.ensure_seo_embedding_settings_v1() from authenticated;
revoke execute on function public.ensure_seo_learning_settings_for_organization_v1() from authenticated;
revoke execute on function public.reconcile_person_after_contact_change_v1() from authenticated;
revoke execute on function public.reconcile_person_after_session_link_v1() from authenticated;
revoke execute on function public.search_enqueue_row_trigger_v1() from authenticated;
revoke execute on function public.search_privacy_tombstone_trigger_v1() from authenticated;
revoke execute on function public.seo_embedding_enqueue_trigger_v1() from authenticated;
revoke execute on function public.sync_tracking_consent_to_privacy_v1() from authenticated;
revoke execute on function public.sync_tracking_processor_settings_for_org_v1() from authenticated;
revoke execute on function public.sync_tracking_source_from_organization_site_v1() from authenticated;

-- Internal tracking workers mutate cross-cutting processing state and are invoked by
-- trusted service/runtime paths. They are not browser/user RPCs.
revoke execute on function public.consume_tracking_source_rate_limit_v1(uuid,uuid,timestamptz) from authenticated;
revoke execute on function public.ingest_external_lead_from_raw_event_v1(uuid,uuid) from authenticated;
revoke execute on function public.sweep_tracking_events_v1(integer) from authenticated;

commit;
