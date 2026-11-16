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
- SEO vs Ads uses bounded 500-row pages up to 3,000 source rows per view, and withholds comparisons if counts are incomplete or unverifiable.
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

## 2026-11-16 addendum — definitive external Ads blocker

Read-only production evidence shows historical `google_ads_search_term_daily` rows (625, latest 2026-10-04), 40 failed Google Ads sync runs, last successful sync 2026-10-07, and 34 failures classified by Google as `CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION`. The Google integration connection remains recorded as connected; its production API Cloud project access must be upgraded to Explorer or higher. This is an external authorization gate, not reason to rotate credentials or rebuild ingestion. Existing SalsysOS operational readiness already categorizes the blocker; this POC adds a sanitized provider-health indicator to its SEO vs Ads evidence output, not a new health subsystem. Never return raw errors to Claude. No sync retry or production mutation was executed.

Official reference: https://developers.google.com/google-ads/api/docs/api-policy/access-levels

Tests also cover the allowlisted blocker code and non-disclosure of raw error strings. Ads Search Console windows remain incomparable until paid source health is restored and date alignment is verified.

## Addendum — Claude client-tool mediation contract

- `lib/ai/organic-growth-claude-tool-bridge.ts`: typed Messages API tool input preparation, strict single-tool parser, allowlisted tool_result builder, second independent kill switch. No direct call to Anthropic has been introduced.
- `tests/readiness/organic-growth-claude-tool-bridge.test.cjs`: fail-closed and malformed/unauthorized-tool tests.
- Both `SALSYS_ORGANIC_GROWTH_SKILLS_PILOT=true` and `SALSYS_ORGANIC_GROWTH_CLAUDE_TOOL_BRIDGE_ENABLED=true` are required before an approved application caller could execute the gateway. Both default OFF.
- Provider key and model configuration are intentionally absent from this contract. No user-facing route or UI was created, and no live Claude API request or paid search API call occurred.
- Before any API activation: independent review of output validation, token/cost quota, ownership and tenancy at both invocation and result delivery, consent/data minimization, audit logging and human review.

## Further evidence-quality hardening (2026-11-16)

- SEO vs Ads gateway reads up to 3,000 rows per source in 500-row pages with exact row-count checks, replacing the first-1,000-row sample.
- Content Brief now reports whether matching query and page-result limits truncated the source.
- Deterministic quality gate withholds overlap candidates when counts are truncated/unverifiable, a provider sync failed, or GSC/Ads source data dates are stale/unknown (over seven days).
- Existing 30-day SEO and Ads views do NOT have verified identical date windows. The status remains investigation-only, and the periodAlignmentVerified field is always false.
- Search queries resembling emails or phone numbers are omitted from AI tool evidence; page URLs are stripped of query strings and fragments.
- Both pilot and Claude bridge feature switches remain OFF. These improvements are not substitutes for independent review or signed-in staging tests.
