# AI-01 — SalsysOS AI Architecture and Release Milestones (DRAFT)

**Recorded:** 2026-11-09 IST  
**Integration PR:** [#671](https://github.com/yogakulamacademy/salsys-os/pull/671)  
**Authority:** Engineering inventory / proposed sequencing, not an owner-approved release or paid project.  
**Protected state:** MAIN UNCHANGED, KB STAGING ON HOLD, no hosted SQL, no real crawler/model-provider call, no new production deployment authorized here.

## What is actually built today (on `main`)

- **System prompts:** The server-owned Claude Admissions Reply Co-Pilot has separate router and response system instructions in `app/conversations/copilot-actions.ts`. Staff insight prompts and structured-output/evidence validation live in `app/leads/insights-actions.ts` and `lib/ai/lead-insight-validation.ts`. These prompts are in code; there is no verified versioned, independently approved per-tenant prompt registry.
- **RAG:** `search_organization_knowledge_v1` in `supabase/migrations/20261016182500_fix_organization_knowledge_search_v1.sql` is lexical PostgreSQL full-text retrieval with tenant, approval, validity and active-source predicates. Co-Pilot checks returned evidence and re-retrieves before exposing its draft. This is RAG but not semantic/vector retrieval. Existing SQL can return approved-looking historical content when *only* the source is subsequently flagged unverified; this is the uninstalled KB-16A finding.
- **RBAC + OAuth:** Main has workspace membership/roles and RLS in `supabase/migrations/20261013104212_workspace_rbac_foundation.sql`, per-lead authorization (e.g. `can_work_lead`) and Google/Meta/Instagram OAuth integration flows. Existence in code is not evidence that every external provider or token has been tested end-to-end with real users.
- **Guardrails:** Staff-only human review, evidence provenance validation, financial-claim output screening, tenant authorization, server-owned policies, and AI insight quotas are present in code. They are **not** a substitute for real signed-user acceptance, independent security review or future autonomous-tool safety. The original manual Knowledge approval/Co-Pilot action must remain intact.
- **Model router:** Co-Pilot classifies latest inbound messages with a Claude Haiku path and uses configured Haiku/Sonnet choices, with a conservative fallback. This is not a multi-provider failover gateway.
- **Caching:** Network calls currently use `cache: 'no-store'`. AI usage tables record provider-reported cache-read/cache-creation token counts for lead insights. This is NOT proof of a shared, secure tenant-scoped AI semantic-response cache.
- **MCP:** No verified first-party MCP server/tool registry. Existing application server actions and SQL RPCs are not automatically MCP tools, and MCP is **not required** for the existing Co-Pilot/RAG release.

## Milestone register — thirteen explicit checks, not a percentage of launch

Labels: **MAIN** = code exists on main; **DRAFT** = candidate is only in PR #671 and needs checks/review; **BLOCKED** = independently authorized work not complete; **OPTIONAL** = defer unless evidence establishes benefit.

| ID | Priority | Deliverable and acceptance | Present disposition |
| --- | --- | --- | --- |
| AI-01 | P1 | Separate server-owned router and reply system prompts, with no autonomous sending | MAIN |
| AI-02 | P1 | Approved tenant lexical search, bounded results, validity and last-moment retrieval reconciliation | MAIN |
| AI-03 | P1 | Deterministic knowledge/insight response validation, financial claim guards, RBAC, spend limits | MAIN (scope-specific, not a full safety certification) |
| AI-04 | P1 | Fail Co-Pilot and Knowledge preview **closed before any LLM call** when the canonical RPC returns explicit unverified discovery markers in document/chunk or optional source metadata; preserve manual clean rows | DRAFT / exact-head tests required |
| AI-05 | P1 | Independent security/DBA decision on uninstalled KB-14A publication guard and KB-16A **source-metadata-aware database** retrieval quarantine with tested migration/rollback | DRAFT design, BLOCKED release |
| AI-06 | P1 | Independent privacy decisions and 16 real isolated signed-user staging witnesses | BLOCKED: privacy #613, staging #614, release #601, 0/16 witnessed |
| AI-07 | P2 | Versioned, audited, server-owned prompt registry with immutability and explicit human approval | BLOCKED/NOT BUILT |
| AI-08 | P2 | Scoped per-tenant guidance that cannot override system security, RBAC or legal safety policy | BLOCKED/NOT BUILT |
| AI-09 | P2 | Narrow server-owned tool permission registry (read/list before any mutating commands) with tenant/user/role/action approval and audit | BLOCKED/NOT BUILT |
| AI-10 | P3 | Basic model selection and measured AI insight usage/quota accounting | MAIN (router and usage have separate scopes) |
| AI-11 | P3 | Versioned evaluation suite assessing hallucinations, prompt injection, tenant leakage, cost, router quality and regressions before autonomy | PARTIAL unit tests; governance/human evaluation pending |
| AI-12 | P3 | Optional tenant-scoped cache and/or hybrid vector retrieval if measured usage or quality justifies complexity | OPTIONAL, no shared cache or vector stack required now |
| AI-13 | P4 | Optional MCP bridge only if external agents/interoperability become an explicit product requirement | OPTIONAL / DEFERRED |

**Count at this checkpoint:** four foundational milestones MAIN (AI-01/02/03/10); three partially developed or test/design stage (AI-04/05/11); four required release/product milestones not finished (AI-06/07/08/09); two optional milestones deferred (AI-12/13). These categories describe specific deliverables, not an industry-standard completion percentage and do not imply that any AI feature has passed live independent release acceptance.

## Current KB-17A scoped work — response-level fail-closed evidence hold

The PR #671 `lib/knowledge-evidence.ts` guard checks explicit unverified discovery markers in `metadata.document_metadata`, `metadata.chunk_metadata`, optional `metadata.source_metadata`, and flattened top-level metadata; it also rejects `chunk_metadata.source='manual_discovery_draft_unverified'`. Detection denies **the entire result** to avoid giving a model partially untrusted facts. `tests/readiness/copilot-grounding.test.cjs` tests refusal **before router or drafting provider calls**. `tests/readiness/knowledge-preview.test.cjs` proves the original Knowledge preview cannot display marked excerpts, while leaving the original protected `app/settings/knowledge/actions.ts` unchanged.

**Hard limit:** the canonical currently deployed retrieval RPC does NOT return `knowledge_sources.metadata`. Consequently this response-level guard cannot see a historical source-only marker and cannot replace the reviewed DB-level KB-16A exclusion. Even with this guard green, historical provenance, existing generic approval bypass, consent withdrawal/erasure, RLS and caches still require authoritative DB/DBA/legal decisions. Ordinary unmarked legacy knowledge remains eligible by design until independent policy approves a change.

## Prioritized work from here

1. **Finish P1 without staging:** exact-head test the newly added response guard, inspect source-level KB-16A SQL, obtain independent security/legal/DBA sign-off and actual migrations/rollback. No SQL installed through this draft.
2. **Develop P2 as independent default-OFF modules:** typed prompt-version contract, tenant guidance policy and scoped read-only tool allowlist with synthetic negative tests. Do not wire these into current Co-Pilot or turn on autonomous messaging without separate permission.
3. **P3 selectively:** model-router quality evaluation, provider-request accounting and leakage checks first. Implement caching or vector indexing **only** after measured need, tenant-safe keying, TTL/invalidation, consent and deletion policy.
4. **P4 defer:** an MCP server is unnecessary for a single closed internal Co-Pilot; add only with a defined external consumer, resource allowlist, Auth and permission model and audit.

## Release decisions unchanged

- [PR #671](https://github.com/yogakulamacademy/salsys-os/pull/671) is DRAFT, no independent GitHub approvals; do not merge it with parallel draft #666.
- [#601](https://github.com/yogakulamacademy/salsys-os/issues/601): 0/16 signed real staging tests and required protected merge/production cutover/rollback.
- [#612](https://github.com/yogakulamacademy/salsys-os/issues/612): independent security review, DB/Auth/permission/migration/retrieval safeguards and effective branch protections.
- [#613](https://github.com/yogakulamacademy/salsys-os/issues/613): separate legal/privacy data purpose, consent, deletion/retention decisions for 12 surfaces and five copy/processor categories.
- [#614](https://github.com/yogakulamacademy/salsys-os/issues/614): no funded independent staging until owner separately approves after revenue; Production/Recovery are forbidden as substitute staging.
- The linked Vercel `main` branch has automatic production deployment evidence. Treat merging `main` as a **potential immediate production release**, never as a harmless Git sync. Preserve Co-Pilot/manual approval and R2 mainline history.
