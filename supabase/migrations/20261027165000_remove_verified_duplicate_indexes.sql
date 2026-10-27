begin;

-- PH-0 performance hardening: remove only indexes proven to be exact duplicates.
-- Constraint-backed and actively used equivalents are intentionally preserved.
drop index if exists public.idx_lead_stage_history_lead_time;
drop index if exists public.idx_leads_stage;
drop index if exists public.idx_messages_lead_time;
drop index if exists public.organization_members_org_idx;
drop index if exists public.organization_members_user_idx;
drop index if exists public.organization_members_org_user_unique;
drop index if exists public.organizations_slug_unique;
drop index if exists public.web_sessions_lead_id_idx;
drop index if exists public.uq_whatsapp_crm_message_links_org_message;

commit;
