# KB-16A — Historical Unverified-Source Retrieval Quarantine (DRAFT)

**Date:** 2026-11-09 (IST)  
**Scope:** Synthetic engineering / independent-review candidate **ONLY**  
**Status:** Uninstalled, unmerged, **staging ON HOLD**; no customer, Production, Recovery, hosted SQL or paid resources.

**PR:** [consolidated #666](https://github.com/yogakulamacademy/salsys-os/pull/666)  
**Release/security/legal/staging decisions:** [#601](https://github.com/yogakulamacademy/salsys-os/issues/601) / [#612](https://github.com/yogakulamacademy/salsys-os/issues/612) / [#613](https://github.com/yogakulamacademy/salsys-os/issues/613) / [#614](https://github.com/yogakulamacademy/salsys-os/issues/614)

## Security finding addressed in this experimental candidate

The real existing `public.search_organization_knowledge_v1(uuid,text,integer)` (the canonical migration `supabase/migrations/20261016182500_fix_organization_knowledge_search_v1.sql`) uses tenant membership, approved status, time validity and active-source checks, but does **not** inspect discovery-unverified provenance on `knowledge_documents.metadata`, `knowledge_sources.metadata` or `knowledge_chunks.metadata`. Thus an old approved-looking document whose source later becomes explicitly marked unverified could still be returned. The KB-14A draft publication trigger cannot retroactively revoke a previously approved row just because the source metadata changes. The KB-15 Knowledge Library readiness display does not control actual SQL retrieval.

This is a **synthetic/architectural risk**, not evidence a currently deployed customer document has leaked: the new discovery draft writer and publication guard remain uninstalled.

## Uninstalled KB-16A SQL candidate

`docs/sql/KB-16A-unverified-discovery-retrieval-REHEARSAL-DRAFT.sql` adds one scoped WHERE block to the exact canonical search function, with all other search SQL, rank, function signature, output metadata, grants and tenant controls copied unchanged. The rehearsal guard requires a randomly named `salsys_kb11a_<18 hexadecimal>` disposable local fixture, the synthetic admin table and KB-14A local trigger, and refuses app-like tables. It cannot intentionally run in an ordinary hosted project.

Quarantine is applied **before scoring/order/LIMIT** to reject:

- An approved document whose metadata has `entry_mode=discovery_manual_review`, `manual_review_required=true` or `source_text_verified=false`.
- An active linked source whose metadata has `entry_mode=discovery_manual_review` or `source_text_verified=false`.
- A chunk whose metadata states `source=manual_discovery_draft_unverified`.
- Any non-NULL linked source that does not join to the document's organization (deny unreadable/mismatched association rather than treating it as verified).

Ordinary manual approved sources and **legacy approved NULL-source documents** retain their existing retrieval behavior. That compatibility is a deliberate non-policy decision for the synthetic check; whether legacy items should remain searchable requires its own independent release approval, not a silent change.

## Reproducible tests and exact-mainline preservation

`tests/database/knowledge-discovery-atomic-draft.test.mjs` extends the isolated synthetic schema with the real search function's required columns and a synthetic tenant-member helper, loads the **exact original canonical production search** first, then creates an approved historical document with a clean source, changes that source to `discovery_manual_review`/`source_text_verified=false` *after* approval, and confirms the original RPC returns it. The test installs the **unapproved local candidate only in the disposable database** and confirms it no longer returns the tainted content.

It also proves:
- A normal approved manual document remains searchable, including when a higher-ranked unverified document would have displaced it from the top 1.
- A caller belonging to another tenant and an anonymous caller retain their original denial.
- A chunk explicitly marked as unverified is excluded even when its parent status is approved.
- An approved legacy NULL-source record remains searchable.
- Removing only the new KB-16A predicate block from the candidate yields the **exact unchanged canonical function source**; no unrelated ranking, privilege or output changes.

`scripts/kb10-integrated-review-hold-preflight.mjs` and its negative tests now pin the local DB marker and document/source/chunk filter checks and forbid the experiment's marker or filename in installable migrations.

The existing `app/settings/knowledge/actions.ts` pinned Git blob `30a6ac02c91baefaf440fb979bf6cae94dbd031b`, the canonical search migration, Co-Pilot action, and payments/CRM/R2 runtime code are **not modified**. Mainline still has independent R2 changes requiring reviewed reconciliation before any future merge.

## Limits and independent review before release

- No approved installation or rollback SQL, no historic live data audit and no signed real-user staging evidence. Synthetic tests are not the required 16 witnessed scenarios.
- Security/DBA reviewers must inspect actual Supabase RLS/grants/function owner, cross-tenant search, legacy NULL sources, versioned/expired documents, timing of source invalidation relative to query execution, service_role paths, query performance/ranking/indices, direct knowledge DML, retention/erasure and rollback.
- Legal/privacy must decide when a current or withdrawn consent's content is legally/technically usable, whether an old approved record should be archived, hidden, retained or deleted, and historical copies/caches/backups. The candidate only filters explicit unverified markers; it does **not** infer consent or give privacy guarantees for unmarked content.
- This is NOT evidence that automatic website text retrieval, AI FAQ generation, owner consent or real crawler installation is production-ready.

**Current release disposition:** #601 / #612 / #613 / #614 still open; 0 independent PR approvals; 0 of 16 real staging acceptance witnesses; future staging requires post-revenue cost/approval; no protected merge, deployment or production cutover permitted. Only count this checkpoint engineering-verified after CI (including disposable PostgreSQL and browser validation) and CodeQL all pass on the final exact SHA.
