-- Explicitly remove default service_role privileges inherited from
-- existing Supabase public schema defaults. C5e must be append-only.
-- The initial migration grants SELECT/INSERT, but prior default grants may
-- still include UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER.
revoke all on table public.ai_lead_insight_review_packet_drafts from service_role;
grant select, insert on table public.ai_lead_insight_review_packet_drafts to service_role;
