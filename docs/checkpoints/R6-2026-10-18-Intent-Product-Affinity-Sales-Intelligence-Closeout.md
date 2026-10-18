# R6 Closeout — Intent, Product Affinity & Sales Intelligence

Date: 2026-10-18
Branch: `feature/system-intelligence-v2`

## Status

R6 baseline is closed for the currently defined product scope.

R6 provides a tenant-safe, explainable sales-intelligence layer that keeps observed CRM facts, behavioural evidence, product affinity, objection evidence and deterministic operating guidance separate. It does not treat modelled intent as authoritative CRM state and does not claim predictive conversion probability.

## Canonical R6 chain

`CRM intent → behavioural evidence → derived intent → Person-level product affinity → objection evidence → sales priority → deterministic next action`

## Verified production read models

- `v_lead_sales_intelligence`
- `v_person_course_affinity`
- `v_person_course_recommendation`
- `v_lead_sales_intelligence_v1`
- `v_lead_objection_summary_v1`

The canonical intelligence views are security-invoker reads and anonymous access is revoked.

## Intent model

R6 deliberately separates:

- stored CRM intent
- derived intent
- intent confidence
- intent basis
- explainable reason codes
- behaviour temperature / engagement
- sales priority / urgency
- product affinity

The canonical model does not overwrite `leads.intent` or `leads.interested_course_id`.

## Product affinity

Course affinity combines only resolved Person-level evidence:

- explicit CRM course interest
- server-captured course selection
- resolved website behaviour when the event can be safely attached to the canonical Person

Anonymous browser activity is not silently attached to a Person.

Production validation on the active Yogakulam tenant found:

- 31 Leads
- 31 Leads linked to a canonical Person
- 24 Persons with resolved course-affinity evidence
- 0 Person-mapping conflicts in canonical lead sales intelligence
- 0 affinity Person tenant mismatches
- 0 affinity Course tenant mismatches
- 0 recommendation rows without affinity evidence
- 0 recommendations pointing to inactive Courses

## Objection intelligence

R6 adds a dedicated structured objection evidence model rather than encoding objections inside free-text summaries or derived intent.

Supported operator lifecycle:

`record observed objection → keep active blocker → resolve blocker → retain history`

Baseline objection categories include price, timing, trust, schedule, location, accommodation, certification, health, travel, payment, family, work and other.

The initial operator workflow records human-observed evidence only. Future model classification can use the same evidence model with explicit provenance and confidence, but is not part of this baseline.

Production integrity validation found:

- 0 objection ↔ Lead tenant mismatches
- 0 objection ↔ source-message mismatches
- 0 active objections carrying `resolved_at`
- 0 resolved objections missing `resolved_at`
- 0 objection-summary row-count mismatches

## Operator surfaces

- `/sales-intelligence`
  - stored and derived intent
  - confidence / basis
  - behaviour and engagement
  - strongest product affinity
  - product recommendation evidence
  - active objections
  - priority and deterministic next action

- `/leads/[id]/objections`
  - record explicit customer objection
  - factual evidence note
  - active blocker list
  - resolve objection
  - resolved history

- Lead detail links objection handling back into the operational Lead workspace.

## Deterministic guidance boundary

Sales priority and next action remain deterministic operating guidance. They may use current stage, reply pressure, follow-up state, payments, behavioural return and other current evidence, but they are not probability predictions.

Predictive enrolment/payment probability, learned lead scoring, revenue forecasting and historical outcome calibration remain R10 scope.

## Security boundary

- tenant IDs are validated through the current workspace context
- objection writes validate that the Lead belongs to the current organization
- objection records use RLS
- read views use `security_invoker = true`
- anonymous access is revoked
- historical objection evidence has no delete path in the baseline operator workflow

## Build verification

The R6 operator implementation reached a green Vercel build after correcting the Next.js server-action module boundary so that `use server` exports async functions only.

Verified green implementation commit before this closeout:

`f33fe99804e093a7144c6426d8cbb4a2f1a67556` — Fix objection workspace server imports

## Scope boundary / deferred work

The following are intentionally not blockers for R6 baseline closeout:

- automatic objection extraction from conversations
- predictive conversion/payment probability
- learned lead priority weights
- salesperson matching
- learned follow-up timing
- revenue forecasting

Those belong primarily to R10 after enough real outcome evidence exists.

## Closeout decision

R6 baseline: **COMPLETE**.

Next phase: **R7 — Integrations & Conversion Feedback**.
