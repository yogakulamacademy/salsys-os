alter view public.v_lead_session_journey set (security_invoker=true);
revoke all on public.v_lead_session_journey from anon;
grant select on public.v_lead_session_journey to authenticated, service_role;
