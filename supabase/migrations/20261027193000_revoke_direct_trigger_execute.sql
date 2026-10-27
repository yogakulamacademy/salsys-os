-- Trigger functions execute through their attached triggers and do not need to be
-- directly callable by authenticated PostgREST/RPC clients.
-- Removing these grants reduces exposed attack surface without disabling triggers.

revoke execute on function public.enforce_lead_objection_signal_tenant_v1() from public, anon, authenticated;
revoke execute on function public.google_ads_set_updated_at() from public, anon, authenticated;
revoke execute on function public.log_new_lead_stage() from public, anon, authenticated;
revoke execute on function public.meta_ads_set_updated_at() from public, anon, authenticated;
revoke execute on function public.promote_paid_payment_to_closed_won_v1() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.sync_course_batch_effective_active() from public, anon, authenticated;
revoke execute on function public.touch_integration_updated_at() from public, anon, authenticated;
