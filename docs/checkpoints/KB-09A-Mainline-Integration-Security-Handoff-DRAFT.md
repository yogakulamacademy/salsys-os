# KB-09A — Current-main integration and security handoff (DRAFT / NO RELEASE)

**Date:** 2026-11-07. **Repository:** \`yogakulamacademy/salsys-os\`.
**Reviewed \`main\`:** \`691dc44182b969a2e0c272017fcdfc927c2dc9fc\`.
**Parent KB-08G draft:** \`45ff2968a7af0bbb6ec6d9a9238e1fd22df0c644\` ([PR #631](https://github.com/yogakulamacademy/salsys-os/pull/631)).
**Acceptance issue:** [#601](https://github.com/yogakulamacademy/salsys-os/issues/601) — **BLOCKED, 0/16 real independently witnessed scenarios**.

This is an **offline engineering inventory and a reproducible safety tripwire**, not an
attestation that production, staging, ownership, consent, retention, provider
grounding or real tenant Auth has been verified. No merge, migration, browser
dispatch, paid project, external crawl or live provider calls are authorized.

## 1. Exact-base and changed-path inventory

At the parent PR #631 HEAD, the GitHub compare against the reviewed main returned
**ahead 28, behind 0, total 162 changed paths**. The group distribution was:

| Scope | Paths | Risk / review focus |
|---|---:|---|
| \`.github\` | 3 | CI plus 2 manual-only **draft** staging workflows; default-branch dispatch is NOT registered |
| \`app\` | 10 | 6 new discovery API routes, 3 new KB pages, changed existing Knowledge workspace page |
| \`components\` | 8 | Discovery, policy/consent and synthetic review previews; inspect non-publish behavior |
| \`docs\` | 55 | Checkpoint documentation and **non-migration** SQL prototypes |
| \`lib\` | 26 | Discovery safety and KB evidence/review contracts; static/synthetic proof only |
| \`middleware.ts\` | 1 | Public exact path for KB worker; worker must enforce its own bearer and OFF pilot gate |
| \`package.json\`, \`package-lock.json\` | 2 | \`parse5\` parser dependency; review supply chain |
| \`scripts\` | 4 | Staging preflight/attestation and offline evidence scripts |
| \`tests\` | 53 | Unit, ephemeral PostgreSQL, contract and synthetic browser checks |

**This current KB-09A branch** adds only this handoff, the offline guard script and
guard unit tests relative to KB-08G. Before any merge proposal, re-run GitHub
compare against the **then-current** \`main\` and have a separate reviewer inspect
the full actual diff. The stored SHA is a review marker, **not** dynamic proof.

## 2. Existing user-facing contracts are intentionally preserved

GitHub blob read-back against both reviewed \`main\` and KB-08G confirmed
these seven paths are **byte-identical**. The KB-09A offline guard pins their
exact blob SHA-1 values and fails CI if any are changed without fresh review:

- \`app/settings/knowledge/actions.ts\` — existing manual create/approve/archive
- \`app/conversations/copilot-actions.ts\` — actual Co-Pilot knowledge retrieval
- \`supabase/migrations/20261016173500_organization_knowledge_search_v1.sql\`
- \`supabase/migrations/20261102053201_knowledge_retrieval_anon_execute_hardening.sql\`
- \`scripts/verify-ai-knowledge-final-closeout.mjs\`
- \`scripts/verify-conversations-final-closeout.mjs\`
- \`lib/supabase/admin.ts\` — existing service-client boundary

**Important:** Preservation is NOT proof the existing behavior is secure; nor does
it establish that the KB-08G mock retrieval is connected to Co-Pilot. In fact,
the KB-08E/F/G rehearsal SQL is deliberately **not** wired to real retrieval.

## 3. Runtime change attack-surface review

1. **Worker/public middleware boundary:** \`middleware.ts\` adds
   \`/api/knowledge/discovery/worker\` to public exact paths for a machine route.
   The route itself currently checks \`discoveryPilotEnabled()\` **before** DB
   work, requires a bearer secret, then checks exact pilot host allowlist,
   domain ownership proof and purpose-specific active consent before processing.
   KB-09A guards these baseline checks syntactically. Independent reviewer
   must still assess token management, replay, SSRF/robots, quotas, worker
   lease, site owner change and emergency-stop behavior under real controls.
2. **Existing Knowledge workspace page:** added website-discovery and
   synthetic evidence-preview links. It also reports coarse source/status
   eligibility, which must not be interpreted as independently verified
   citation freshness or live Co-Pilot readiness; real retrieval has a
   separate authorization and evidence contract.
3. **New KB discovery APIs:** review \`GET\`/write permissions, tenant isolation,
   same-origin and CSRF controls, consent/version/withdrawal race handling
   and service-role usage before any real project deployment. Tests remain
   synthetic; production KB discovery pilot is not authorized to turn ON.
4. **Manual staging workflows:** two new draft YAML files have only
   \`workflow_dispatch\` and named proposed protected environments. They are
   not registered on the default branch; YAML text does not establish that
   environment reviewers, branch restrictions or secrets isolation exist.
5. **Non-migration SQL:** KB-08E/F/G under \`docs/sql\` require random
   disposable PostgreSQL fixture DBs, never connected Production/Recovery.
   Privileged mock service roles and UUID-paired observers are NOT signed
   authentication or independent source proof. The KB-09A guard rejects
   accidental app/runtime references to these fixture schemas.
6. **Dependency review:** \`parse5\` 8.0.1 is introduced in the draft.
   Existing CI build and CodeQL pass, but a separate independent
   dependency/supply-chain approval remains required before release.

## 4. What synthetic engineering has proved, and not proved

- KB-01–04: bounded off-by-default pilot discovery, source extraction,
  citation/AI proposal review, change-impact, advisory handoff and UI previews.
- KB-05–07: offline/disposable DB tenant/consent/erasure/session tests,
  protected workflow proposals and review-evidence digest rehearsals.
- KB-08A–D: request evidence fingerprint, strict timestamps, superseded citation
  holds, synthetic document-version/approval-boundary preflight.
- KB-08E–G: mock atomic version/source CAS approval, postapproval source-change
  review holds and private retrieval suppression; two **mock** observers,
  missing/late/conflicted verification and idempotent private alerts.
- KB-09A: source-level current-main preservation and rehearsal-isolation
  checks. Green CI only proves the checks against the tested GitHub commit.

**Not proved:** independent current-site ownership/consent, authentic
browser-visible evidence, AI provider semantic grounding, actual actor
identity, production Supabase RLS, timely upstream monitoring delivery,
real retrieval suppression, legal retention/erasure, protected reviewer
enforcement, live rollback or a release-safe migration.

## 5. Release-gate handoff: independently witness all 16

These are the *actual* acceptance IDs from #601. No item below is marked
completed because synthetic tests and self-reported runner status do not
qualify. Assign two-tenant, source-site and independent human witnesses
only **after** budget, governance and security approvals.

| Case | Real independent acceptance evidence still needed |
|---|---|
| 1 \`ownership_expiry_denies\` | Time-bound/revoked real domain ownership blocks requests |
| 2 \`consent_missing_denies\` | Missing/wrong-purpose consent blocks |
| 3 \`consent_withdrawal_stops_queued\` | Withdrawal stops queued and in-flight tasks |
| 4 \`tenant_a_cannot_read_b\` | Authenticated A read of B denied |
| 5 \`tenant_a_cannot_write_b\` | Authenticated A mutation of B denied |
| 6 \`retention_expiry_erases\` | Approved real policy expiry removes derived copies |
| 7 \`deletion_rehearsal_audited\` | Real erasure/withdrawal audit reconciliation |
| 8 \`unauthenticated_reviewer_denied\` | Independent non-admin/anonymous reviewer denial |
| 9 \`stale_document_version_denied\` | Actual transaction-bound version CAS denial |
| 10 \`existing_workflow_only\` | Existing audited approval enforced; mock packet cannot approve |
| 11 \`ssrf_dns_redirect_robots_denied\` | Network/DNS/redirect/robots negative controls |
| 12 \`quota_and_emergency_stop\` | Live quota/concurrency/pause shutoff observed |
| 13 \`browser_visible_text_reconciled\` | Real rendered page and captured quote reconciled |
| 14 \`model_ungrounded_answer_denied\` | Actual model/provider unsupported answer held |
| 15 \`historical_citation_coverage\` | Historical/stale/changed citation coverage verified |
| 16 \`isolated_staging_rollback\` | Monitored staging rollback independently witnessed |

The external evidence store should record exact commit and project refs,
required owner/witness attestations, outcome and per-case evidence digest.
Never attach credentials, raw customer records or unapproved legal claims.

## 6. Owner decisions and stop conditions

- [#612](https://github.com/yogakulamacademy/salsys-os/issues/612):
  required independent GitHub approvals/protected environment settings
  unapproved and not yet independently read back.
- [#613](https://github.com/yogakulamacademy/salsys-os/issues/613):
  legal/privacy + DBA decisions pending for 12 KB tables, external copies,
  retention/deletion, backup/audit exceptions and consent notice.
- [#614](https://github.com/yogakulamacademy/salsys-os/issues/614):
  no dedicated isolated staging resource approved. Owner deferred all new
  paid Supabase staging until SalsysOS generates revenue; even then, a
  fresh price and explicit owner cost approval are required.

**Current recommendation:** leave the KB draft stack open and unmerged,
keep the pilot and customer tracking off, preserve the existing Knowledge/CRM
workflow, obtain an independent review of the 162-path diff and any future
rebased diff, and continue read-only zero-new-spend work. Do NOT equate CI
success, PR mergeability, a synthetic SQL rehearsal or UI visualization with
an approved production release.

**Offline verification:** \`node scripts/kb09a-verify-mainline-integration-guard.mjs\`
and \`node --test tests/knowledge-extraction/kb-mainline-integration-guard.test.mjs\`.
These commands perform only local file reads and hashing.
