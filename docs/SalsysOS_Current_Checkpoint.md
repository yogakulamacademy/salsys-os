# SalsysOS Current Checkpoint

**Date:** 2026-10-30  
**Canonical repository:** `yogakulamacademy/salsys-os`  
**Active redesign branch:** `phase-6a-violet-foundation`  
**Current release-candidate head:** `3b2714e413b1ae5378cce1c12abf195237f69999`  
**Primary Supabase project:** `doaozrkrtgeslddwhclj`  
**Primary Vercel project:** `prj_oNvjC0PwwNEAHHlES3xyP36lISAy` (`salsys-os`)

This file is the canonical operational checkpoint. Read it together with `docs/SalsysOS_North_Star_Product_Context.md`. Historical files under `docs/checkpoints/` remain immutable evidence records and must not be rewritten to match later implementation state.

---

## 0. Executive status

SalsysOS Phase 6 implementation is in **release-candidate validation** on `phase-6a-violet-foundation`.

The major UI/UX redesign, responsive QA, role-route hardening, Course Management mutation hardening, and commerce-event observability work are implemented on the branch and have passed the existing build gates.

Latest verified release-candidate state:

- Vercel deployment for `3b2714e4...` is **READY**;
- GitHub combined status reports Vercel **success**;
- durable trusted-event ingestion contracts pass;
- Sales workspace contracts pass;
- Next.js production builds complete successfully;
- no unresolved Vercel preview feedback threads are present;
- dark-mode foundation and global loading/error/not-found states are present and consistent.

The main unresolved functional dependency is **outside the Salsys CRM projector**: the live Yogakulam payment-success backend is still not emitting authoritative `payment.completed` and `enrollment.completed` events.

---

## 1. Product architecture that must not regress

SalsysOS is a **Sales + Analysis Operating System**, not a generic CRM.

Canonical loop:

`marketing spend -> traffic/visitor -> source/campaign/content -> lead/opportunity -> conversation -> intent/objection/product interest -> salesperson activity -> follow-up -> payment/booking/enrollment -> revenue -> attribution -> conversion feedback -> learning`

Core rules:

1. Revenue visibility before feature count.
2. Vertical depth before generic breadth.
3. Separate observed facts, matched data, attributed outcomes, and inferred/modelled signals.
4. AI progresses from Assist -> Decide -> Act only with permissions and explainability.
5. Data quality is product quality.
6. Privacy and permissions are core architecture.
7. Deterministic identity matching comes before probabilistic matching.
8. Unknown evidence remains unknown.
9. Browser telemetry is journey/intent evidence; trusted backend/provider events establish booking/payment/enrollment/revenue truth.
10. Revenue must exclude processor fees.

---

## 2. Canonical CRM/customer model

Canonical relationship:

`persons -> person_leads -> leads/opportunities -> enrollments/bookings -> payments`

Important semantics:

- Customer 360 is an aggregation/read UI, not a new source-of-truth table.
- Stage belongs to the Opportunity.
- Intent is Opportunity-aware.
- One Contact may have multiple active Opportunities.
- Conversations/messages remain Lead-linked in storage for now.
- Inbox UX is moving toward Contact-centric presentation while preserving current storage contracts.
- Booking completed != Payment paid != Enrollment confirmed.
- Enrollment status, Opportunity stage, and Payment status remain separate.
- Paid state must never be set by a raw UI status write.

Current Lead stage enum remains:

`new, contacted, engaged, qualified, high_intent, payment_pending, closed_won, enrolled, nurture, not_now, lost, unqualified, duplicate`

Do not merge or remove `high_intent`, `closed_won`, or `enrolled` without a dependency audit.

---

## 3. Phase 6 UI/UX redesign status

The Phase 6 redesign uses the **Violet Cloud** system with Hostinger as visual inspiration only.

Key tokens:

- Primary `#5743C5`
- Hover `#4632AA`
- Deep `#211B3A`
- Canvas `#F8F7FC`
- Selected `#EDE9FA`
- Text `#24213C` / `#67627A`
- Border `#E6E3EF`
- Success `#168060`
- Warning `#BC7518`
- Error `#C34C52`
- Info `#3476C9`
- AI `#8354D5`
- Teal `#128C91`

The redesign intentionally avoided a giant global CSS rewrite. Changes were delivered through small scoped page/component layers.

Major redesigned/normalized surfaces include:

- Home / Command Center
- Sales Today
- Leads
- Pipeline
- Inbox
- Tasks & Follow-ups
- Customer 360
- Marketing Overview
- Campaigns
- Acquisition
- Search Intelligence
- Funnel
- Attribution
- Revenue / Forecasting
- Operations Overview
- Availability
- Programs & Batches
- Enrollments
- Team Overview
- Team Performance shell/hierarchy
- Automation
- Settings Overview
- Tracking & Data
- System Health

Responsive QA has also been completed across Sales, Marketing, Intelligence, Operations, Team, Automation, Settings, Tracking, and System Health.

---

## 4. Current route / role contract

Canonical workspace roles in production are:

`owner, admin, manager, admissions, viewer`

Expected product access:

### Owner / Admin

Broad system access, including administrative surfaces such as Tracking & Data, System Health, Team Performance, integrations and permissions.

### Manager

Broad operational access to Sales, Marketing, Intelligence, Operations and Automation review. Some high-impact mutation paths remain Owner/Admin-only.

### Admissions

Operational Sales workspace only:

- Today
- Leads
- Pipeline
- Inbox
- Tasks & Follow-ups

Admissions should not get direct access to Marketing, Intelligence, Operations administration, Automation administration, Tracking, Team Performance, Contact Intelligence, or Settings administration.

### Viewer

Fail closed for operational workspaces unless a specific read-only surface is explicitly designed later.

Server-side route guards now protect the hidden privileged domains instead of relying only on sidebar visibility.

---

## 5. Permission hardening completed on October 30

### Operations route boundary

Operations Overview, Availability, Programs & Batches and Enrollments now require the canonical privileged workspace role boundary.

### Course Management mutation authority

Production and repository migration:

`supabase/migrations/20261030_harden_course_management_permissions.sql`

Course and Course Batch INSERT/UPDATE/DELETE now require:

`owner/admin/manager`

The v2 batch-admin RPCs enforce the same authority. Legacy v1 admin RPCs are no longer executable by ordinary authenticated users and remain service-role-only where retained.

Reads remain available where needed by legitimate Admissions/capacity workflows.

### CRM admin authority

Production and repository migration:

`supabase/migrations/20261030_include_owner_in_crm_admin_authority.sql`

`can_administer_organization_crm()` now correctly includes:

`owner/admin/manager`

This resolves the earlier Owner exclusion from forecast/aging/integration-administration-style CRM authority.

### Integrations

The suspected Integrations service-role bypass was audited and is **not reproducible**. Exported integration mutations route through `getManagedConnection()`, which re-checks tenant ownership and Owner/Admin authority before service-role writes.

### Team Performance

The `/team-performance` route shell now requires Owner/Admin workspace access.

The large page still contains a redundant legacy `profiles.role === 'admin'` check internally. This is technical debt rather than a current production blocker because the route shell already fails closed and the current Owner profile is also admin. Remove the duplicate legacy check during a safe refactor of that large page.

---

## 6. Universal Tracking / durable trusted-event state

The durable trusted-event architecture remains:

```text
Trusted backend/provider
-> POST /api/events/v1
-> sanitize + bounded source verification
-> independent Vercel durable queue
-> private queue-triggered consumer
-> active-source / credential-fingerprint revalidation
-> ingest_tracking_event_v1
-> PostgreSQL raw_events
-> process_tracking_raw_event_v1
-> family processor
-> business projections
```

Durability rules remain:

- plaintext source secrets are never queued;
- stable event identity supports idempotent replay;
- queue retention is seven days;
- retries remain bounded but survive transient outages;
- if neither queue nor Supabase can accept an event, the API returns retryable HTTP 503 and must not claim durable acceptance;
- telemetry failure must not break checkout.

The build gate still verifies durable-event ingestion contracts.

---

## 7. Booking / payment / enrollment production truth

### Booking

Production currently contains **14 `booking.completed` raw events**.

Detailed reconciliation found:

- 12 processed successfully;
- 2 dead-lettered with `booking lead resolution required`;
- 3 processed historical events reference Lead IDs that no longer exist and are now surfaced as orphaned projections in System Health;
- successful booking projections create booking touchpoints/tracking references against existing Opportunities;
- booking completion does not imply paid or enrolled.

Recent Booking Activity is surfaced in the Leads workspace and includes direct actions for Lead, Conversation and Payment review.

### Payment started

Production now has **2 real `payment.started` events** from the live Yogakulam PHP backend:

- one ICICI payment start;
- one PayPal payment start.

Therefore `payment.started` is no longer "production proof pending". The active upstream PHP integration is proven through booking completion and payment preparation.

### Payment completed

Production currently has:

`payment.completed = 0`

This is the active upstream integration blocker.

The canonical Salsys helper is already provider-neutral. The live Yogakulam backend must emit `payment.completed` only after authoritative server-side verification and after the local payment record is committed as paid.

Required provider hooks include:

- PayPal verified capture/webhook;
- ICICI verified success/callback/reconciliation;
- Direct UPI only after authoritative admin/payment verification, never proof upload alone.

### Enrollment completed

Production currently has:

`enrollment.completed = 0`

`process_enrollment_raw_event_v1` is already implemented in Salsys and will create/update authoritative Enrollment records from verified enrollment completion events. Do not rebuild the projector.

The missing dependency is the upstream emitter after the first verified payment/deposit confirms enrollment.

---

## 8. Commerce Event Readiness / System Health

Production has a dedicated Commerce Event Readiness view.

Current live chain:

`14 booking completions -> 2 payment starts -> 0 verified payment completions -> 0 enrollments`

Current readiness state:

**Configuration blocked — Payment completion missing**

System Health also now surfaces trusted raw-event failures and orphaned projections:

- dead-letter trusted events;
- stuck/pending trusted processing;
- processed events whose recorded Lead no longer exists.

The current known booking issue counts are:

- `dead_letter`: 2
- `orphaned`: 3

This prevents successful historical processing from being mistaken for healthy current projections.

Operations Overview also explains the commerce blocker instead of showing zero Enrollments without context.

---

## 9. Automation posture

Automation remains policy-bound and conservative.

Safety defaults:

- autonomous customer messaging OFF unless separately armed;
- high-impact actions remain approval/policy controlled;
- automatic website publishing OFF by default;
- automatic ad-budget changes OFF by default;
- no fake execution/success evidence.

Manager access is now explicitly presented as **read-only** where mutation authority remains Owner/Admin-only. The backend authority was not loosened.

---

## 10. Dark mode / global route-state posture

The theme foundation is implemented with:

- `yk-theme` local storage persistence;
- pre-hydration theme boot script;
- `.dark` class on the root element;
- `color-scheme` synchronization;
- dedicated Violet Cloud dark surface/text/border tokens.

Global route states are present:

- loading -> CRM page skeleton;
- error -> retry + Command Center recovery;
- 404 -> Command Center + Back to Sales.

Keyboard focus-visible treatment is normalized to Violet Cloud across common controls.

---

## 11. Known deferred UX / technical debt

These are not current release blockers:

1. **Lead Inspector -> Customer 360 direct link**  
   The Inspector payload already contains the person-level identity needed for the link. The client drawer type/action row still needs a safe presentation-layer addition.

2. **Team Performance duplicate legacy authority check**  
   Route shell uses canonical Owner/Admin workspace authority; the large page still contains the old profile-role check and should be cleaned up in a controlled refactor.

3. **Some large legacy components still contain old utility/color classes internally**  
   Major visible surfaces are normalized through scoped Violet Cloud layers. Avoid mass global replacement.

---

## 12. Immediate next implementation sequence

Continue in this order.

### 1. Complete the live Yogakulam verified-payment emitter

Wire the real authoritative success path in the live PHP checkout backend:

`payment.completed -> enrollment.completed`

for ICICI / PayPal / verified UPI paths as applicable.

Do not emit paid truth from browser callbacks or unverified proof uploads.

### 2. Verify the complete commerce chain in production

For one controlled real/test checkout, reconcile:

- `booking.completed`;
- `payment.started`;
- `payment.completed`;
- authoritative Payment row;
- `enrollment.completed`;
- authoritative Enrollment row;
- Opportunity/customer linkage;
- Funnel;
- Attribution;
- Revenue;
- Customer 360.

### 3. Resolve the two booking dead letters

Investigate the two events currently failing lead resolution. Do not auto-merge identities by name.

### 4. Decide treatment for the three orphaned historical projections

Preserve audit evidence. Repair/link only if deterministic identity evidence exists; otherwise keep them flagged as integrity issues rather than inventing a customer match.

### 5. Merge/release the Phase 6 redesign branch after final human preview review

The branch currently has successful build/deployment status and no unresolved preview toolbar feedback.

### 6. Post-merge cleanup

Safely remove the redundant Team Performance legacy profile-role check and add Lead Inspector -> Customer 360 deep navigation.

---

## 13. Current status matrix

| Area | State |
|---|---|
| Core CRM | CLOSED V1 |
| Customer 360 / deterministic identity | CLOSED V1 |
| Universal browser lead capture | PROVEN |
| Trusted server source | PROVEN |
| Durable trusted-event queue | IMPLEMENTED / build-gated |
| `booking.completed` | PROVEN in production |
| `payment.started` | PROVEN in production (ICICI + PayPal observed) |
| `payment.completed` | BLOCKED by upstream verified-success emitter |
| Enrollment projector | IMPLEMENTED |
| `enrollment.completed` upstream emission | BLOCKED / 0 production events |
| Authoritative Enrollment records | 0 until verified enrollment completion arrives |
| Commerce Event Readiness | IMPLEMENTED |
| Trusted-event failures in System Health | IMPLEMENTED |
| Phase 6 Violet Cloud UI redesign | RELEASE CANDIDATE |
| Responsive QA | COMPLETED across major domains |
| Route-role hardening | IMPLEMENTED |
| Course/Batch mutation hardening | IMPLEMENTED in production + repo |
| Owner CRM admin authority correction | IMPLEMENTED in production + repo |
| Revenue/attribution E2E reconciliation | PENDING verified payment completion |
| Refund processor | PENDING after payment completion proof |

---

## 14. Recovery order if context is lost

Read:

1. `docs/SalsysOS_North_Star_Product_Context.md`
2. `docs/SalsysOS_Current_Checkpoint.md`
3. `docs/checkpoints/M-2026-10-26-Supabase-Incident-and-Durable-Event-Resilience-v1.md`
4. `docs/durable-event-ingestion-v1.md`
5. current branch `phase-6a-violet-foundation`

Then continue from Section 12. Do not redesign or rebuild mature backend contracts that are already implemented.

---

## 15. Checkpoint maintenance rule

After every meaningful production milestone:

- update this file;
- update `docs/SalsysOS_North_Star_Product_Context.md` only when architecture/roadmap materially changes;
- add an immutable historical checkpoint when production proof materially changes state;
- distinguish PROPOSED, DESIGNED, VALIDATED, IMPLEMENTED, DEPLOYED and E2E PROVEN states;
- preserve historical evidence instead of rewriting old milestone records.
