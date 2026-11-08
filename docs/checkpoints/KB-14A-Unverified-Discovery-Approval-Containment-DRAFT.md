# KB-14A — Prevent Unverified Website Discovery Drafts from Escaping into Co-Pilot

**2026-11-08 — draft engineering/security-review handoff. Staging ON HOLD. No production migration or approval.**

Parent [consolidated draft PR #666](https://github.com/yogakulamacademy/salsys-os/pull/666); [release #601](https://github.com/yogakulamacademy/salsys-os/issues/601); [security #612](https://github.com/yogakulamacademy/salsys-os/issues/612); [privacy/DBA #613](https://github.com/yogakulamacademy/salsys-os/issues/613); [post-revenue isolated staging #614](https://github.com/yogakulamacademy/salsys-os/issues/614).

## Verified code-level gap: the existing manual approval RPC is not a discovery review gate

Existing installable `supabase/migrations/20261101063000_ai_knowledge_final_closeout_v1.sql` defines `public.approve_knowledge_document_v1`. After checking ordinary administrator permission, it reads the document's `status, content` and sets `status='approved'`, inserts the generic approval event, and makes its existing chunk eligible for `search_organization_knowledge_v1`. It does **not** read `knowledge_documents.metadata`, `knowledge_sources.metadata`, discovery consent, proof or source quotation provenance. It can therefore approve a `discovery_manual_review` draft created by the prospective KB-11A discovered-page writer despite `source_text_verified=false`. A Next.js-only button restriction is not sufficient because an authenticated user can call the existing RPC directly.

This was a **candidate feature integration gap**. The KB-11A source+draft function remains uninstalled, so do not claim a confirmed live customer incident. Preserve ordinary manual library approval while keeping discovery-derived drafts inert.

## Draft-only mitigation implemented

1. **SQL publication guard prototype** `docs/sql/KB-14A-unverified-discovery-approval-guard-REHEARSAL-DRAFT.sql` is executable ONLY inside the random disposable localhost `salsys_kb11a_` fixture and expressly rejects production, recovery, main and any non-matching DB. A BEFORE INSERT/UPDATE trigger on `knowledge_documents` denies `approved` or `review` states for discovery-unverified documents, whether identified by document metadata or linked source metadata. The same trigger rejects metadata/source/tenant tampering and allows `archived` containment. A BEFORE UPDATE trigger on `knowledge_sources` forbids removing discovery provenance while allowing source status disable. No trigger or function is installed in a hosted database.
2. **Action defense-in-depth** in `app/settings/knowledge/actions.ts` performs a tenant-scoped read of document metadata and fails closed before the existing generic `approve_knowledge_document_v1` call if unverified discovery markers are present. This is a usability/accidental-submission barrier, **not an independently race-safe database authorization boundary**.
3. **Library UI clarity** in `app/settings/knowledge/page.tsx` fetches the draft metadata, removes the generic Approve button for held discovered-page drafts, displays an explicit review-hold explanation, and preserves Archive. Ordinary manual Knowledge actions remain unchanged.
4. **Exact real-RPC local testing** in `tests/database/knowledge-discovery-atomic-draft.test.mjs` loads the actual `approve_knowledge_document_v1` function body extracted from the existing production migration into a throwaway PostgreSQL fixture. Tests verify direct authenticated RPC approval, privileged UPDATE, metadata/source tampering and forged manual-insert attempts are denied; an unrelated genuine manual knowledge draft still approves through the same RPC with its normal audit event; an unverified discovery draft can be archived and its source disabled. This synthetic DB uses stand-in Auth, tenant and knowledge schemas, not real Supabase Auth.
5. `tests/knowledge-discovery/discovery-publication-hold.test.mjs` verifies the independent server-action and UI controls and lack of installable KB-14A migrations. The KB-10 integrated preflight denies any KB-14A trigger/function being promoted into `supabase/migrations` without a reviewed release, and negative preflight tests detect removed hold checks.

## What this does NOT close

- The 2016/2026 existing generic approval RPC is unchanged on the live site; a historical knowledge document already approved via a separate source path still requires independent assessment. A document whose unverified provenance was removed **before** a DB trigger is installed requires separate retrieval isolation and review.
- Future publication of discovered-page content needs signed human review and exact source quotation/evidence/snapshot version, independently reviewed consent revision and withdrawal behavior, source validity at COMMIT, retention/erasure treatment and a reviewed purpose/notice. The current draft **blocks** publication instead of inventing a release-policy bypass.
- PostgreSQL superusers can disable triggers. Database owner/grants, schema/ACL/RLS, actual Supabase Auth/session revocation and direct service_role DML must be independently checked in approved isolated staging.
- No future migration order, rollback, erasure or policy is approved. Reviewer must decide whether a narrower private-schema approval bridge or other design supersedes these triggers without weakening the documented non-publication property.
- Branch is still behind the independent R2 work on `main`, including R2 CI additions. Reconcile without overwriting other contributors, then run all checks at the new head.
- The release is still blocked by #601 **0/16 independently witnessed real signed-user isolated staging tests**, #612 independent security/admin approval, #613 legal/DBA consent/retention/erasure, #614 post-revenue dedicated staging quote + explicit approval, plus reviewed migrations, protected merge, deploy and rollback.

## Engineering verification vs release acceptance

Only count this checkpoint as *engineering-tested* if the **final exact-head** GitHub `financial-database` and `validate` jobs and CodeQL all complete successfully. If any fail, record failure and correct on the same draft branch. Do not mark production-ready from synthetic passes.

**No production/recovery/hosted SQL, no real website crawl, no model calls, no staging procurement, no new feature activation, no main merge, no paid services and no GitHub ruleset change.**
