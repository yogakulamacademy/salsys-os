# KB-10 — One integrated Knowledge Builder review candidate; staging explicitly held

**2026-11-08 — DRAFT ONLY / STAGING ON HOLD / NO MERGE / NO DEPLOY / NO HOSTED SQL**

**Integration baseline:** [KB-09T draft PR #664](https://github.com/yogakulamacademy/salsys-os/pull/664), exact unmerged SHA `ea23c8b778c67a107235003d96c57082fd0731ce`. A read-only GitHub comparison with `main` reported **161 commits ahead, zero behind, 218 changed paths** as of that snapshot. This KB-10 branch extends that cumulative stack. No previous dependent PR has been merged and a green CI is not an independent security review.

**Source of truth:** [release gate #601](https://github.com/yogakulamacademy/salsys-os/issues/601) (0/16 real witnessed cases); [security/protection #612](https://github.com/yogakulamacademy/salsys-os/issues/612); [privacy/legal/DBA #613](https://github.com/yogakulamacademy/salsys-os/issues/613); [isolated staging/budget #614](https://github.com/yogakulamacademy/salsys-os/issues/614). The machine-readable [KB-09M inventory](./KB-09M-cutover-inventory-DRAFT.json), [KB-09O release ledger](./KB-09O-release-readiness-ledger-DRAFT.json) and [KB-10 hold manifest](./KB-10-integrated-review-hold-DRAFT.json) remain **BLOCKED**.

## Owner direction — hold staging, continue no-cost engineering

**Staging has been explicitly placed ON HOLD.** Do not create a Supabase project, request a paid tier, use Production/Recovery as staging, run a manual staging workflow, create staging users, spend money, prepare secret material in CI, apply SQL to hosted systems or mark any of the 16 acceptance cases done. A separate future instruction must lift this hold. Even then, new paid staging requires **SalsysOS revenue**, a **fresh exact quote in a known currency** and a **separate explicit cost approval**. Merely creating a draft PR or reviewing this packet never authorizes staging or production.

## One review package: actual functional scope vs approval needed

| Area | Draft engineering evidence | Unresolved before independent release |
|---|---|---|
| Permanent workspace | Existing `/settings/knowledge`; post-onboarding Settings/finish shortcuts, website edit permissions, scoped tenant state in KB-09P | Real signed owner/admin RLS and concurrent edits in dedicated staging |
| Website source discovery | Robots/DNS/SSRF/redirect safeguards, proof/consent/lease-RPC checks and STOP controls | Authoritative owner/consent policy, network and physical external COMMIT decision; no live crawler enabled |
| Source evidence | KB-02C HTML5 parse5, KB-03A deterministic quotes/FAQ candidate logic, KB-09R pasted-HTML preview, KB-09S synthetic atomic evidence creation | True browser-visible content provenance, durable permitted snapshots, reviewed migrations and approved lifecycle |
| Knowledge review | Existing source-backed draft/approval, KB-09Q manual discovered-page form, KB-10 deterministic quote/FAQ suggestions for human review | A **new** DB-atomic discovered-page draft RPC; independent approved review, no automatic publishing |
| Lifecycle and privacy | KB-09T disposable evidence-withdrawal, receipt rollback, synthetic expiry | Legal purpose, actual retention intervals, derived-doc/embedding lifecycle, backups/WAL/provider copies, pending-erasure behavior |
| Release safety | KB-09M nine live RPC inventory, KB-09N privilege audit, KB-09O and KB-10 BLOCKED-only CI preflights | Independent reviewer, protected GitHub controls, integrated migrations/rollback, signed tenant A/B and 16 witnessed cases |

### Security finding closed in application draft: TOCTOU at discovered-page saving

KB-09Q originally did an app-level SELECT of fetched page, current proof and consent, then called `create_source_backed_knowledge_document_v2`, a **generic source-backed document RPC** that does not itself check current discovery consent. Consent could be withdrawn **after** the SELECT but **before** that generic write. It is not safe to call that sequence “write-time consent verified,” and app-side rereads do not make it atomic.

**KB-10 change:** `createManualDraftFromDiscoveredPageAction` now explicitly requires `KNOWLEDGE_DISCOVERY_ATOMIC_DRAFT_APPROVED=true` (default **false**) and calls **only** `create_discovery_review_draft_with_current_consent_v1`. No fallback to the generic v2 RPC, no service key, and no externally supplied source URL/name or approval intent. The new name is a **contract for an independently approved database migration**; it is **NOT installed** by this branch. The server requires a draft-only receipt bound to `organization_id` **and** `page_id` plus document/source UUIDs. The UI displays **Draft saving on hold** and disables submission until the independent contract is installed and the separate authorized feature setting is made. A missing/revoked DB function fails closed.

The existing manual non-discovery Knowledge Library is unchanged. Existing knowledge approval/archival and Co-Pilot retrieval remain unchanged.

### Exact required SQL transaction contract for future DBA review (NOT EXECUTABLE HERE)

The proposed `create_discovery_review_draft_with_current_consent_v1(p_organization_id uuid, p_page_id uuid, p_title text, p_category text, p_content text)` must:

1. Be reachable **only by authenticated owner/admin users whose current Auth session** matches a revocable binding to the exact active organization; no privileged generic service-role fallback. Qualify the target DB owner, search path, `EXECUTE` grants, RLS, JWT freshness and authenticated Data API exposure.
2. Use a single database transaction to read the stored configured HTTPS domain and the **same-tenant** fetched page plus job, with matching exact source URL and terminal successful job; reject page IDs from another tenant, stale host, wrong job, non-HTTP-200 and status changes.
3. Acquire locks **in the existing job-before-consent order** to serialize with the current signed-user `withdraw_knowledge_discovery_consent_v1`. Under lock, verify **current proof and purpose-specific consent**, policy version/digest, non-expired policy and grant, exact hostname and withdrawal state; reject late revocation at the SQL boundary.
4. Create only a **draft**, never approved, through the existing atomic source-backed document/linked chunk contract (or an independently reviewed least-privileged replacement) with source metadata from the stored page, not form parameters. Avoid a second commit or a standalone insert that could persist if the other write fails.
5. Return only `{ok:true,status:'draft',organization_id,page_id,document_id,source_id}` on success. If any guard or insert fails, create **no** document/chunk/source, leave original consent/approval audit intact and provide a generic denial to the user. Test concurrent withdrawal, stale proof, table privileges, role/RLS, replay and exception rollback with real tenant sessions.
6. **Do not promise physical COMMIT-time validity** merely by checking a timestamp inside a PostgreSQL statement. The product/security/DBA reviewers must separately decide the required guarantee and adapt transaction boundaries if stricter than SQL-check-time validity.

**This is a proposed contract, NOT a production-ready migration.** No legal basis or retention duration was inferred, and it must not be implemented on hosted Supabase until independently authorized.

## Automatic suggestions: safely bounded, still not source verification

The permanent manual workbench now uses **existing** `prepareSourceGroundedDrafts` as well as `extractHtml5VisibleBlocks` to produce at most 12 quote-only source-statement or adjacent FAQ suggestions from **user-pasted HTML**. Every suggestion is explicitly **unverified**, no model/prompt call is made, no HTML is retained, and nothing is automatically added to a document. Suggested "fetchedAt" in that engine denotes **operator preview time only**, not website response capture. The snapshots and citation hashes for this preview are **not permitted** to be treated as independently fetched/verified evidence. Human source checking and the future consent-atomic save remain mandatory.

The actual crawler's pure `prepareCrawlerEvidenceEnvelope` and KB-09S/KBT evidence creation/erasure remain **synthetic-only**. The production runner still commits only page metadata using the existing checked RPC and has not been wired to store source quotes, invoke LLMs or approve candidate content.

## Independent review assignments (no invented signoffs)

**Independent security reviewer — #612:** Review the full cumulative 218-path parent diff, all nine current runtime RPCs versus exact future migrations, `SECURITY DEFINER` ownership/search paths, source and docs access, default privileges, BYPASSRLS service-role, proof tokens, lease and consent race handling, tenant session bindings, request logs/secrets, SQL-check versus physical COMMIT expiry, stop/restart. A qualified reviewer **other than the implementer** must attest an exact SHA. GitHub main ruleset and a protected staging environment require separate owner approval/read-back; no changes here.

**Legal/privacy and DBA owners — #613:** Independently decide purpose and consent notice version/digest, lawful basis, quote/HTML/candidate retention and withdrawal, per-table disposition of all **12 existing schema surfaces** and the proposed *new* evidence/draft derivatives, exception/hold policy, whether withdrawal blocks until erasure or enters a pending state, and every processor category (backups/PITR/restore, logs/traces, model/provider prompts, caches/indexes/exports, downstream copies). Set **actual** durations and responsible actors. Current "60-second TTL" in KB-09T is an invented synthetic test timer and has NO production authority. Return approvals as protected external references, never fabricated identities or signed records in this public PR.

**DBA/migration reviewer — #601/#613:** After privacy decisions, draft a **new versioned migration series** with the proper Supabase CLI and exact target tool version. Review/split these phases: source schema and grants; authenticated consent/proof + audit; checked job enqueue/lease/commit; atomic discovered-page draft; approved evidence snapshot storage and withdrawal/retention control; close obsolete entrypoints and audit grants. Never copy any `kb09*_fixture` or random-database test SQL as a real migration. Rehearse *only after* dedicated staging authorization. No hosted SQL is authorized now.

**Release owner — #601:** Only after independent signoffs, the owner may choose a protected merge/deploy window with explicit rollback decision. A green synthetic check alone must never activate the website crawler, evidence storage, consent policy or model.

### Non-destructive rollback plan for future review

If authorization is withdrawn or a future pilot fails: **turn the discovery pilot OFF, pause the worker, deny new claims and new manual discovery drafts, isolate credentials, retain append-only audit and existing customer records, and investigate/reconcile idempotently.** Do not `DROP CASCADE`, regrant unchecked service-role DML, delete audit data or undo customer withdrawals. A future approved cleanup must be reversible or independently reconciled against signed erasure receipts and the legal hold/retention decision; a schema rollback is **not** data erasure.

## Exact manual handoff sequence once the owner separately lifts staging hold

1. Obtain independent #612 security and #613 privacy/DBA decisions on the cumulative **exact reviewed commit**, without authorizing hosted writes.
2. Author and approve the versioned migration and rollback set based on the reviewed real target schema (not the fixture SQL).
3. Only if revenue and a fresh quote/cost cap are separately approved, create a truly isolated synthetic-only staging environment; independently verify GitHub reviewer protection and isolate all secrets.
4. Independently witness the original **16** real staging acceptance cases, and add post-onboarding website edit, revoked consent during draft save, source fidelity, derived-data withdrawal, expiry and restore. Count **0/16** until real receipts exist.
5. Obtain a separate explicit protected merge, production deployment and monitoring/rollback approval. No partial release based on draft CI.

## No-cost validation

```bash
node scripts/kb09o-release-preflight.mjs
node scripts/kb10-integrated-review-hold-preflight.mjs
node --test tests/knowledge-discovery/kb10-integrated-review-hold.test.mjs
```

A successful run means **BLOCKED / staging ON HOLD** remains enforced, **not** production release readiness. Existing TypeScript, browser regression, disposable PostgreSQL and CodeQL checks must also pass on the latest exact branch head.

**NON-ACTIONS:** No hosted database or migrations, real customers or test tenants, live website crawl, unverified source publication, provider/LLM call, project provisioning, payment, GitHub ruleset update, `main` merge or deployment. This packet is an engineering and independent-review *handoff*, never independent approval itself.
