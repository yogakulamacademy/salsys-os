begin;

-- W8 Security/QA: remove mutable search_path from the remaining helper functions
-- reported by the Supabase security advisor. These helpers do not require any
-- caller-specific schema lookup, so a fixed pg_catalog/public path is sufficient.

alter function public.campaign_workspace_json_text(jsonb, text[])
  set search_path = pg_catalog, public;

alter function public.campaign_workspace_json_numeric(jsonb, text[])
  set search_path = pg_catalog, public;

alter function public.touch_integration_updated_at()
  set search_path = pg_catalog, public;

commit;
