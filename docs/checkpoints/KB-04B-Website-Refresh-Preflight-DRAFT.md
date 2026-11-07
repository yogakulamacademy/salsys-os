# KB-04B — Website Refresh Safety Preflight (DRAFT)

**Date:** November 6, 2026
**Stacked on:** KB-04A, Draft PR #561
**Branch:** `feature/kb04b-refresh-safety-contract`

## Purpose
Provide a deterministic **review-only** diagnostic contract for a future, tenant-controlled source-refresh service. This is not a crawl worker, background job queue, scheduler, consent controller, storage engine or authorization system.

The new `assessWebsiteRefreshPreflight` checks **seven independent conditions**:
1. An exact verified HTTPS page hostname and organization binding.
2. External evidence retention/deletion/consent/staging readiness status.
3. Separate unexpired consent with the explicit `website_change_monitoring` purpose.
4. Approved conservative limits (max 25 pages/run, 100/day, one concurrent job, minimum 60 minutes apart, no cross-origin requests or redirects, robots required).
5. Global/tenant emergency stops, ownership revocation and observed consent withdrawal.
6. Positive robots decision, with a future runtime re-check required.
7. Unexhausted quota, available concurrency and completed cooldown.

**Non-authoritative by design:** All diagnostic fields are caller-supplied snapshots. Passing a diagnostic must never grant a server action. The output hardcodes `canEnqueue=false`, `canCrawl=false`, `canStore=false`, `canSyncKnowledge=false`, `canApprove=false`, `canPublish=false`. No crawl schedule is persisted or activated.

## Admin experience
A new synthetic section beneath the existing /settings/knowledge/evidence-preview demonstrates how an emergency stop, missing monitoring-purpose consent and unknown robots permission block refresh. It shows seven gate explanations and makes no request to knowledge/crawl write APIs. The route retains its preexisting admin access guard.

## Automated acceptance
- `tests/knowledge-extraction/website-refresh-preflight.test.mjs`: synthetic allowed diagnostics, fail-closed missing inputs, tenant/hostname/URL mismatch, consent status/purpose/expiry, stop/withdrawal/robots failure, permissive limits, quota, concurrency, cooldown, deterministic/no-write result.
- `tests/knowledge-ui/knowledge-evidence-review-preview.spec.ts`: read-only admin preview, blocked scheduling, disabled publication and zero knowledge/website writes.
- The CI validation job's existing `tests/knowledge-extraction/*.test.mjs` and `npm run test:knowledge:ui` commands cover the new tests. TypeScript/full Next.js build and the remaining regressions must pass on the **exact branch HEAD** before validation is claimed.

## Remaining real-release gates
- Independently authenticated owner/admin controls and durable consent issuance/withdrawal, including audit.
- Website-ownership verification expiry/revocation with strict per-tenant scope, DNS rebinding/SSRF safeguards and robots re-evaluation on every actual network request.
- Approved retention, erasure, incident stop, at-least-once job safety, leases, quotas and staging database RLS.
- Isolated staging with real-browser visibility checks, provider error/timeout handling, and review of updated evidence.
- Authenticated and audited human approval via the existing knowledge lifecycle, not a second approval system.
- A separate code review and explicit release authorization before merging parents or enabling any live crawling.

## Non-actions
No customer website accessed; no scheduled job or model call; no Supabase/Vercel/production mutation; no evidence storage, knowledge-document approval, messaging, main merge or deployment. All synthetic counts and gates must be displayed as examples only.
