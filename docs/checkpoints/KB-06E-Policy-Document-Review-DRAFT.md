# KB-06E — SHA-Bound Read-only Discovery Policy Presentation (DRAFT)

**Status:** Engineering-only, unmerged, unapplied. **Date:** 2026-11-07.  
**Parent:** KB-06D draft PR #590, with current-main integration rehearsal #592 also draft.

## Problem

KB-06B's operator-controlled registry contains only `approved_policy_version`, `approved_policy_sha256`, and `approved_at`. KB-06D correctly prevents granting consent from the UI because **no approved notice text exists to show the owner**. A version/digest is not a readable policy. No legal/privacy text was supplied by the user and none is invented by this checkpoint.

## Implemented: explicit, independently gated and non-authorizing policy preview

1. **SQL only under docs/sql/, unapplied:** `KB-06E-reviewed-policy-document-preview-DRAFT.sql`, dependent on KB-01B/06A/06B/06C. Adds append-only `knowledge_discovery_policy_documents` (global operator-only store) with bounded UTF-8 text, SQL-checked SHA-256 fingerprint, version, plain source reference and record timestamp. **No content or approved version is inserted.** RLS is enabled with no direct authenticated table read/write grants. Direct operator edits/deletes are denied by an immutable trigger.
2. **Narrow read RPC:** `get_knowledge_discovery_policy_preview_v1(p_organization_id uuid)` is `SECURITY DEFINER` with explicit EXECUTE revocation and only `authenticated` execution grant. It first requires KB-06B's strict live `auth.sessions` + exact `tenant_session_bindings` owner/admin actor. Then the operator-registered document version and hash must match the exact existing control registry version and SHA-256, and the text hash must recalculate correctly. Any mismatch/no registry/document returns **unavailable** without policy text. No service-role application read or write is used.
3. **API:** `GET /api/knowledge/discovery/policy` checks real `auth.getUser`, workspace organization and `can_manage_organization`. `KNOWLEDGE_DISCOVERY_POLICY_REVIEW_ENABLED` defaults **OFF**, avoiding reference to unapplied SQL. When ON in separately approved isolated staging, the API calls the scoped RPC with caller-bound Supabase Auth, validates bounded payload plus SHA-256 in Node, and returns read-only text. No POST/DELETE implementation exists.
4. **UI:** The existing owner/admin discovery-consent page now presents the exact registered policy as escaped plain text with version, hex fingerprint, source reference, record timestamps and clear caveats. It distinguishes disabled, not registered/hash mismatch, unauthorized/unavailable and verified document states. It **never** displays a simulated policy as an actual approval, saves an acknowledgement, activates grants or calls erasure.
5. **Synthetic negative tests:** Exact SQL disposable PostgreSQL for mismatch/digest, session binding, tenant isolation, immutable storage; API disabled/non-admin/denied/malformed/digest mismatch; browser disabled/registered/unavailable/error/mobile and no mutation behavior.

## Safety and legal trust boundary

An operator's `source_reference` and `approved_at` are **administrative claims**, not independently verified legal review evidence. Matching bytes and registry fingerprints prove text integrity **only**, not consent adequacy, purpose-specific disclosures, user comprehension, data-rights handling, or legal compliance. An approved source document and responsible reviewers must still independently sign off. **Do not set the registry, enable consent grant, or register a production policy merely to make tests pass.**

No actual legal policy wording, expiration/retention duration, tenant-scoped legal configuration, automatic storage/deletion, or rights handling is implemented. KB-06C erases discovery job/page metadata only after withdrawal, not source quotes or other derived data. Real staging remains absent, and **0/16 KB-04E independently witnessed acceptance scenarios** are complete. The older KB-05D/05F guarded staging workflow is not run.

## Non-actions and validation

No change to Supabase Production or Recovery Rehearsal, Vercel, GitHub main, live websites, real consent records, providers, customer messages, or knowledge publishing. All flags default off, SQL draft unapplied. This branch/PR must remain DRAFT and unmerged, even after CI.

**Engineering acceptance:** full exact-head CI: database SQL in disposable local PostgreSQL, TypeScript, Next.js build, Knowledge Builder UI, shared CRM and financial browser regressions. Record verified run and head after completion, without promoting staging scenarios to passed.
