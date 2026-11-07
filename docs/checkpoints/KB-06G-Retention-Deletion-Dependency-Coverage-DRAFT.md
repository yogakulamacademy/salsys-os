# KB-06G — Knowledge Retention and Deletion Dependency Coverage (DRAFT)

**Date:** 2026-11-07  
**Parent:** KB-06F draft PR #595; all Knowledge Builder PRs and SQL remain draft/unmerged/unapplied.  
**Purpose:** Make a previously opaque deletion/retention blocker an explicit, source-verified engineering inventory **without authorizing destructive operations**.

## Verified schema facts

The schema inventory `lib/knowledge-extraction/retention-deletion-coverage.mjs` covers **12 actual database surfaces** declared across the existing `20261016171500_organization_knowledge_v1.sql` migration and the still-unapplied KB-01B/06A/06B/06C/06E draft SQLs:

| Table | Data kind | Existing deletion coverage |
| --- | --- | --- |
| `knowledge_sources` | Tenant source URI/metadata | No KB-specific expiry/erasure implementation |
| `knowledge_documents` | Versioned, approved/draft full-text documents | No KB-specific expiry/erasure implementation |
| `knowledge_chunks` | Derived full-text/search chunks | No KB-specific expiry/erasure implementation |
| `knowledge_approvals` | Human approval history and notes | No reviewed audit retention/erasure policy |
| `knowledge_discovery_domain_verifications` | Exact-host proof and timestamps | Not targeted by KB-06C |
| `knowledge_discovery_jobs` | Discovery job metadata | **KB-06C draft only**, scoped after withdrawal |
| `knowledge_discovery_pages` | Discovery URL/title/status metadata | **KB-06C draft only**, scoped after withdrawal |
| `knowledge_discovery_site_consents` | Purpose-specific consent state | Retained by KB-06C, retention policy needed |
| `knowledge_discovery_consent_control` | Global operator registry | Global policy/version retention decision needed |
| `knowledge_discovery_consent_audit` | Append-only grant/withdrawal events | Retained by KB-06C, independent audit retention required |
| `knowledge_discovery_metadata_erasure_audit` | Append-only exact-host metadata deletion events | Retained by KB-06C, independent audit retention required |
| `knowledge_discovery_policy_documents` | Immutable operator policy notice text | Independent version and retention governance required |

**Only 2 of the 12** have any deletion mechanism specifically drafted within this KB stack, and that mechanism only covers discovery job/page metadata after audited consent withdrawal. **This is not 2/12 production acceptance or 2/12 retention completeness.** Production database application, real staging proof and approved retention duration remain absent.

### Foreign-key dependency hazards verified from exact SQL

1. Deleting `knowledge_documents` automatically cascades to `knowledge_chunks`. Removing source text requires independent verification of search indexes/derived copies, not only the parent row.
2. **Deleting `knowledge_documents` also cascades to `knowledge_approvals`**. That can erase human reviewer notes and approval history, conflicting with potential audit requirements; an independent policy/architecture decision is required before authorizing deletion.
3. `knowledge_sources` deletions are restricted when referenced by documents. Version `supersedes_document_id` relationships likewise restrict some document deletions.
4. Deleting a discovery job cascades to associated pages. KB-06C explicitly deletes only scoped page/job metadata, preserving consent and audits.
5. `knowledge_discovery_site_consents` deletion can cascade to grant/withdrawal audit; a different **RESTRICT** relationship from `knowledge_discovery_metadata_erasure_audit` can prevent that delete. A coherent immutable audit/data rights policy is not optional.

### External data retention is NOT inventoried as deployed behavior

The code flags five **unverified risk categories**, without claiming they are currently deployed or covered: backups/replicas/PITR; logs/traces; model/prompt provider records; caches/indexes/exports; and downstream sent/published copies. Source quotation, source snapshots and browser-derived proposals may exist in later features; **their actual tables/stores must be re-audited before a deletion implementation**.

## Implementation and automated guard

- Pure nonauthorizing `assessKnowledgeRetentionCoverage()` returns a deterministic, frozen blocked report; approved duration is `null`, and all delete/schedule/consent/crawl/publish/merge/deploy flags are `false`.
- `tests/knowledge-extraction/retention-deletion-coverage.test.mjs` parses every SQL file in `supabase/migrations/` and `docs/sql/` for any `CREATE TABLE public.knowledge_*` declaration. Adding a new table without updating this coverage inventory makes CI **fail**.
- Tests cross-check dangerous actual `ON DELETE CASCADE` / `RESTRICT` relationships against source schema, and ensure KB-06C deletion targets **only** `knowledge_discovery_jobs` and `knowledge_discovery_pages`.
- Tests confirm no invented retention days, no accidental authorization, deterministic immutable report and zero network requests. Normal CI's existing knowledge-extraction test glob runs these automatically.

## Decisions required before coding any deletion scheduler

- Independently approve purpose-specific source/quote retention duration, derived-content scope, timeline and data-subject handling. Do not infer a duration from an unrelated app setting.
- Resolve retention versus append-only human approval and consent audit histories, including statutory requirements and evidence minimization.
- Specify per-table transaction order and FK behavior; signed audit reconciliation must survive deletion.
- Independently map storage, caches, backup/restore, exports, downstream messages and provider retention. No claim of full erasure until verified.
- Create an **approved, disposable isolated staging project** and two tenant fixtures; rehearse real Auth/RLS, consent withdrawal, rollback, retention expiry and source/derived-content deletion. Record independent evidence for the 16 KB-04E scenarios (currently **0/16 verified**).

## Non-actions

No production or Recovery Rehearsal SQL, no sample retention policy registered, no deletion/erasure RPC or automation, no test-domain crawl, AI calls, provider activity, live Auth sessions, PR merge or deployment. The draft invents **no legal interpretation or data retention duration**. Keep DRAFT / DO NOT MERGE even if CI is green.
