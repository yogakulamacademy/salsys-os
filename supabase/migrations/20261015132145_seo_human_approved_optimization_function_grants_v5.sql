-- OG9 v5: explicit function grant hardening.
revoke all on function public.create_seo_optimization_action(uuid,uuid,text,jsonb,text,text,uuid,text) from public, anon;
revoke all on function public.review_seo_optimization_action(uuid,uuid,text,text) from public, anon;
revoke all on function public.transition_seo_optimization_action(uuid,uuid,text,jsonb,jsonb,text) from public, anon;
revoke all on function public.get_seo_optimization_intelligence(uuid) from public, anon;
revoke all on function public.start_seo_experiment_with_baseline(uuid,uuid,integer) from public, anon;

grant execute on function public.create_seo_optimization_action(uuid,uuid,text,jsonb,text,text,uuid,text) to authenticated;
grant execute on function public.review_seo_optimization_action(uuid,uuid,text,text) to authenticated;
grant execute on function public.transition_seo_optimization_action(uuid,uuid,text,jsonb,jsonb,text) to authenticated, service_role;
grant execute on function public.get_seo_optimization_intelligence(uuid) to authenticated, service_role;
grant execute on function public.start_seo_experiment_with_baseline(uuid,uuid,integer) to authenticated, service_role;
