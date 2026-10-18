begin;

-- The identity evaluator is an internal resolver. It accepts a lead UUID and,
-- as SECURITY DEFINER, can inspect identity evidence across RLS boundaries.
-- It is invoked by trusted identity-resolution flows and must not be exposed as
-- a browser/user RPC where an arbitrary lead UUID could be supplied.
revoke execute on function public.evaluate_identity_for_lead_v1(uuid,text) from public, anon, authenticated;
grant execute on function public.evaluate_identity_for_lead_v1(uuid,text) to service_role;

commit;
