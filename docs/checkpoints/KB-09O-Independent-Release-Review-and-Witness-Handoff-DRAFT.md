# KB-09O — Independent release review, witness ledger and hold packet

**DRAFT / OPEN / DO NOT MERGE / DO NOT DEPLOY / NO HOSTED SQL / NO SPEND**  
**Date:** 2026-11-08  
**Parent:** [KB-09N PR #655](https://github.com/yogakulamacademy/salsys-os/pull/655), exact unmerged head `2c15dc0ddfeed37ff1b10320a51a515b0fea66c8`.  
**Controlling release issue:** [#601](https://github.com/yogakulamacademy/salsys-os/issues/601).  
**Owner decisions:** [#612 security / GitHub protections](https://github.com/yogakulamacademy/salsys-os/issues/612), [#613 legal/privacy/DBA](https://github.com/yogakulamacademy/salsys-os/issues/613), [#614 isolated staging/budget](https://github.com/yogakulamacademy/salsys-os/issues/614).

## Decision today: BLOCKED, 0/16 real independently witnessed staging cases

The KB-09F through KB-09N work is supported by green **synthetic** engineering CI. That establishes neither a merged, reviewed integration nor a valid production release. No isolated staging acceptance evidence or approved migration has been demonstrated. The only authorized behavior is to prepare drafts and verify them against automatically dropped localhost test fixtures.

The machine-readable [KB-09O release-readiness ledger](./KB-09O-release-readiness-ledger-DRAFT.json) mirrors issue #601's **exact 16** scenarios, issue #613's **12** schema/data-retention surfaces and **five** external copy/processor categories, plus **12** independent decision gates. Every scenario is `UNWITNESSED`; every gate `BLOCKED`; the legal retention inventory remains `UNDECIDED`; no external evidence/reference or reviewer identity is fabricated.

### How to run the OFFLINE draft status guard

From the repository checkout:

```bash
node scripts/kb09o-release-preflight.mjs
node --test tests/knowledge-discovery/kb09o-release-readiness.test.mjs
```

The first command's success exit code **means the ledger still correctly reports BLOCKED**, **not** that release is ready. Tests reject counterfeit `READY`, positive scenario status, populated witness refs, positive consent/provider/merge flags, missing/duplicated case IDs, forged signoff and accidental change to KB-09M's migration blockers. Neither tool queries live GitHub, Supabase, credentials, payment, staging, a provider, or the public internet. They cannot validate a real protected external attestation and will **intentionally refuse all positive release statuses**. Human independent review is required to design a future authenticated, evidence-verifying acceptance process.

No secret, tenant identifier, actual customer content, signed review or receipt should be committed to this repository. Protected external evidence may be linked later only through non-sensitive references, after explicit authorization.

## What human reviewers must decide before staging

| Gate | Independent responsible decision | Ticket | Current state |
|---|---|---|---|
| Security review | Qualified reviewer separate from implementation; exact SHA and ACL/role/definer/default grants evaluated | #612 | Blocked |
| GitHub protection | Required review, last-push protection, branch restrictions, protected staging environment and negative self-approval test | #612 | Blocked |
| Privacy/legal purpose | Actual consent notice, lawful basis, purpose, withdrawal, version and SHA-256 | #613 | Blocked |
| DBA data lifecycle | All 12 schema surfaces; erasure/exception windows, audit, backups and rollback | #613 | Blocked |
| External processors | Actual presence, processor controls and deletion propagation for five categories, not assumed stores | #613 | Blocked |
| Staging budget | **Wait until product earns revenue**, then fresh exact currency/usage/region quote and separate explicit owner approval | #614 | Blocked |
| Isolated staging | Dedicated, verified, synthetic-only tenant A/B, no Production/Recovery data, secrets or credentials | #614 | Blocked |
| Versioned migrations | Security-reviewed and DBA-approved integrated migration/rollback separate from the disposable F–N SQL fixtures | #601 | Blocked |
| Physical COMMIT expiry | Decide if authorization at SQL execution is acceptable; otherwise redesign for strict physical-COMMIT guarantee | #601 | Blocked |
| Service proof risk | Protect service credentials, proof tokens, request logs and actual network attestation after robots checks | #612 | Blocked |
| Independent witnesses | Each of the 16 test cases, including negative and race cases, verified and signed separately | #601 | 0/16 |
| Final owner release | Independent review, explicit merge/deploy/rollback authorization; no automatic release on CI success | #601 | Blocked |

**Supabase docs distinction:** API grants determine whether a role can reach a function or table. RLS determines rows visible once a table is reachable. A `SECURITY DEFINER` function requires independent ownership/EXECUTE review; policy alone does not protect its privileged operations. Supabase's defaults are evolving, so actual target configuration must be verified, not inferred from synthetic local PostgreSQL. See [Securing your API](https://supabase.com/docs/guides/api/securing-your-api).

## Independent witness worklist — all OPEN (the original #601 identifiers)

Every case requires an independently witnessed synthetic staging execution, a protected reference to raw evidence, exact build/commit, environment identity without secrets, negative or boundary observation, reviewer identity under protected access, timestamp, and a separate review attestation. The witness must not be the implementer or an unverified self-report.

| # | Case ID | Minimum independent observation |
|---|---|---|
| 1 | `ownership_expiry_denies` | Expire/revoke real test-site proof and observe both fetch/lease and stored mutation denied |
| 2 | `consent_missing_denies` | No consent and wrong-purpose consent prevent crawl and database changes |
| 3 | `consent_withdrawal_stops_queued` | Withdraw during running/queued work; no late page commit or renewed collection |
| 4 | `tenant_a_cannot_read_b` | Actual separate Auth sessions; tenant A cannot SELECT tenant B sources/evidence |
| 5 | `tenant_a_cannot_write_b` | Tenant A cannot edit B documents, approvals, jobs or consent |
| 6 | `retention_expiry_erases` | Apply **legally approved** expiry and verify actual quotes/chunks/copies erased or restricted |
| 7 | `deletion_rehearsal_audited` | Reconcile erasure, withdrawal and append-only audit with DB and downstream references |
| 8 | `unauthenticated_reviewer_denied` | Anonymous, expired and non-admin review attempts fail without approval changes |
| 9 | `stale_document_version_denied` | Concurrent/stale document version must not overwrite approved evidence |
| 10 | `existing_workflow_only` | Confirm original auditable human approval pathway, no shadow approval |
| 11 | `ssrf_dns_redirect_robots_denied` | Real isolated owned test host; reject unsafe DNS, redirects, robots and cross-origin |
| 12 | `quota_and_emergency_stop` | Rate limits, concurrency, worker cancellation, pilot-off and credential-stop behavior |
| 13 | `browser_visible_text_reconciled` | Compare retained quotes against actual visible page and consented extraction |
| 14 | `model_ungrounded_answer_denied` | Only after independent authorization of the actual test provider and data boundaries; deny unsupported answers |
| 15 | `historical_citation_coverage` | Hold/reconcile historical, changed or stale citations and source versions |
| 16 | `isolated_staging_rollback` | Observe independent rollback/monitoring, isolation and no Production/Recovery impact |

The current documents contain **zero** real staging receipts. These descriptions are a future witness plan, **not** evidence that any listed action occurred.

## Retention and processors — twelve plus five unanswered decisions

Per [#613](https://github.com/yogakulamacademy/salsys-os/issues/613), legal/privacy/DBA must classify and approve each individual table: `knowledge_sources`, `knowledge_documents`, `knowledge_chunks`, `knowledge_approvals`, `knowledge_discovery_domain_verifications`, `knowledge_discovery_jobs`, `knowledge_discovery_pages`, `knowledge_discovery_site_consents`, `knowledge_discovery_consent_control`, `knowledge_discovery_consent_audit`, `knowledge_discovery_metadata_erasure_audit`, and `knowledge_discovery_policy_documents`.

For each table, independent reviewers must document whether processing occurs, purpose/lawful basis, approved retention start/end, deletion/disposition/exception, actor, rollback/restore consequences and audit proof. Do not invent retention durations or automatically delete immutable audit evidence.

Five categories require separate inventory **without assuming actual deployment**: backups/PITR/restores; logs/traces; AI prompts/provider records; caches/indexes/exports; downstream sent/published copies. These may be absent, but their absence needs independently verified evidence.

## Cutover, risk, and rollback decision dependencies

The KB-09M [cutover inventory](./KB-09M-cutover-inventory-DRAFT.json) enumerates **nine** current public discovery RPCs and the **KB-09F–N localhost-only rehearsals**. Review the original foundation drafts (KB-01B, KB-06A/B/C/E, KB-07D), then the F–N hardening sequence. An approved migration must be created separately by authorized DBA/security staff; copying the disposable `kb09*_fixture` SQL or staging on Production/Recovery is forbidden.

**Outstanding technical risk:** Clock checks inside Postgres routines do **not** prove ownership is still valid at a caller-delayed physical COMMIT. Independent security/DBA/product staff must decide whether bounded one-statement PostgREST SQL-execution-time validation is acceptable. If they require physical-COMMIT validity, a different reviewed architecture is necessary. A preimage proves possession, **not independently verified site publication**, and a compromised service key can still present risk. The operator consent-policy control remains disabled until independent approval.

**Non-destructive stop rule:** Keep discovery pilot and new consent grants OFF; disable/suspend worker without broadening privileged SQL permissions; preserve withdrawals, audits, tenant records and historical citations; diagnose under independently reviewed isolation. Do not apply `DROP CASCADE`, regrant service DML or revive obsolete seed-repair/unchecked commit just to restore throughput.

### Work that remains outside this draft

The owner must separately approve independent repository review/protections and (after revenue) a fresh staging cost; legal/privacy/DBA must independently approve processing and migrations; external witnesses must run 16 cases against genuine signed test sessions. A properly reviewed integration and rollback, protected environment and explicit final release decision then remain necessary. **Successful CI for this package does not satisfy any of those steps.**

**Non-actions:** no hosted database or Auth access, real data, website crawling, model/provider calls, policy activation, staging provisioning, billing, GitHub branch-rule changes, main merge or deployment.
