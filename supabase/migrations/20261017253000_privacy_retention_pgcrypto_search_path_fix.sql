-- Fix pgcrypto digest resolution inside the retention executor.
alter function public.execute_privacy_retention_action_v1(uuid,uuid)
  set search_path = public, auth, extensions, pg_temp;
