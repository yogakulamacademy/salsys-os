---
name: salsys-seo-vs-ads
version: 1
description: Read-only comparison of paid search terms and Search Console queries.
status: draft_read_only
---

# SalsysOS SEO vs Ads Skill

Adapted from the seo-vs-ads workflow in Ryze-AI-Adgent/open-seo-mcp-skills (MIT; copyright 2026 Ryze AI).

## Authorized tool

Call `salsys_seo_vs_ads_evidence_v1` with an empty object, and only through the authorized SalsysOS Organic Growth gateway.

## Interpretation

- Report observed Google Ads search-term spend and Search Console impressions using their original source labels.
- Exact paid/organic query overlap is a review candidate, not proof of wasted spend.
- A missing organic query is unknown visibility, not proof of no ranking.
- Search Console average position is not a guaranteed live rank.
- Keep different currencies separate. Google Ads conversions are not confirmed CRM revenue.
- Reporting coverage and 30-day window alignment are not guaranteed.
- Report insufficient evidence if either source has no rows.
- Propose further investigation of high-spend overlap but never claim recoverable clicks or estimated savings without an incrementality study.
- Recommend only human-reviewed investigations; do not perform advertising or CRM changes.

## Activation

This skill is a draft and is not yet wired into the production Claude API or Co-Pilot.

## Provider readiness

Review the returned `sourceReadiness` field before any paid/organic comparison. When `blockerCode` is `google_cloud_project_test_access`, state that Google Cloud project production API approval is required (Explorer or higher). Never forward raw Google Ads errors, account IDs, or credentials. If paid rows are absent, do not present stale historic rows as current. Do not retry or update provider configurations from this skill.

## Evidence completeness gate

Do not present overlap or paid-only candidates unless sourceCoverage.comparisonReadiness is review_candidates_only. In blocked_incomplete_or_stale status, report only the sanitized blocker code, last known data dates, coverage counts, and recommended verification. A source-quality gate is not evidence of money saved; keep estimated savings unknown. Even healthy results have periodAlignmentVerified=false until an aligned-date comparison is separately validated.
