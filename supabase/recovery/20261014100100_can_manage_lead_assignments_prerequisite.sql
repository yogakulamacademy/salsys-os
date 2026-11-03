-- Cold-recovery compatibility only.
--
-- can_manage_lead_assignments() existed out-of-band before
-- 20261014100145_unused_authorization_rpc_execute_hardening.sql first recorded
-- it in the production migration ledger. This exact production definition is
-- staged only in ephemeral Migration Replay so the historical hardening step can
-- revoke authenticated EXECUTE and preserve the service-role-only final posture.
-- Never apply this recovery prerequisite to current production.

CREATE OR REPLACE FUNCTION public.can_manage_lead_assignments()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
  select
    auth.role() = 'service_role'
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.role = 'admin'
    );
$function$;
