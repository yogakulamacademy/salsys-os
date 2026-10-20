-- WhatsApp RPC execution hardening V1
-- Security-definer helpers introduced for guarded broadcast execution and growth
-- operations are internal server/runtime surfaces. PostgreSQL/Supabase default
-- function privileges can otherwise leave them executable by PUBLIC/authenticated.
-- Keep browser/user authority out of these tenant-ID-bearing RPCs.

revoke execute on function public.evaluate_whatsapp_broadcast_send_policy_v1(uuid,uuid,uuid,timestamptz) from public, anon, authenticated;
revoke execute on function public.prepare_whatsapp_broadcast_provider_send_v1(uuid,uuid,uuid,timestamptz) from public, anon, authenticated;
revoke execute on function public.claim_whatsapp_broadcast_provider_send_v1(uuid,uuid,timestamptz) from public, anon, authenticated;
revoke execute on function public.claim_whatsapp_provider_send_v2(uuid,uuid,timestamptz) from public, anon, authenticated;
revoke execute on function public.refresh_whatsapp_broadcast_campaign_counts_v1(uuid,uuid,timestamptz) from public, anon, authenticated;
revoke execute on function public.rearm_whatsapp_broadcast_provider_send_v1(uuid,uuid,timestamptz) from public, anon, authenticated;

revoke execute on function public.validate_whatsapp_template_bindings_v1(uuid,uuid,jsonb) from public, anon, authenticated;
revoke execute on function public.resolve_whatsapp_binding_value_v1(uuid,uuid,uuid,jsonb) from public, anon, authenticated;
revoke execute on function public.resolve_whatsapp_template_components_for_lead_v1(uuid,uuid,uuid,uuid) from public, anon, authenticated;
revoke execute on function public.assign_whatsapp_campaign_variant_v1(uuid,uuid,uuid) from public, anon, authenticated;
revoke execute on function public.validate_whatsapp_broadcast_campaign_config_v1(uuid,uuid) from public, anon, authenticated;
revoke execute on function public.route_whatsapp_broadcast_reply_v1(uuid,uuid,uuid,uuid) from public, anon, authenticated;

-- Trigger-only helpers do not need direct browser/user execution either.
revoke execute on function public.sync_whatsapp_broadcast_recipient_from_audit_v1() from public, anon, authenticated;
revoke execute on function public.mark_whatsapp_broadcast_reply_v1() from public, anon, authenticated;
revoke execute on function public.enrich_whatsapp_broadcast_provider_audit_v1() from public, anon, authenticated;
revoke execute on function public.enrich_whatsapp_broadcast_message_lineage_v1() from public, anon, authenticated;
revoke execute on function public.prepare_whatsapp_broadcast_recipient_snapshot_v1() from public, anon, authenticated;
revoke execute on function public.guard_whatsapp_campaign_approved_config_v1() from public, anon, authenticated;
revoke execute on function public.guard_whatsapp_campaign_variant_mutation_v1() from public, anon, authenticated;
revoke execute on function public.invalidate_whatsapp_campaign_snapshot_from_variant_v1() from public, anon, authenticated;
revoke execute on function public.guard_whatsapp_recipient_snapshot_lineage_v1() from public, anon, authenticated;
revoke execute on function public.guard_whatsapp_campaign_human_approval_v1() from public, anon, authenticated;

-- Explicitly preserve the server runtime authority needed by the admin/service
-- client. Function owners retain their native privileges independently.
grant execute on function public.evaluate_whatsapp_broadcast_send_policy_v1(uuid,uuid,uuid,timestamptz) to service_role;
grant execute on function public.prepare_whatsapp_broadcast_provider_send_v1(uuid,uuid,uuid,timestamptz) to service_role;
grant execute on function public.claim_whatsapp_broadcast_provider_send_v1(uuid,uuid,timestamptz) to service_role;
grant execute on function public.claim_whatsapp_provider_send_v2(uuid,uuid,timestamptz) to service_role;
grant execute on function public.refresh_whatsapp_broadcast_campaign_counts_v1(uuid,uuid,timestamptz) to service_role;
grant execute on function public.rearm_whatsapp_broadcast_provider_send_v1(uuid,uuid,timestamptz) to service_role;
grant execute on function public.validate_whatsapp_template_bindings_v1(uuid,uuid,jsonb) to service_role;
grant execute on function public.resolve_whatsapp_binding_value_v1(uuid,uuid,uuid,jsonb) to service_role;
grant execute on function public.resolve_whatsapp_template_components_for_lead_v1(uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.assign_whatsapp_campaign_variant_v1(uuid,uuid,uuid) to service_role;
grant execute on function public.validate_whatsapp_broadcast_campaign_config_v1(uuid,uuid) to service_role;
grant execute on function public.route_whatsapp_broadcast_reply_v1(uuid,uuid,uuid,uuid) to service_role;
