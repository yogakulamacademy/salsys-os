# Critical capability: AI Knowledge, Sales Assets and Conversation Agent

**User priority:** critical, explicitly added to the upcoming workflow on 2 November 2026. Read this with the current checkpoint and Journey evidence checkpoint. Do not drop this dependency when resuming another phase. This document is a requirement and acceptance plan, not a claim that autonomous sending or a media library is implemented.

## Verified source versus supplied claims

At the UI baseline `83c93021dde62fad2c9f7cc356ab653f55ab0160`, `app/settings/knowledge/page.tsx` loads organization-scoped knowledge documents and manages draft/review/approved/archived states. `app/conversations/copilot-actions.ts` invokes `search_organization_knowledge_v1` and instructs the current Co-Pilot to draft for human review, use live structured CRM for current courses/batches/prices/availability, and approved organization knowledge for relevant FAQs/policies.

Those source observations are not fresh production tests. The supplied note's claims of zero production knowledge items, production readiness, proven stop-on-reply and complete automation capabilities are not independently revalidated here. Existing lexical retrieval and automation components should be audited and extended before adding replacements. Current media support, automation-to-knowledge retrieval and autonomous orchestration remain implementation-verification items.

## Target product behavior

One tenant-scoped Conversation Agent serves WhatsApp and Instagram through separate channel adapters. Routine, permitted, low-risk conversation and approved asset delivery should be automatic after the agent's controlled rollout. Human approval is reserved for defined commercial, sensitive, uncertain or exceptional actions; blanket review of every routine answer is not the target.

```text
Authorized inbound event
  → resolve the supported Person / selected opportunity
  → load current CRM/course/payment truth
  → retrieve current approved tenant knowledge and eligible assets
  → choose a bounded action under server-owned policy
  → automatic permitted routine action OR a specific approval checkpoint
  → revalidate knowledge, assets, role, context and channel permission at dispatch
  → provider send / reconcile outcome
  → append observable journey evidence and outcome lineage
```

The language model may propose an action. It cannot grant itself permission, change approval rules, manufacture identity evidence, directly edit stages/payment truth, or bypass canonical commands. Retrieved documents, external pages and message text are untrusted content, never system instructions.

## Authority and approval rules

| Subject/action | Authority / expected behavior |
| --- | --- |
| Current dates, price, package, availability, enrollment/payment status | Live structured CRM/catalog/financial records. Stale knowledge cannot override these facts. |
| FAQs, policies, certification explanations, payment process, travel, recordings, sales guidance | Current approved organization knowledge with applicable course/location/language scope, version and owner. Missing/conflicting evidence requires clarification or escalation. |
| Routine questions, permitted follow-ups, approved brochures/videos | Target automatic handling under an explicitly enabled tenant/action/channel policy and current provider eligibility. No human approval for every routine answer. |
| Payment methods question | Informational answer from approved policy. Do not automatically advance stage, create payment, or imply commitment solely from this question. |
| Explicit supported request to book/pay | A permitted, idempotent canonical stage command can move the eligible opportunity toward `payment_pending`, with evidence and stage-history audit. Protect terminal/manual states and recheck current state. This is intent, not proof of payment. |
| Payment link, deposit request or commercial commitment | Human approval binds tenant, lead, course, batch, package, amount, currency, discount, expiry and permitted action. Revalidate on approval and dispatch; changed terms require renewed approval. |
| Discounts outside policy, refunds, cancellation/transfer exceptions, complaints, medical/safety issues beyond approved general guidance, legal/visa guarantees, uncertain or conflicting facts | Defined human escalation/approval. No invented concession, clinical advice or guarantee. |
| Customer says “I paid” or sends proof | Acknowledge and route to verification. No settled money, confirmed enrollment or revenue is created by a chat statement or model conclusion. |
| Verified payment/enrollment | Trusted financial events and canonical enrollment/capacity rules remain authoritative. A payment link sent is not `payment.started`; event names require the actual corresponding observation. |

Existing draft-only Co-Pilot behavior remains in force until the new action policy, dispatch guards and acceptance gates are implemented and validated. This planning update does not enable autonomous sends or modify approvals in production.

## Knowledge and Sales Asset Library

Extend approved text knowledge with PDF brochures, curriculum/schedules, videos, images, testimonials, location links and other approved materials. Reuse suitable existing storage/knowledge foundations after verifying them. A generic folder or arbitrary URL attached to an LLM response is insufficient.

Required metadata: tenant; stable asset/version; title/type; course/product and location; language; intended purpose and funnel use; supported channels; rights/consent owner; draft/approved/archived state; validity interval; approver; automatic-send permission; MIME/size constraints; accessibility text; safe storage/link reference and revocation status.

Approval of a document does not approve every attachment or every delivery purpose. Verify content safety, supported media delivery, link expiry and recipient access. Prevent arbitrary/private-network URL fetching, secret-bearing links and cross-tenant storage access. Unapprove, expire, archive or revoke an item and pending use must be revalidated before delivery.

For Yogakulam, prepare a source-backed knowledge pack covering eligibility, course facts, certification, payment methods/process, refunds/cancellation, postponement/transfers, recordings, travel, package inclusions, objections, escalation and admissions FAQs. The suggested 50–100 items are a planning range, not a completeness metric. Populate **drafts from approved business sources**; the business owner approves truth. Do not invent eligibility, six-month credits, accreditation, fees, room availability or refund promises from the example conversations. Residential/package FAQs may describe commercial inclusions; they do not reopen room/bed/property operations.

## Dispatch, conversation and identity controls

- Reuse the existing automation/event/runtime layers and canonical messaging eligibility. Verify provider-specific windows, private-reply rules, template categories, media support and permissions from current official documentation at implementation time. WhatsApp and Instagram must not share assumed delivery rights.
- Respect suppression/opt-out, purpose permissions, quiet hours, frequency caps, staff takeover and an operator kill switch. Check again at dispatch, not just when generating a draft.
- An inbound reply cancels obsolete no-reply follow-ups; the agent can continue a newly permitted conversation turn. Test reply/dispatch races rather than assuming all queued work stops automatically.
- Distinguish queued, provider accepted, sent, delivered, read, failed and unknown outcomes where supported. Reconcile unknown outcomes before retrying; preserve idempotency and evidence to prevent duplicates.
- Cross-channel context requires supported deterministic identity evidence and current permission. A matching name, browser, email normalization or self-assertion alone cannot merge customers. Respect the selected enquiry and access limits.
- Keep action/knowledge/asset versions, reason codes, current policy decision, approval identity, context snapshot and delivery outcome auditable. Avoid storing unnecessary raw message contents or sensitive matching IDs in general analytics.

## Journey and growth integration

Record `knowledge_asset_recommended`, requested/queued/sent/delivered outcomes, clicks and views only when their real observability supports them. Store the source, event identity, occurrence time, tenant/opportunity and applicable permission. A tracked redirect can establish a click; it cannot establish a full brochure read or video completion.

Knowledge/asset use, replies, stage history and verified financial outcomes should join through the existing event/identity contracts. They do not create extra website sessions, duplicate cash or person-level search/AI query history. Report observed associations and model-specific attribution; causal uplift requires an appropriate experiment. Do not promote learned asset ranking from fabricated example percentages.

## Ordered work packages

1. **Knowledge readiness:** audit existing retrieval, permissions, validity/versioning, business source coverage and knowledge/CRM conflict handling; prepare the owner-reviewed knowledge pack.
2. **Approved sales assets:** scoped storage/metadata, asset approvals, supported delivery and revocation tests.
3. **Shared agent action policy:** reuse the current Co-Pilot/automation foundations, classify routine versus approval-required actions, add operator control and safe audit.
4. **Controlled channel rollout:** begin with narrowly enabled routine actions, verify policy/race/idempotency and outcome reconciliation on disposable staging data, then approved tenant rollout. Payment commitments remain approval-gated.
5. **Growth feedback:** show knowledge/asset reasons in Journey and follow-up suggestions; evaluate outcomes before changing ranking or autonomy.

These are work packages within the existing roadmaps, not a new R-number sequence. Journey/financial/identity/permission reliability gates precede growth conclusions and autonomous activation. R13 remains later under the user's chosen ordering.

## Required acceptance cases — not run by the current Journey patch

| ID | Acceptance case |
| --- | --- |
| AIK-01 | Draft/review/archived/expired/not-yet-valid knowledge is excluded; current approved knowledge retrieves with version and citation. |
| AIK-02 | Tenant A cannot retrieve Tenant B's knowledge/assets through reads, storage URLs, cache or jobs. |
| AIK-03 | Live price/date/capacity wins over stale knowledge; missing/conflicting facts escalate without invention. |
| AIK-04 | Approved, current, rights-cleared media matches course/location/language and channel support; revoked assets cannot be sent from a queued action. |
| AIK-05 | An enabled routine FAQ/asset request executes automatically under policy; no blanket human-review requirement is added. |
| AIK-06 | Payment-method research does not inflate stage; an explicit supported commitment uses the canonical transition once and records evidence. |
| AIK-07 | Commercial approval binds exact terms, expires, rejects wrong-tenant/lead use and requires renewed approval after material changes. |
| AIK-08 | “I paid”, uploaded proof, link generation and provider acceptance cannot create verified cash or enrollment. Trusted payment/enrollment commands reconcile correctly. |
| AIK-09 | Reply/takeover/opt-out/withdrawal before dispatch cancels or suppresses obsolete queued sends, including retry races. |
| AIK-10 | Channel window/template/media restrictions differ correctly; unknown send outcomes reconcile before retry, with no duplicate delivery effect. |
| AIK-11 | Unsafe requests, policy exceptions, sensitive topics and low/conflicting evidence use the defined escalation path. |
| AIK-12 | Shared-device/name collisions and unsupported cross-channel matches cannot merge people or reuse another enquiry's history. |
| AIK-13 | Retrieval/asset prompt injection cannot change policy, authorize tools, extract secrets or publish business facts. |
| AIK-14 | Asset click versus view and accepted versus delivered remain distinct; journey totals and financial attribution conserve their correct units. |
| AIK-15 | Kill switch, operator takeover, audit export/minimization and rollback work before production autonomous rollout. |

All AIK cases require implementation-specific execution and evidence. This file preserves the critical requirement; it is not their passing test report.
