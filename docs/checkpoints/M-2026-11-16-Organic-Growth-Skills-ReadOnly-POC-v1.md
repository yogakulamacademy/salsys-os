# SalsysOS Organic Growth Skills — Read-only POC v1

Date: 2026-11-16
Status: Draft only, not released.

## Purpose

Adapt Content Brief and SEO vs Ads workflows from Ryze-AI-Adgent/open-seo-mcp-skills (MIT, copyright 2026 Ryze AI) to read existing SalsysOS evidence. No hosted Ryze connector, no new Google OAuth connection, no DataForSEO billing.

## Files

- lib/ai/organic-growth-skills-core.ts — deterministic evidence processing and Claude tool schemas.
- lib/ai/organic-growth-skills-gateway.ts — authenticated, owner/admin-only, tenant-scoped read gateway.
- ai/skills/salsys-content-brief/SKILL.md — draft Claude skill.
- ai/skills/salsys-seo-vs-ads/SKILL.md — draft Claude skill.
- tests/readiness/organic-growth-skills.test.cjs — synthetic fixture tests.

## Security and release boundary

- SALSYS_ORGANIC_GROWTH_SKILLS_PILOT=true is required; default is off.
- No new route, UI link, scheduled task, Co-Pilot tool registration, provider API call, migration, merge or deployment.
- The current authenticated workspace resolves organization and owner/admin role. Tools cannot accept organization overrides, credentials or arbitrary SQL.
- Queries use the authenticated Supabase client and explicit organization_id predicates, with row limits.
- Tool output is untrusted evidence. A future Claude orchestration integration requires model-usage budgets, full approval controls, output safeguards and production acceptance.
- Staging remains on hold.

## Canonical sources

Content Brief reads v_seo_query_30d and v_seo_keyword_intelligence_30d.
SEO vs Ads reads v_seo_query_30d and v_google_ads_search_term_30d.

## Live read-only source verification (2026-11-16)

- v_seo_query_30d: 1,978 rows, 1 organization.
- v_google_ads_search_term_30d: zero rows.
- Results are aggregate schema/availability evidence, not real signed-in end-to-end acceptance.
- Until paid search terms exist, SEO vs Ads must return insufficient_paid_evidence, not fabricated savings.

## Known limits

- SEO and Ads view date cutoffs are not known to be aligned.
- SEO vs Ads samples up to 1,000 rows per source; it is not an exhaustive audit.
- Content brief filters observed query terms; no live SERP, People Also Ask or external keyword volumes are implied.
- Existing views aggregate by organization, not individual website property.
- No person-level CRM data is read.
- Ads conversions are provider metrics, not CRM settlement; cross-currency spend is never combined.
- Missing GSC terms cannot prove no organic ranking.
- Overlapping paid and organic terms cannot prove ad spend is wasted or quantify incrementality.

## Checks

Run: node --test tests/readiness/organic-growth-skills.test.cjs
Run: npm run typecheck
Run full repository CI and CodeQL in the isolated PR branch.

## Remaining gates

1. Run tests, CI and independent security review.
2. Verify the paid search-term sync produces real, fresh evidence.
3. Align source date windows and site scope before business recommendations.
4. Add Claude orchestration, provider-cost metering and governed tool approval.
5. Perform signed-in cross-tenant staging acceptance only after staging hold is lifted.

No production changes are authorized or claimed in this POC.
