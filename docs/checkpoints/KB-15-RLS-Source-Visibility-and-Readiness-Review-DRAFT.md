# KB-15 — RLS-hidden source fail-closed guard and Knowledge readiness parity

**2026-11-08 • DRAFT ONLY • NO HOSTED SQL • STAGING ON HOLD**

Review: [consolidated draft PR #666](https://github.com/yogakulamacademy/salsys-os/pull/666); [security #612](https://github.com/yogakulamacademy/salsys-os/issues/612); [privacy / DBA #613](https://github.com/yogakulamacademy/salsys-os/issues/613); [release #601](https://github.com/yogakulamacademy/salsys-os/issues/601); [isolated staging #614](https://github.com/yogakulamacademy/salsys-os/issues/614).

## Source-visibility threat model

The disposable KB-14A `SECURITY INVOKER` document trigger looks up `public.knowledge_sources` by tenant and linked source ID to refuse publishing documents marked `discovery_manual_review` or `source_text_verified=false`. Under row-level security, the referenced source row might exist but **not be visible to the invoker**. PostgreSQL's FK integrity is not evidence that this caller can `SELECT` that row. Before KB-15A, an empty `EXISTS` result could be treated as an unmarked/manual source, allowing a forged `approved` document with blank document metadata through a privileged direct document INSERT. The exact conditions depend on the deployed Auth, RLS and table privileges; this finding is about a **local uninstalled prototype**, not a confirmed production exploit.

## KB-15A—local SQL rule and regression

- `docs/sql/KB-14A-unverified-discovery-approval-guard-REHEARSAL-DRAFT.sql` now fails with SQLSTATE `42501` when a document's **new** non-NULL linked source cannot be read under its organization ID. On UPDATE, the **old** linked source must also be visible. Both checks precede marker inspection and status transition.
- `tests/database/knowledge-discovery-atomic-draft.test.mjs` creates a throwaway PostgreSQL `salsys_kb11a_` database, grants temporary authenticated INSERT on documents and SELECT on sources, enables RLS on sources with a **deny-all SELECT policy**, and calls direct authenticated `INSERT ... status='approved'` with blank metadata against a real FK to a discovery-unverified source. The candidate must refuse and leave counts unchanged. It then removes the policy and permissions. This is synthetic; it does not exercise live Supabase tenants.
- KB-10 release preflight and negative tests now reject deleting either new/previous linked-source fail-closed guard. All SQL remains disposable-only and forbidden from `supabase/migrations`.

## KB-15B—UI source-provenance parity

- `app/settings/knowledge/page.tsx` reads source `metadata` along with its document metadata. The Knowledge Library hides the generic Approve button and shows the review hold if **either** document or linked source is explicitly discovery-unverified.
- The loaded-view `Needs review` calculation now includes approved-looking records with unverified document or source markers, and the loaded-view `Eligible knowledge found` count does not treat them as usable approved evidence.
- These are **presentation-level protections only**. The canonical, existing `search_organization_knowledge_v1` and Co-Pilot action are intentionally unchanged; the current retrieval RPC does **not** guarantee that historical already-approved unverified records are screened. Any previously approved such record needs independent incident/data review and a future approved, versioned retrieval guard. Do not assert that the UI's count controls AI retrieval.

## Protected originals and remaining decisions

- The original manual `app/settings/knowledge/actions.ts` remains byte-for-byte the KB-09A protected blob `30a6ac02c91baefaf440fb979bf6cae94dbd031b`. Existing manual approval and Co-Pilot logic stay untouched. The new SQL publication trigger remains **uninstalled**, so a direct existing generic approval RPC cannot be considered protected in production by this draft.
- A security/DBA reviewer must validate actual tenant/source read privileges, function ownership, RLS effects, SECURITY INVOKER vs SECURITY DEFINER, trigger lock sequencing, historic approved records, safe deployment and recovery before choosing an installable migration. Do not copy the disposable trigger into a production migration without that review.
- Legal/privacy must approve collection purpose, source provenance, ownership verification, regrant, consent withdrawal, 12-store and external-copy retention/erasure, and physically late transaction COMMIT semantics. No defaults approved.
- `main` has new R2 changes, including CI differences. Reconcile contributors' work in a reviewed branch procedure; do not merge/force-push to main or discard those changes.

**Engineering acceptance only:** Count this checkpoint green only if its exact final SHA has both the disposable PostgreSQL and application/browser CI jobs SUCCESS and CodeQL SUCCESS. A synthetic pass is not one of the 16 real staging witnesses.

**Release remains:** PR DRAFT/unmerged; 0 independent approval; #601/#612/#613/#614 OPEN; 0/16 real staging witnesses; staging budget/provisioning ON HOLD pending separate post-revenue explicit owner approval. No Production or Recovery used, no live crawling, model/provider calls, hosted SQL, permissions change, deployment, or merge.
