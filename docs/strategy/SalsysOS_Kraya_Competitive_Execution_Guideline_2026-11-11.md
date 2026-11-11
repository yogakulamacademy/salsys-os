# SalsysOS — Kraya-Informed Sales Execution & Revenue Intelligence Guideline

**Version:** 1.0 — proposed product direction  
**Date:** 2026-11-11  
**Status:** DOCUMENTATION / ROADMAP ONLY — not a feature release or authorization to code, merge, send, deploy, enable tracking or alter customer data  
**Product:** SalsysOS — Sales + Analysis Operating System  
**Primary roadmap:** GitHub issue #518  
**Source of operational truth:** docs/SalsysOS_Current_Checkpoint.md, docs/SalsysOS_Active_Handoff.md and current GitHub/deployment evidence

> Decision: Improve the daily AI sales-execution loop toward Kraya's documented product experience, but **differentiate through evidence-backed customer journeys, verified commerce and attribution, vertical-specific context, and explainable next actions**. Do not clone Kraya, create R15, or break existing V1 closeouts.

## 1. Strategic objective

SalsysOS should connect **discovery → visitor/attribution → lead → multi-channel conversation → qualification → human/AI action → follow-up → verified payment/enrollment → revenue → learned recommendations**.

The highest-value user promise is: **No eligible lead is silently lost; every action is controlled, contextual and measurable; owners see where actual revenue comes from.**

This document is a forward-looking supplement, not a rewrite of the canonical R0–R14 roadmap. It incorporates public competitor documentation and internal SalsysOS planning. Do not label proposed capabilities as delivered; do not label a source-platform metric as person-level evidence unless the underlying provider actually supplies it.

## 2. Benchmark scope and evidence (as of 2026-11-11)

Kraya's **publicly documented** product includes:
- WhatsApp-first lead CRM, AI-generated replies and qualification, conversation summaries and configurable intent criteria.
- Instagram professional-account DM capture, shared manual inbox, gated AI replies/qualification, messaging-window controls, optional lead creation and limited bump-ups.
- Scheduled WhatsApp/API-template/email follow-up sequences, reminders, recurring steps, message-status gating and AI-call steps.
- Smart rules for stage changes, inactivity, keywords, follow-ups, assignment and template sends.
- Sales Co-Pilot, call-tracker and optional AI voice-call workflows.
- Done-for-you onboarding and outcome-oriented commercial packaging.

Evidence:
- https://docs.kraya-ai.com/docs
- https://docs.kraya-ai.com/docs/ai-automation/ai-qualification
- https://docs.kraya-ai.com/docs/platform/instagram
- https://docs.kraya-ai.com/docs/ai-automation/auto-followups
- https://docs.kraya-ai.com/docs/ai-automation/smart-triggers
- https://docs.kraya-ai.com/docs/ai-automation/ai-voice-calls
- https://kraya-ai.com/pricing

These are **vendor documentation claims**, not independently witnessed competitor performance. Published conversion uplift, speed or ROI figures must never be treated as a SalsysOS baseline or guaranteed outcome. Provider rules and pricing may change: re-check official Meta/Instagram/WhatsApp rules before implementing sends.

## 3. Current SalsysOS baseline — prevent false parity claims

**Existing foundation / adopt and verify rather than rebuild**
- Leads, Pipeline, Conversations, Follow-ups, employee ownership, Customer/Person 360, Journey evidence, campaign/funnel/attribution/SEO and revenue views exist in the product/repository.
- Current roadmap records R0/R1 and multiple R3/R4/R9/R10/R11 V1 closeouts; V1 closeout does not equal delivery of every enhancement in this guideline.
- Official messaging/Instagram integration components and automation interfaces exist; verify actual enabled provider access, tenant data path, and user acceptance for any claimed end-to-end feature.
- Existing education/wellness pack supports course/batch and package-preference sales context. **R11 V1 expressly excludes** room/bed inventory, property operations, physical room allocation or accommodation management. Do not reintroduce those features under this comparison.

**Outstanding gates at document creation**
- R2 is **not release-closed**: security/consent/lead-reliability review and 0/16 witnessed staging acceptance; optional behavior collector remains OFF. Follow #518/#531 and existing scope.
- AI/Knowledge Builder integration PR #671 is draft. Independent governance/safety reviews #676/#678/#679 remain pending, with Co-Pilot remediation #692 and Knowledge manual-source RPC issue #695 also open.
- WhatsApp Template Studio draft-name fix #691 merged on 2026-11-11, but signed-in draft acceptance and separately gated Meta submission/customer sends are not implied by SQL checks. Do not conflate local draft with Meta-approved template.
- Instagram-app outbound history/echo remains separately deferred under #517; flags must remain OFF absent authorized acceptance.
- R13 commercial plans/entitlements/billing remain design or draft, not live SaaS subscriptions; R14 first-customer planning #651 requires genuine payment and security evidence.
- Current checkout/payment provider truth must be independently verified; do not infer paid enrollment from CRM stage, form submission or browser event.

All statuses must be **re-verified from the latest repository, deployment, signed-in UX, provider connection and migration ledger before starting a checkpoint**.

## 4. Competitive product assessment and chosen strategy

| Capability | Kraya documented | SalsysOS position | Decision |
|---|---|---|---|
| Instant AI lead response | Product feature | Controlled agent not fully released | **Close execution gap**, only after AI/provider gates |
| AI discovery and qualification | Business-configurable | Intent/Co-Pilot groundwork, release-gated | **Build evidence-based qualification** |
| WhatsApp + Instagram journey | Both channels documented | Integration groundwork, end-to-end AI unaccepted | **Unified provider-neutral orchestration**, channel-specific rules |
| Timed multi-step sequences | WhatsApp/email/reminder/voice | Automation/follow-up foundations, no completed agent pilot | **Add governed sequence state machine** |
| Smart triggers | Broad sales events | Workflow/automation surfaces exist | **Extend safely**, never duplicate engines |
| Rep guidance/Co-Pilot | Sales-script convenience | Co-Pilot safety work pending | **Next Best Action with reason/evidence** |
| Call intelligence | Manual + optional AI voice | Not verified as released | **Defer voice; start with lawful call outcomes** |
| Marketing → revenue | Competitor sales focus | SalsysOS deep journey/attribution ambition | **Protect and validate differentiator** |
| Industry playbooks | Generic/custom configuration | R11 education/wellness V1 | **Ship compact preconfigured sales packs** |
| Commercial self-service | Productized offering | R13/R14 incomplete | **Commercialize only after readiness gates** |

**Non-goals:** copying browser-session automation as core transport; another generic CRM; automatic discounts/refunds/seat guarantees; invented AI success rates; room inventory; broad autonomous ad budget mutations; new paid staging without owner approval; unnecessary model/router/MCP duplication.

## 5. Feature workstreams (proposed, no build approval)

### SX-00 — Existing release and trust prerequisites (P0 / dependency)

**Why:** Do not stack autonomous messaging on an unapproved retrieval/agent/permission foundation.

**Work:** close the *specific* existing R2, AI, Knowledge Builder, tenant, consent, Co-Pilot and provider gates. Resolve verified issues such as #677/#692 and #694/#695. Complete independent code/DBA/privacy review as applicable; no synthetic CI promoted to real acceptance. Preserve rollback, staged no-send barriers, and approved manual staff Co-Pilot behavior.

**Exit:** witnessed tenant/RBAC, evidence freshness, current-request risk precedence, payment/refund/room/discount claim guards, safe kill switch, controlled staging tests and separate owner release decision.

**Maps:** R1/R2/R3/R6/R7; dependencies #518, #531, #671, #677 and #695.

### SX-01 — Unified channel-neutral Lead Qualification engine (P1)

**Customer experience:** A new WhatsApp or Instagram message is ingested once, linked deterministically where authorized, and shown on the lead timeline. The approved AI proposes one context-aware question at a time, retrieves current approved KB/business data, records course/service/product interest, dates, location, urgency, budget as appropriate, objections, evidence and confidence.

**Rules:** identity merging is never inferred just from look-alike names; unknown values remain unknown; keep product-specific privacy boundaries; avoid storing medical/sensitive inferences for targeting; summarize with cited source/message IDs. Human takeover pauses AI. Model output cannot itself authorize privileged changes.

**Build on:** existing conversation adapters/Co-Pilot/KB/lead stage history; configurable tenant prompt version, retrieval citations, deterministic intent fallback and access-controlled tool registry. MCP is optional interoperability, not a release prerequisite or authorization bypass.

**Acceptance:** no unauthorized replies; tenant A cannot see tenant B; qualification reason and source visible; unknown/contradictory pricing handled by escalation; duplicate/replayed inbound events do not duplicate leads or sends; phone number must not be assumed from Instagram username.

**Maps:** R3/R4/R6/R7, R11.

### SX-02 — Governed Follow-up and Lead Recovery engine (P1)

**Customer experience:** configurable playbooks for new lead, unanswered enquiry, qualified lead, deposit pending, no-show, stale lead, reschedule, dormant lead. Steps may propose or—only when allowed and explicitly enabled—send approved channel content, create tasks, assign owners, or escalate.

**Core state:** planned → due → eligibility_checked → approval_wait/queued → provider_accepted → delivered/failed/expired/cancelled, with separate customer reply/takeover/outcome state. Provider acceptance is NOT delivery; delivery is NOT read; read is NOT conversion.

**Guardrails:** event/outbox idempotency, retry caps, suppression/STOP, opt-in purpose, quiet hours/time zone, per-channel window/template/permission checks, consent withdrawal, manual override, eligible-identity confirmation, message-rate/cost limits, human approval of sensitive copy, never auto-send when provider permission is unknown, stop-on-reply + concurrent dispatch tests.

**WhatsApp:** outside the eligible service window, use eligible Meta-approved templates and applicable opt-in; local draft status alone is insufficient. **Instagram:** obey its separately validated messaging restrictions; do not assume WhatsApp template policy applies to DMs.

**Acceptance:** synthetic and witnessed positive/negative send tests; no send on STOP, opt-out, already-enrolled, expired window or takeover; one and only one send after retries; clear failure reason and recovery task; approval-revocation and time-of-check/time-of-use tests.

**Maps:** R3/R7/R11.

### SX-03 — Salesperson Next Best Action and conversational Co-Pilot (P1/P2)

**Customer experience:** minimal employee “Work Next” inbox (not another busy dashboard): priority, why now, conversation summary, evidence, verified facts, editable recommended reply and single approved action. Manager sees queue fairness and SLA risk. Product must allow manual use if AI is unavailable.

**Starting logic:** explainable deterministic rules with configurable thresholds; label observational vs inferred signals; no purchase probabilities or forecast percentages without calibration on real outcomes. Record recommendation, version, displayed reason, human override and eventual outcome.

**Suggested action types:** respond, ask missing qualification field, provide approved asset, verify price/availability, schedule follow-up, request deposit confirmation from trusted payment provider, escalate dispute. Do not auto-confirm payment/refund/discount/booking.

**Acceptance:** auditability, employee assignment/RBAC, no sensitive data outside scope, safe mobile empty/error states, time-to-action measurable, useful reviewer evaluation.

**Maps:** R3/R6/R10.

### SX-04 — Revenue attribution and conversion learning (P2 / differentiator)

**Customer experience:** owner sees lead-source + conversation + salesperson/action + verified payment/enrollment journey with evidence labels; dashboards show lead-to-qualified, qualified-to-paid, follow-up effects, CPL, CAC, verified revenue and cost of AI/provider operations.

**Data contract:** distinguish observed, exact-matched, aggregate, inferred and modeled. Trusted commerce/webhook reconciliation is authoritative; a website page view is not a payment. Never claim a specific ad impression or cross-device event without evidence. No arbitrary “AI lifted conversions by X%” claim.

**Learning loop:** log intervention and outcome; cohort-aware baselines and controlled rollout; compare channels and segments; investigate contamination/seasonality; report uncertainty and negatives; introduce model-based priority only after genuine calibrated samples.

**Acceptance:** financially reconciled examples, privacy-conscious exports, known unattributed cases, audit of revenue matching, explicit denominators, no unsupported causal wording.

**Maps:** R2/R4/R5/R6/R8/R9/R10.

### SX-05 — Compliant calling activity; AI voice only if proven useful (P3 / optional)

Start with owner/employee call tasks, outcomes, timestamps and optional consensual notes. Only later evaluate provider-neutral voice calls/transcripts subject to consent/law, published provider permissions, retention, cost and security review. Voice dispatch is OFF by default; no unsolicited or unauthorized recording/calling.

Acceptance is separate from the messaging release; measure actual incremental recovered deals and cost per verified conversion before investing further.

**Maps:** R3/R7/R10, possibly R13 plans.

### SX-06 — Onboarding, reusable vertical sales playbooks and commercial proof (P2/P3)

Prepare easy-to-configure packs for education/wellness: course dates, mode, package preferences, early qualification, FAQs, objection handling, deposit verification, deferrals and follow-ups. Preserve R11 V1 scope exclusion of physical accommodation inventory. Use provider-neutral business data; no hard-coded Yogakulam customer logic. Real estate remains R12 **after R14**.

A second pack or commercial SKU requires actual pilot learning. R13 handles plans/billing/entitlements without conflating them with live capability flags. R14 handles truthfully demonstrated first-customer ROI; do not manufacture testimonials or claims.

**Maps:** R11/R13/R14; R12 deferred.

## 6. System architecture (target, not deployed)

1. **Official provider adapters** — WhatsApp Cloud API / Instagram permitted APIs / email as contracted; webhook signature verification and per-tenant accounts.
2. **Ingestion + identity** — canonical event, dedupe, safe external-ID matching, authorized person/lead linkage.
3. **Conversation state** — observed events, channel windows, latest inbound and human takeover.
4. **Governed AI** — tenant approved prompt versions, source-backed RAG, safe classification and output filtering, role/tool gates, no unverified privileged actions.
5. **Decision policy + workflow** — rules and eligibility snapshot, approvals, transitions, idempotent scheduler/outbox, rate/budget control.
6. **Human workspace** — one prioritized action queue, review/edit/send, context, explanations, escalation.
7. **Verified commerce + analytics** — trusted payment/enrollment events, observed attribution, intervention ledger, honest cohort measurement.
8. **Observability and operations** — per-tenant logs, approval history, failure queues, retries, rollback and kill switch.

**Trust boundary:** AI suggests; server code authorizes. Provider acknowledgements are not business outcomes. Protected financial and customer data must be read only by valid tenant-scoped roles. No credentials in prompts, documentation or client-side bundles.

## 7. Delivery order and R0–R14 journey placement

Do not renumber phases and do not reopen accepted V1 scope merely to increase the denominator.

| Sequence | Work package | Roadmap placement | Begin condition |
|---|---|---|---|
| 0 | SX-00 Security, privacy, KB/Co-Pilot review, R2 acceptance | R1/R2 and AI cross-phase | Continue existing reviews; no new writes implied |
| 1 | SX-01 Staff-assisted qualification, source-backed draft, no autonomous send | R3/R4/R6/R7 | Approved AI/KB read-only gates and synthetic evaluation |
| 2 | SX-01 Controlled low-risk inbound AI pilot | R3/R6/R7 | Signed-in witnessed acceptance, channel permissions, owner approval |
| 3 | SX-02 Sequences, template eligibility, silence/reply and takeover engine | R3/R7/R11 | Consent, idempotency and provider sandbox acceptance |
| 4 | SX-03 Employee Work Next recommendations | R3/R6/R10 | Safe evidence feed + staff workflow verification |
| 5 | SX-04 Intervention-to-verified-revenue analytics | R2/R4/R5/R10 | Trusted payment/enrollment event evidence, R2 gates |
| 6 | SX-06 Vertical productization and managed-pilot proof | R11/R13/R14 | Owner-approved price/terms and legal pilot prerequisites |
| 7 | SX-05 Voice/call expansion if ROI warrants | R3/R7/R10 | Separate privacy/provider/cost approval |
| Deferred | R12 Realty pack | R12 | Only after R14 per issue #518 |

Current approved execution order remains **R0 → R1 → R2 → R3 → R4 → R5 → R6 → R7 → R8 → R9 → R10 → R11 → R13 → R14 → R12**, with specific V1 closeouts preserved. This plan **does not shift the current review/staging hold**.

## 8. User-facing flows to validate

### Flow A — inbound enquiry
A lead asks about a course on Instagram → ingest once → search existing lead using permitted identifiers → fetch current approved course dates and package information → draft/ask one qualifying question → save source-backed interest → route if high intent → staff accepts/rejects. No phone number is invented; no automatic off-window DM.

### Flow B — silence
Lead requests details but does not reply → approved sequence eligibility checked → schedule permitted task/template → stop if lead replies, opts out, changes owner, is marked closed or moves to human takeover → record attempt, provider status and result. No repeat storm.

### Flow C — payment intent
Lead asks for deposit link → verify product, price/currency and authorized link → human review where required → provide verified information → record **pending**, not paid. Only trusted payment gateway/finance evidence can confirm paid/enrolled status.

### Flow D — objection or sensitive request
Lead raises refund dispute / missing transfer / special discount / health-sensitive question → deterministic latest-message risk floor + human-only or review route → AI may summarize and cite internal policy; cannot promise refund, diagnosis, discount or booking without trusted proof and approval.

### Flow E — reporting
Owner asks “Which source and actions produced confirmed bookings?” → return reconciled cohort funnel with match-quality labels and counterexamples; do not extrapolate customer-level ad exposures or attribute causality from temporal correlation.

## 9. Acceptance scorecard

**Release-blocking zero-tolerance categories (test suite and witnessed scenarios):**
- Cross-tenant/private lead exposure or unauthorized role escalation.
- Send outside permitted channel/purpose/window, after opt-out or after manual takeover.
- Duplicate external sends on replay/race/retry, unlogged privileged actions, stale revoked KB used as authority.
- Unsupported affirmative payment/refund/discount/enrollment/availability guarantees.
- Marking synthetic QA as live staging/user acceptance or unverified payment as revenue.

**Observed business metrics (no invented numerical target before baseline):**
- Median and 90th percentile first eligible reply latency.
- Eligible lead coverage, no-response backlog and SLA breaches.
- Qualified leads with required fields **and evidence**, not merely scores.
- Human takeover rate, false escalation and AI correction rate.
- Scheduled vs completed follow-ups; unnecessary follow-up rate.
- Lead-to-deposit and lead-to-confirmed-enrollment conversion, by source/cohort.
- Salesperson time-to-next-action and action adoption.
- Verified recovered revenue and cost per incremental paid outcome.
- AI/model tokens, provider credits, messaging fees, failed sends and manual review costs.
- Attribution coverage and missing/uncertain source diagnostics.

**Experiment contract:** measure a documented baseline (proposed: 30 days if enough activity), then run a controlled and consent-compatible pilot against an appropriate manual-workflow comparison. Segment by channel, offer and country; use sufficiently long booking windows; avoid presenting descriptive before/after as causal uplift. Define sample-size feasibility before claiming statistical significance.

## 10. Operating and approval model

- **Owner/product:** approves business objective, target segment, messages, quantitative outcome goals after baseline, launch/rollback and commercialization.
- **Security/DBA/privacy:** independently review migrations, tenant RBAC/RLS, logging, retention, consent and backup/rollback.
- **AI/knowledge reviewer:** checks approved sources, freshness/revocation, adversarial prompts, risk routing, unsupported claims and model-eval coverage.
- **Channel/provider operator:** authorizes Meta/Instagram business accounts, templates, opt-in and permitted send windows; owns provider reconciliation.
- **Sales staff:** validate real workflows, override wrong recommendations and witness live acceptance.
- **Release lead:** performs separate gate verification for documentation, merge, staging, provider activation and production; no implied approval across gates.

**Required evidence for each SX checkpoint:** repo SHA, exact scope, current production/staging states, security/privacy review result, fresh signed-in test record, tenant isolation result, representative negative cases, comparison metrics, known failures, rollback evidence, and owner release approval. Stage rollout: disabled → read-only/draft → human-review-only → tiny authorized pilot → monitored expansion.

## 11. First implementation session AFTER review

1. Read current issue #518, #531, #677 and PRs #671, #676, #678, #679, #692, #695; inspect latest main/deployment/migration/permissions. Do not assume the dated list is still current.
2. Reconcile existing Knowledge Builder and Co-Pilot gaps; finish active independent review and staging blockers before considering automation activation.
3. Audit existing R3/R6/R7/Automation/Inbox modules to identify exact reusable contracts and missing capabilities, **without building duplicate schedulers or event stores**.
4. Produce a narrow SX-01 acceptance contract for **staff-reviewed WhatsApp + Instagram qualification drafts**, including human takeover and per-channel permissions.
5. Write independent negative tests and permission checks first. Implement on a controlled branch after explicit approval; no customer messaging, production database mutation or merge as a side effect of roadmap planning.

## 12. Traceability and change control

- **Primary roadmap order:** https://github.com/yogakulamacademy/salsys-os/issues/518
- **R2 staging and consent blocker:** https://github.com/yogakulamacademy/salsys-os/issues/531
- **AI safety findings:** https://github.com/yogakulamacademy/salsys-os/issues/677
- **AI integration candidate:** https://github.com/yogakulamacademy/salsys-os/pull/671
- **Co-Pilot remediation:** https://github.com/yogakulamacademy/salsys-os/pull/692
- **Knowledge RPC remediation:** https://github.com/yogakulamacademy/salsys-os/pull/695
- **Instagram outgoing hold:** https://github.com/yogakulamacademy/salsys-os/issues/517
- **Revenue-first pilot policy:** https://github.com/yogakulamacademy/salsys-os/issues/651
- **Canonical product:** docs/SalsysOS_North_Star_Product_Context.md
- **Preserved execution handoff:** docs/SalsysOS_Next_Workflow.md

**Approval classification:** This guideline is *proposed direction*; no spending, deployment, new customer contact, external integration activation, automatic WhatsApp/Instagram/voice messages, or product/commercial policy amendment is authorized by its publication.