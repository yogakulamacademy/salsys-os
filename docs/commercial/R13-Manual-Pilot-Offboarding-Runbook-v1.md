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
