begin;

-- ============================================================
-- R8 — CONTENT + SEO INTELLIGENCE VIEW SECURITY HARDENING
--
-- Purpose:
--   Ensure every remaining canonical SEO intelligence view
--   executes with the caller's privileges so underlying RLS
--   remains authoritative for tenant isolation.
--
-- Scope is intentionally narrow: no view definitions, data,
-- scores, recommendations, or thresholds are changed.
-- ============================================================

alter view public.v_seo_ai_analysis_candidates
  set (security_invoker = true);

alter view public.v_seo_page_opportunity_engine_v1
  set (security_invoker = true);

alter view public.v_seo_semantic_cannibalization
  set (security_invoker = true);

alter view public.v_seo_semantic_page_coverage
  set (security_invoker = true);

alter view public.v_seo_technical_issues
  set (security_invoker = true);

alter view public.v_seo_topic_authority_v1
  set (security_invoker = true);

commit;
