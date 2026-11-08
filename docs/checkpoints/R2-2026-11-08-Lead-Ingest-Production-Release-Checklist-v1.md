# R2 — Browser lead reliability: controlled production release checklist

Date: 2026-11-08  
Status: **AWAITING INDEPENDENT REVIEW AND ISOLATED E2E ACCEPTANCE — NOT DEPLOYED**  
Release scope: **ONLY** R2 #620 `40P01` bounded retry and #643 `23505` contact-primary repair.  
Current merged baseline: `main` / `crm.salsysos.com` READY at `8a2bc7100ec1ee3df728577e459be09c9dff454f` (includes #663, #665 and the research/documentation-only merges #535 and #669). PR #667 was refreshed by a non-forced, fast-forward two-parent merge commit `ba61b8d68779b5033f2ca6f3037739b4115dc935` that preserves all original 15 candidate file blobs. New CI, security and clean migration replay must pass on the final exact head. The earlier draft #659 was based on `691dc441...` and must not be merged in parallel.

The product owner asked to proceed with the R2 production release, but also explicitly postponed creating/approving dedicated staging infrastructure until revenue. This document records the safe parts of a **production release preflight**. Approval to pursue a release does not prove independent privacy, tenant, ingestion, or rollback acceptance. Do not force a merge, directly change live SQL, or use production lead forms as test fixtures while the gates below remain unmet.

## Included — two unrelated, narrow fixes

1. `app/api/leads/browser/v1/route.ts` from #623: exactly one 35ms-delay retry ONLY for failed `ingest_website_lead_for_organization` RPC returning PostgreSQL `40P01`, using the exact same external event ID. No retry for `23505`, other SQL, permissions, network transport, website enrollment, payments or customer messaging. The retry helper and isolated real concurrency fixture accompany it.
2. `supabase/migrations/20261108080000_r2_browser_lead_primary_contact_v1.sql` from #648: guarded `CREATE OR REPLACE FUNCTION public.ingest_website_lead` changes exactly two `is_primary` assignments. Existing matched lead row locking, security definer, owner, search path and grants are preserved. Preserve current primary; add a second normalized email/phone as secondary when justified, without silent identity merge. Strict old function body MD5 `309f9d3ea4929e26f6c44f77099559ed` and ACL check abort on production drift.
3. Exact source tests and rollback-only synthetic full-RPC trigger checks; CI + CodeQL + clean local migration replay on **this release candidate**.

**Explicitly excluded:** #530 consent SDK patch, #535 synthetic retention definitions, #638 Behavior Explorer changes, #641/#657 41-file mixed rehearsal, R13 billing, new tracking source/collector settings, identity merges, website PHP booking/enrollment/payments, any live consent changes.

## Formal stop/go sheet — release must not start unless each is satisfied

- [x] Release scoped to #620 and #643 only and based on the known production commit (read-only check).
- [x] Verified production canonical `ingest_website_lead` old-body MD5 and exact definer/owner/ACL/search-path match the fail-closed source guard, on 2026-11-08 (SELECT-only).
- [ ] **Exact release candidate**: complete full CI (TypeScript/build/browser), financial-database two-session `40P01` and full function `23505` regression, CodeQL, and clean local historical migration replay.
- [ ] **Independent human reviewer** approves the precise route diff, function replacement and migration guard, tenant isolation, concurrency, backup/revert plan and customer-impact risk. Original PRs and their combined #657 rehearsal have no recorded independent review signoff.
- [ ] **Approved isolated HTTPS website + separate isolated CRM/API/database** performs consent-safe real submit/retry, returning secondary contact, duplicate receipt and tenant isolation. The owner deferred *paid staging*; this condition cannot be silently replaced by production lead writes or synthetic CI fixtures. If no acceptable isolated environment is available, mark **NO-GO**.
- [ ] Read-only production backup/restore readiness confirmed by operator; recovery procedure reviewed, including named recovery person and protected handoff. This release does not itself create a production backup or authorize restoration.
- [ ] Authorized operator identifies exact production maintenance window and a rollback owner, takes a pre-release privacy-safe count snapshot, and confirms there is no concurrent conflicting DDL.
- [ ] Explicit final release acknowledgement that this narrowly scoped production mutation can begin **after** the required review/E2E gates.

## If/when all gates PASS — controlled order (not executed here)

1. Revalidate `crm.salsysos.com` production commit, Supabase project identity and migration ledger; fail closed on any drift.
2. Ensure recovery backup/restore protection and an approved rollback owner. Record aggregate-only before baselines and route error counts (no contact IDs, PII, raw customer payloads).
3. Apply **only** migration `20261108080000_r2_browser_lead_primary_contact_v1.sql` using Supabase's migration workflow; its source-body and security pre/post guards must pass atomically. Verify the new function's expected two changed predicates, ACL and no new or deleted customer rows. No DROP FUNCTION or table rewrite.
4. Merge **only** the separately approved release candidate with expected-head SHA. Vercel should deploy exactly the merge SHA. Confirm READY, expected host and route. Do not merge #657 or the original PRs separately as well.
5. Run passive authenticated safe smoke and authorized preexisting observability; no synthetic submissions to production, no customer outreach or tracking activation. Observe actual `40P01` and `23505` runtime error clusters and duplicate receipt/primary-contact invariants without exporting individual data.
6. If new error rates, missing authorization, function drift, unexpected tenant exposure or contact duplication emerges: halt, disable further rollout if available, revert app commit, and invoke **reviewed DBA function-restore** procedure for the precise pre-release RPC body, verifying original grants/search path again. Function rollback may re-expose original `23505` defect and must be independently reviewed: **not** a casual automated delete/down migration. Do not discard newly created legitimate secondary contact rows.

## Evidence and status

- Source draft #623 and #648 and integration rehearsal #657 had independently passing CI/CodeQL; no human-authorized production acceptance was recorded.
- Production source-body/ACL read-only guard matched on 2026-11-08. Historical Supabase replay passed in #657, but this minimal candidate requires its own exact-head pass.
- With no isolated site/database and no human reviewer evidence, **production release status = NO-GO** even if this candidate's own automated test suite passes. Do not claim R2 is 100% or full P1/P2/P3 consent/retention accepted.
- R2 full closeout still requires #520 live P1 behavior pilot, #523 real owner/admin P2 UI/SQL and tenant isolation, #528/#531/#588 consent identity/GPC/source acceptance, #527 mature verified D1/D7/D30 cohort history, identity-conflict human action or documented exception, and authoritative real checkout/payment/enrollment evidence if retained in R2's broader journey scope, plus actual post-release results and written owner signoff.

**Update this document only with observed, sourced PASS/FAIL or named authorized human approval.**
