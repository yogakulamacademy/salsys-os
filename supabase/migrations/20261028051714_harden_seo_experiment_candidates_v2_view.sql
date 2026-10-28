alter view public.v_seo_experiment_candidates_v2 set (security_invoker=true);
revoke all on public.v_seo_experiment_candidates_v2 from public, anon, authenticated, service_role;
