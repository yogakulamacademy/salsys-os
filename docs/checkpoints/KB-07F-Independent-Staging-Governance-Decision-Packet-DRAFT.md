# KB-07F — Independent staging and governance decision packet (DRAFT / NO RELEASE)

**Prepared:** 2026-11-07. **Scope:** Documentation-only review preparation, not a new consent, retention, deletion, or authorization implementation. **Base:** unchanged `main` as verified before branch creation. **Release issue:** #601. Knowledge Builder development proposals through KB-07E (#607, full rehearsal #609) are draft and unmerged; the source references below may therefore be absent from `main`.

## Current decision (must remain BLOCKED)

| Release requirement | Independently confirmed? | Current result |
| --- | --- | --- |
| Separate isolated Supabase staging project, with authorized cost | No | **BLOCK** |
| Protected GitHub reviewers, dispatch/ref restrictions and environment configuration independently verified | No | **BLOCK** |
| Approved legal consent notice and purpose-specific policy version + digest | No | **BLOCK** |
| Approved retention, audit minimization, erasure, backup and external-provider disposition | No | **BLOCK** |
| Two genuine separate staging tenant accounts with signed Auth/session isolation | No | **BLOCK** |
| All 16 witnessed KB-04E acceptance scenarios | **0 of 16** | **BLOCK** |

**Non-authorization invariant:** A successful CI run, green CodeQL scan, matching SHA-256 evidence files, populated checkbox, recorded project ref, environment variable or written decision in this document cannot enable consent, crawling, AI calls, knowledge publishing, GitHub merge or deployment. This packet is NOT approval and must NOT be read by an application as a permission token. Record actual approvals only through independently controlled owner/legal/security processes.

## Decision register — the concrete decisions required next

Every entry remains **UNAPPROVED** until its designated independent decision-maker supplies verifiable evidence outside the repository. Do not place secrets, personal evidence, signed JWTs, access tokens, customer records, legal advice or staging login credentials in this document, PR, issue, CI logs or public artifacts.

| ID | Responsible decision function (not assigned) | Decision required | Evidence to retain separately | State |
| --- | --- | --- | --- | --- |
| S1 | Budget owner | Choose a **new standalone staging project** or an independently reviewed equivalent isolation architecture; set acceptable budget, usage limit/alerts, teardown date, region, backup/retention boundaries | Actual price quote including currency/usage terms and explicit cost consent | UNAPPROVED |
| S2 | Infrastructure owner | Prove selected target is a newly provisioned **test-only** project, **not** Production or Recovery Rehearsal, and confirm its parent/organization and scope | Verified project inventory and isolated project ownership record | UNAPPROVED |
| S3 | GitHub administrator + independent security reviewer | Confirm protected environment settings: authorized reviewers, self-review restriction where available, branch/tag selection, environment secrets/variables and permitted workflow actors | Independently reviewed environment settings and actual approval records | UNAPPROVED |
| S4 | Application/security owner | Select a reviewed, immutable exact commit and manually registered dispatch workflow; keep default-branch stub #602 unmerged until its own authorization | Exact code SHA, reviewed ref, protected-run permission evidence | UNAPPROVED |
| P1 | Legal/privacy owner | Approve exact discoverability/consent purpose, owner notice wording, policy version/digest, opt-in/withdrawal and lawful basis | Dated, approved policy text and approval record | UNAPPROVED |
| P2 | Legal/privacy owner + DBA | Define **per data class** retention/erasure, statutory audit exceptions, data-subject handling and deletion response deadlines | Signed decision matrix and exception/retention rationale | UNAPPROVED |
| P3 | DBA + security/privacy owner | Reconcile append-only consent, erasure and human approval history with actual deletion rights, FK actions, TRUNCATE/privileged operations, tenant-offboarding | Approved schema/deletion plan with rollback and access review | UNAPPROVED |
| P4 | Infrastructure/security owner + processors | Define backup/PITR, logs, exports, search/indexes, caches, AI prompts/provider records and downstream copies: expiry, propagation, verification and exceptions | Data-flow/inventory evidence and processor retention commitments | UNAPPROVED |
| A1 | Staging test owner | Prepare two **different synthetic-only** tenant organizations, signed-in owner/admin test actors, session binding and RLS fixtures; protect and rotate credentials | Staging-only identity/role/fixture register with independent provenance | UNAPPROVED |
| A2 | Independent security tester + product/data-governance witness | Run, observe and sign off **all 16 KB-04E scenarios**, including negative controls and rollback, with evidence stored outside the public repo | Signed, dated outcomes, exact SHA, project identity/target, scenario mapping, permitted evidence digests | UNAPPROVED |
| A3 | Final release owner (separate from implementer) | Independently reconcile P/S/A decisions and external evidence, determine separately whether release may proceed | Explicit authorization record identifying exact reviewed commit, tenant and scope | UNAPPROVED |

### Supabase cost decision — not permission to provision

Issue #601 records a **read-only, account-linked quote** for an owner-selected Supabase organization: standalone project numeric amount `10` per month; development branch numeric amount `0.01344` per hour. The returned quote did **not** specify a currency or guarantee inclusion of usage/taxes. Those numeric figures are **not an owner-approved charge** and may change. A fresh direct quote and the applicable currency/usage terms must be shown to the owner, followed by explicit approval **before** invoking any paid project or branch creation. No default approval is implied by “continue.” Do not accidentally select Production or Recovery Rehearsal as the test target.

## S3 administrator action sheet — proposed, NOT applied

**Observed current settings (read-only, 2026-11-07):** The public repository `yogakulamacademy/salsys-os` has one visible active branch ruleset, [Protect main #26039966](https://github.com/yogakulamacademy/salsys-os/rules/26039966), targeting its default branch `main`. The `pull_request` rule requires **0** approving reviews, does **not** require an approval from a reviewer other than the last pusher, and does **not** require resolving all review threads. It currently dismisses stale approvals on push. Its required status checks are `CodeQL` and `validate` (not `financial-database`); do not assume any other inaccessible branch protections. The repository's protected GitHub Actions environment/reviewer assignments and secrets have **not** been independently inspected.

**Do not apply this draft as an authorization.** These proposed changes affect all users of `main`; the owner/admin must independently approve the exact rules and identify at least one **different**, qualified, available reviewer with proper repository permission before activation. Consult [GitHub ruleset guidance](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets) and [GitHub protected environment guidance](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments) for applicable features.

| Control | Observed now / verification | Proposed for owner/admin decision (not installed) |
| --- | --- | --- |
| Main PR approvals | `required_approving_review_count=0` | Require **at least 1** qualified independent approval; decide whether a second security reviewer is needed for KB security changes |
| Last-push protection | `require_last_push_approval=false` | Require a reviewer other than the last pusher to approve the latest changes; retain `dismiss_stale_reviews_on_push=true` |
| Review comment closure | `required_review_thread_resolution=false` | Require all PR review threads resolved before merge; record meaningful review decisions rather than auto-resolving findings |
| Current branch status checks | `CodeQL` and `validate` required | Preserve these; decide explicitly whether disposable `financial-database` must also be a required check after verifying its stable check context |
| Bypass and force history | Ruleset has empty bypass actors, non-fast-forward and deletion restrictions | Preserve. Independent reviewer confirms effective layering with other branch protections; do not add privileged bypass |
| Protected staging environment | Not independently verified | Create/configure a **separately approved staging environment**, require named reviewers, enable **Prevent self-review**, restrict eligible refs/branches, and restrict environment credentials to that target; never populate with Production/Recovery secrets |
| Workflow authorization | Reviewed dispatch stub KB-07A #602 still draft | After explicit authorization, register exactly reviewed, fixed-SHA manual workflow only; verify any job that would access staging secrets actually references the protected environment before secret access |
| Site and database isolation | No dedicated, cost-approved KB staging verified | Keep environment variables absent and jobs blocked until a distinct, approved **test-only** Supabase project, synthetic tenants and disabled external integrations are independently confirmed |

**Admin's safe order (all steps require authority):** identify independent reviewer → record rule-change approval and coverage for other repository workflows → configure protected main ruleset → independently read back its *effective* rules → configure staging environment with required reviewers, self-review prevention and ref restrictions → independently verify no live credentials are inherited → register reviewed manual dispatch and exercise a **disposable, no-secret, no-database-write** rejection/approval test of reviewer protection. The tester must demonstrate that an unapproved run remains blocked and that the initiator cannot approve their own run; stop if the protection cannot be witnessed. Do not invoke a KB crawler or staging Auth test as the protection dry run.

**S3 evidence for independent review:** record a dated, externally stored redacted settings snapshot (rule ID, effective target, required checks, approval count, last-push/thread settings); authorized reviewer identity/role and conflict-of-interest check; protected environment reviewer/self-review/ref restrictions; an observed denied/waiting workflow and independently approved no-op workflow; the exact reviewed commit SHA. Never store environment secrets, tokens, private cookies, customer data or signed staging sessions in GitHub issues/PRs. A successful no-op control test satisfies **only S3**, not KB consent, staging identity, retention/erasure or any of the 16 KB-04E scenarios.

**Current result:** `S3=UNAPPROVED`. This action sheet creates **no GitHub ruleset, protected environment, deployment, project, signed approval, permission to merge, or production acceptance**.

## Retention/deletion questions that must be resolved before any KB SQL application

The source catalog `docs/checkpoints/KB-06G-Retention-Deletion-Dependency-Coverage-DRAFT.md` enumerates **12** knowledge/discovery data surfaces; its limited metadata erasure proposal covers **only** discovery jobs/pages after consent withdrawal. A separate reviewed policy must state what happens to:

1. **Source and derived content:** knowledge sources, documents, chunks/search indexes, quotations, source snapshots, change history, AI-drafted proposals, citations, previews and downstream sent/published copies.
2. **Identity/authorization:** domain verification proofs, owner consent state, policy registry/versioned notice, session-binding rows and access/actor provenance.
3. **Audit ledger:** consent grants/withdrawals, metadata erasure receipts, and human knowledge approvals; distinguish minimizable human/source text from retained non-identifying audit proof.
4. **Lifecycle/deletion:** withdrawal versus approved retention expiry versus data-subject requests versus tenant offboarding; scope, legal basis, exceptions, frequency, transaction ordering and evidence of completion.
5. **External surfaces:** backups/PITR, replicas, logs/traces, provider prompts/responses, caches, generated exports and third-party destinations, including expiration after restore or replication.
6. **Control plane:** authorized operator, privilege separation, failure/rollback, legal hold, record corrections and time-bounded audit access.

**Specific unresolved conflict:**
- Existing knowledge V1 `knowledge_approvals` FK can cascade on document delete; **KB-07C DRAFT** proposes `ON DELETE RESTRICT` to avoid silent loss of human approvals. That is an audit safeguard, **not** a lawful erasure design; it may intentionally block deleting content that must later be erased.
- **KB-07D DRAFT** proposes `BEFORE TRUNCATE` audit guards in addition to existing `BEFORE UPDATE OR DELETE` triggers. This is defense in depth, **not** immunity from privileged DDL/trigger disablement and **not** a perpetual-retention mandate.
- **KB-06C DRAFT** deletes scoped discovery job/page metadata only and intentionally retains consent and audit rows. Neither it nor KB-07C/D solves source/derived data lifecycle.
- **KB-06E DRAFT** stores a hash-matched policy document for read-only owner inspection. Hash matching does not establish legal approval.

No arbitrary retention days, legal basis, deletion permission or service-role exception may be invented. Resolve these points through independent review before applying any draft schema to hosted staging.

## Execution phases — each requires its preceding signed gate

**Phase 0 — obtain authority; no action by this packet:** approve budget/cost, chosen region and dedicated project; approve protected GitHub environment and registration workflow; independently approve privacy/retention and test-data processing plan. Until then, **stop**.

**Phase 1 — staging bootstrap after authorization:** provision separately, prove project identity and no Production/Recovery reuse, apply only independently reviewed migrations in a controlled order, prepare synthetic test tenants and fixtures, independently inspect RLS/function grants/constraints and rollback. No real customer data.

**Phase 2 — controlled Auth tests:** manually dispatch the reviewed read-only knowledge harness in its protected environment only after real project, reviewer and SHA checks. Its password sign-ins still create staging Auth sessions. If separately approved, use the **distinct** KB-06H test-session-binding workflow; it writes exactly two intended staging session-binding rows, which may remain after logout and need a cleanup/retention decision. Its approval phrase must never be reinterpreted as general SQL/consent/crawl permission.

**Phase 3 — full witnessed acceptance:** complete the 16 scenarios below, including consent and metadata deletion and the source/derived lifecycle once it has been legally designed. Record both positive controls and negative denials to exclude vacuous passing tests. Confirm the emergency stop and rollback under real test-only conditions.

**Phase 4 — independent reconciliation:** compare actual external evidence to each scenario, authenticate witnesses and environment approvals using systems outside the code under test, and check all data stores/retention boundaries. The KB-07E tool may compare detached local SHA-256 bytes but can **never** authenticate their origin or authorize release.

**Phase 5 — separate release decision:** only the authorized release owner may decide a particular merge/deployment after all other gates. No automatic transition from CI, digest match, or “16 files present.”

## Real acceptance witness matrix — KB-04E exact scenario IDs

For every row, the independent test owner must preserve a date, exact reviewed SHA, approved project identity, two-tenant context where applicable, positive control, observed outcome, audit/network evidence, independent witness identity and review disposition **in an access-controlled external evidence store**. All currently **NOT RUN**.

| Scenario ID | Expected | Minimum independent witness focus | Status |
| --- | --- | --- | --- |
| `ownership_expiry_denies` | deny | Revoked/expired domain proof blocks fresh source reads | NOT RUN |
| `consent_missing_denies` | deny | Absent/wrong-purpose consent blocks discovery and monitoring | NOT RUN |
| `consent_withdrawal_stops_queued` | deny | Queued and in-flight workers cannot commit after withdrawal | NOT RUN |
| `tenant_a_cannot_read_b` | deny | Signed tenant A cannot retrieve B content, with A/B positive controls | NOT RUN |
| `tenant_a_cannot_write_b` | deny | Tenant A mutation against B evidence/approval is rejected and audited | NOT RUN |
| `retention_expiry_erases` | delete | Approved duration applies to original quotes and all defined derivatives, including restore path | NOT RUN |
| `deletion_rehearsal_audited` | audit | Withdrawal/deletion transaction, ledger and residual copies reconcile | NOT RUN |
| `unauthenticated_reviewer_denied` | deny | Anonymous/non-admin cannot approve knowledge; owner/admin positive control | NOT RUN |
| `stale_document_version_denied` | deny | Stale document cannot overwrite current approved version | NOT RUN |
| `existing_workflow_only` | audit | Human approval uses original audited actions; no bypass/auto-approval | NOT RUN |
| `ssrf_dns_redirect_robots_denied` | deny | Unsafe IP/DNS, redirect, robots and off-host network policy fails closed | NOT RUN |
| `quota_and_emergency_stop` | deny | Quota/concurrency and emergency disable prevent new work | NOT RUN |
| `browser_visible_text_reconciled` | reconcile | Browser-visible fixture source and exact stored quote agree | NOT RUN |
| `model_ungrounded_answer_denied` | deny | Real-provider unsupported answer cannot be approved; approved fixture only | NOT RUN |
| `historical_citation_coverage` | reconcile | Changed/deleted sources and history citations reconcile or remain held | NOT RUN |
| `isolated_staging_rollback` | audit | Isolation, monitoring, rollback and repeat negative tests are witnessed | NOT RUN |

## Acceptance classification and prohibited shortcuts

- **Synthetic CI PASS** = engineering proof of local, simulated or disposable-DB behavior; **not** hosted staging acceptance.
- **KB-07E SHA match** = evidence bytes equal an operator-entered digest; **not** authenticated witness, trustworthy test execution, legal consent or project ownership.
- **Protected-environment variable present** = configured string checked; **not** independently verified GitHub reviewer enforcement.
- **Manually approved project** = owner-approved budget and isolated project evidenced; **not** permission to apply all knowledge SQL, crawl, access real accounts or deploy.
- **Sixteen externally attested independent acceptances** are required, **plus** separate legal, cost and release authorization. A count alone is not a release gate.

## Current final result

`stagingProjectProvisioned=false`; `protectedReviewIndependentlyVerified=false`; `retentionPolicyApproved=false`; `liveOwnerTenantAcceptance=0/16`; `canGrantConsent=false`; `canCrawl=false`; `canApproveKnowledge=false`; `canMerge=false`; `canDeploy=false`.

**No hosted SQL, staging login, paid provisioning, source crawling, data deletion, knowledge mutation, environment settings change, GitHub merge, or production deployment is authorized by this review packet. DRAFT / DO NOT MERGE.**
