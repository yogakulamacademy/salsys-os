# R13 manual-first pilot — customer cancellation, export and offboarding

Status: DRAFT for operator, owner, privacy and DBA review. Not a published customer policy, legal advice, automated offboarding feature or authorization to execute on any hosted tenant.

Scope: the ten-organization manual pilot in PR #829. Keep permanent Free, the verified Pro trial, manual plan approval and expiry. Gateway, recurring billing, autonomous sends and unaccepted integrations remain off. Legacy organizations are not commercial pilot accounts.

## 1. Distinguish the customer request

| Request | Proposed operator response | Boundary |
| --- | --- | --- |
| Stop paid access at end of agreed term | Confirm no automatic renewal; record requested end and allow existing expiry reconciliation to fall back to Free | Do not terminate early or promise a refund without agreement |
| Immediate downgrade to Free | Confirm verified owner request, impact, approved commercial terms; use governed Free assignment only if eligible and separately authorized | Existing records remain; workspace/usage limits may restrict further use |
| Obtain operational leads CSV | Help the authorized customer use the existing filtered Leads export | Not a complete data portability or statutory privacy export |
| Close workspace / end service | Open manual offboarding case; agree access, data handover, obligations and retention disposition before executing anything | No direct organization deletion; archive/suspension not validated for commercial offboarding |
| Data subject access, correction or erasure | Route to designated privacy owner and the applicable approved privacy workflow | Independent from pricing and Sales entitlement; do not promise automatic deletion |
| Disputed payment or refund | Reconcile verified separate commercial records and escalate to finance/owner | Never record SaaS subscription payments in CRM customer-course payments |

## 2. Case intake and authority

Record case ID, exact organization ID, request type, UTC received time, verified requester and authority, current commercial state, agreed effective date, scope, owner/approver, privacy/finance escalation and evidence references. Keep the case in an approved access-controlled internal record system; no contact exports, secrets or customer evidence in GitHub. Verify requester through the existing authenticated owner channel and organization membership. Do not accept organization slug, forwarded email, a screenshot or an unverified message as sole authority. A data subject need not be an organization owner; route such requests to privacy rather than denying them on commercial grounds. Acknowledge the request without promising unapproved retention periods, refund terms, response SLA or tax treatment.

## 3. Cancellation and downgrade

1. Review exact current plan, subscription revision, approval/expiry, outstanding requests and approved commercial agreement. Never infer payment from activity.
2. Explain distinction between Free fallback and closing an account; show current usage and data preservation. Offer an authorized handover before access changes where possible.
3. For end-of-period cancellation, record nonrenewal in the case. The pilot has no automatic charging or renewal; expiry takes effect at the agreed boundary. Do not invent a cancellation-state transition in the database.
4. For immediate Free downgrade, obtain specific authorization, choose the exact published pinned Free offer and use the governed operator assignment path when eligible. Do not grant access, disable safeguards, alter plan records, backdate contracts or update commercial tables directly. If eligibility or pilot capacity prevents this path, escalate; do not bypass.
5. Read back the effective plan, canonical subscription and audit history. Confirm retained data, usage limits, no unrelated tenant changes and no extra pilot slot for repeat actions. If the scheduler has not yet reconciled expiry, distinguish effective Free from canonical state and track until confirmed.
6. Confirm status to the verified requester through approved support channels. Financial reconciliation remains separate; no automatic refunds, billing or sends.

## 4. Data handover: currently supported vs missing

Source evidence: app/api/leads/export/route.ts and lib/leads-transfer-permissions.ts at #829's reviewed baseline. The operational route is authenticated, session/tenant-bound, requires Sales management access, caps each filtered CSV at 2,000 leads, and separately gates email/phone on PII permission. Mock mode is disabled. The commercial layer may deny Sales import/export after downgrade. CSV is not a snapshot of all CRM data, conversations, documents, activity, billing, integrations or identity/consent evidence. A multi-batch export can change during collection; do not promise complete, consistent records from filtered files without reconciliation.

For an ordinary CSV handover, validate the owner/authorized Sales role and PII scope, agree filters, use the existing UI, record aggregate counts and scope, and transfer only through approved secure channels. Never bypass role or plan checks for an operational export.

For broader contractual portability or a statutory request, open a separate privacy-approved extraction case. Define exact tenant and categories, exclude other tenants and secrets, confirm legal basis/authority, use a reviewed tenant-scoped extraction with independent verification and secure delivery, and record manifest, counts, checksums, exclusions, approved retention and receipt. No general-purpose customer-wide export executor has been demonstrated for this release. If an approved extraction path is absent, keep the case open and escalate; never manually dump shared tables or re-grant access simply to make an export work. Commercial access restrictions cannot substitute for a privacy decision.

## 5. Workspace closure, retention and legal hold

Proposed manual pilot protocol, not permission to execute:

- Confirm verified request, contractual/financial obligations, affected data categories, lawful retention and any legal hold with the designated privacy/finance owners.
- Prepare an approved export/handover or record why it is not required. Verify receipt where appropriate.
- Inventory tenant-specific sessions, membership, tracking sources, inbound/outbound webhooks, provider connections, scheduled jobs, queues, automation, AI, derived search/analytics, files, backups and downstream processors. The existing organization lifecycle statuses are not proof that every worker stops when a tenant is suspended.
- Plan and independently review tenant-scoped isolation, revocation, pending-work handling, retention and restore/recovery. No global provider revocation, queue clearing, direct organization deletion, privilege widening or changes affecting Yogakulam or other tenants.
- Require a tested suspension/archive/reactivation boundary and independent execution authorization before any hosted status change. Until then keep the case open as blocked, or use the approved Free downgrade path if that meets the customer's request. Do not market automatic deletion, suspension or full offboarding.
- Retain only approved audit evidence; apply no new deletion/retention interval without legal approval. Backups and downstream processors require an explicit disposition. Confirm customer outcome only after actual read-back and review.

## 6. Support and incident handling

Proposed initial operator-assisted support: designated primary and backup owner, verified contact channel, restricted case log, triage by access/security, data loss, billing and usage. Owner must approve hours, escalation, response targets, legal and commercial contacts before publication. Security/tenant leakage or destructive data loss is urgent: stop affected operations under authorized incident response, preserve minimal evidence, notify the designated incident lead, and follow approved notification duties. No unapproved SLA or customer-facing promise. Follow docs/SalsysOS_Database_Recovery_Runbook_v1.md for recovery; RPO/RTO remain targets until independently verified. Do not reuse the held R2 recovery environment or restore production as a test.

## 7. Acceptance and evidence gates

| ID | Test with disposable synthetic tenants only | Required result |
| --- | --- | --- |
| O01 | Request nonrenewal and let test contract expire | Effective Free; no automatic charge; canonical reconciliation; retained records |
| O02 | Governed immediate Free downgrade, retry and read-back | Correct pinned limits and audit; no duplicate slot; data preserved |
| O03 | Authorized filtered lead export, no PII grant, wrong tenant, unauthorized role | Correct authorized records; sensitive columns redacted; denial for wrong tenant/role |
| O04 | Request full portability or statutory access while Sales is restricted | Case escalated; no bypass; privacy-approved scoped path and evidence required |
| O05 | Request workspace closure with pending jobs and connected sources | No action until reviewed tenant-specific stop/revocation and retention plan |
| O06 | Legal hold or refund dispute | Hold/escalation recorded; no unapproved deletion or refund |
| O07 | Review recovery/rollback and case completion | Evidence of scope, approvals, customer disposition, independent recovery readiness and no cross-tenant impact |

Record exact SHA, isolated environment, expected/actual result, pass/fail, redacted evidence and responsible reviewer. All seven cases are planned, not witnessed by this document. O01/O02 may reuse exact local Auth and database evidence for the overlapping mechanics only; human case handling remains untested. Do not claim complete P4 from this runbook.

## 8. Release decisions (unapproved)

Before first real pilot customer: approve business entity and support contacts, actual prices/GST/invoicing and refund/cancellation terms, data processing and privacy policy, export scope, retention/deletion/legal hold procedures, backup/recovery objectives and owner/DBA/privacy authority. Confirm whether this limited operator-assisted scope is accepted for the manual pilot or full P4 implementation is required first. No real accounts, commercial activation, hosted data export, production writes, paid infrastructure or scope waiver authorized by this document.

References: R13 audit/design V1, R13-Browser-Acceptance-v1.md, R13-Manual-Pilot-Launch-Configuration-v1.md, PR #829, PR #830, roadmap #518 and revenue-first #651.

## 9. Consolidated release acceptance evidence and decisions — 2026-11-24

This is a partial evidence record, not a signed release. The integrated application/schema candidate is PR #829 at `eec8a45f8f98f256ef630cac4742698ede1f5a16`. Its four workflows completed successfully: [CI](https://github.com/yogakulamacademy/salsys-os/actions/runs/45389571607), [Migration Replay](https://github.com/yogakulamacademy/salsys-os/actions/runs/45389571253), [CodeQL](https://github.com/yogakulamacademy/salsys-os/actions/runs/45389571203), [Self-host image](https://github.com/yogakulamacademy/salsys-os/actions/runs/45389571407). Stacked test-only PR #830 at `7ae9abd058add65d983d83f74e50e1f2915069d9` passed [disposable real Auth/API lifecycle replay](https://github.com/yogakulamacademy/salsys-os/actions/runs/45392162448) including cleanup. Test actors and offers were synthetic, while customer Auth sessions were issued by the real disposable Supabase Auth server. Operator actions used governed service-role RPC with a synthetic operator, not an interactive administrator login. PR #832 at `dc2d8848a639dc92246bf1b6d6b32a23f6f5ce50` [browser workflow](https://github.com/yogakulamacademy/salsys-os/actions/runs/45392577246) was in progress at this checkpoint. No result inferred. All PRs remain drafts.

| Case from R13-Browser-Acceptance-v1 | Verified evidence on exact green heads | Still required to mark full case passed |
| --- | --- | --- |
| B01 | Source/behavior origin and flag checks in #829 | Actual browser flag-off and invalid origin |
| B02 | Source/behavior CAPTCHA validation checks in #829 | Browser submission rejection and no intent/workspace; #832 planned |
| B03 | Real local Auth reservation, signup and email capture in #830; no provisioning before verification | Successful browser registration with real valid CAPTCHA and neutral notice |
| B04 | Actual local email verification through Auth API in #830 | Original browser PKCE HTTPS callback; #832 planned |
| B05 | Idempotent real API provisioning and sign-in retry, synthetic resend controls | Actual browser replay/expiry/resend and quota evidence |
| B06 | Two real customer Auth-issued JWTs, tenant-bound trial dashboard and one counted named user in #830 | Finish full browser onboarding and subsequent sign-in |
| B07 | Real customer RPC plan, history and usage results in #830 | Actual subscription UI and no checkout |
| B08 | Real customer JWT denied operator RPC in #830 | Direct admin URL and server-action denial in browser |
| B09 | Governed service-role enrollment, retry, unchanged access and zero slots in #830 | Verified interactive operator login and server action |
| B10 | Real customer Basic request and operator Growth override, superseded original and activation history in #830 | Customer and interactive operator browser paths |
| B11 | Real customer dashboard after manual renewal and permanent Free assignment; one slot and pinned quotas in #830 | Browser actions, retained CRM records and approved commercial terms; database synthetic coverage does not replace browser evidence |
| B12 | Disposable database expiry and reconciliation tests in #829 | Actual protected expiry HTTP route, both trial/manual fixtures, pre/post effective/canonical Free and repeat invocation; deployed scheduler and monitoring remain separate |
| B13 | Two distinct real customer sessions, cross-tenant binding and withdrawal denied, other subscription unchanged in #830 | Actual browser and representative CRM data isolation |
| B14 | Source/SQL flag boundaries in #829 | Browser pause with existing enforcement, reconciliation and legacy tenant regression |

Full browser acceptance: 0/14 complete at this evidence cut; the narrower local API lifecycle has passed. Do not report partial evidence as full acceptance. O01–O07 remain planned, including approval of the human case process. No external SMTP, live customer, live CAPTCHA, production grant or hosted database migration is evidenced.

### Consolidated approval record (fill before release)

| Decision or approval | Current disposition | Required signer/evidence |
| --- | --- | --- |
| Permanent Free, verified 14-day Pro trial, ten distinct manual pilot organizations (not registration cap), gateway deferred | Prior product scope decision | Preserve; any change needs explicit owner approval |
| Exact plan snapshots, pricing, quotas, workspace scopes, connection eligibility, GST, optional setup charge and manual term limit | Proposals in R13-Manual-Pilot-Launch-Configuration-v1; no publication | Commercial owner; record exact approved version/digest for every plan |
| Customer-facing terms, refunds, cancellation, support contacts/hours, privacy and retention/legal hold | Not approved; no promises made | Designated commercial/legal/privacy owners; approved policy version |
| Operator-assisted offboarding for limited pilot versus full P4 before pilot | Proposed in this runbook, not waived | Commercial owner + privacy/DBA approval, O01–O07 evidence |
| Catalog author/reviewer/publisher and dedicated pilot approver; exact platform organization | Not granted/configured | Independent authority review, verified identities and least-privilege grant record |
| Security/DBA review and reviewed versioned migration sequence | Outstanding | Independent named reviewers; review exact integrated SHA, grants, rollback, no overlap from #826/#827/#828 |
| Production recovery baseline and deployment approval | NO-GO | Approved target, backup/rollback evidence, smoke and explicit release authorization |

Record each signer, approval timestamp, scope, exact artifact revision/digest and unresolved exception. Never record service keys, personal data, payment references or verification URLs in the PR. No new paid staging or reuse of the held R2 environment. The exact consolidated head needs fresh CI and acceptance evidence before release. The owner has not waived independent review or full acceptance merely by requesting engineering continuation.
