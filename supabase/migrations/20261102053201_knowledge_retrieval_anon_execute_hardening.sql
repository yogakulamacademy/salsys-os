-- Fresh Supabase projects can grant function EXECUTE explicitly to anon through
-- default privileges. Revoking PUBLIC alone does not remove that role grant.
-- Explicitly deny anonymous execution on clean installations.
revoke all on function public.search_organization_knowledge_v1(uuid,text,integer) from public, anon;
grant execute on function public.search_organization_knowledge_v1(uuid,text,integer) to authenticated, service_role;
