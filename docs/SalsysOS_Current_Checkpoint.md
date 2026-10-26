# SalsysOS Current Checkpoint

**Date:** 2026-10-26  
**Canonical repository:** `yogakulamacademy/salsys-os`  
**Production branch:** `main`  
**Current production code head:** `9409a658c5786ae4a6fa209d976c732f0c6de00d`  
**Primary Supabase project:** `doaozrkrtgeslddwhclj`  
**Primary Vercel project:** `prj_oNvjC0PwwNEAHHlES3xyP36lISAy` (`salsys-os`)

This file is the canonical operational checkpoint. Read it together with `docs/SalsysOS_North_Star_Product_Context.md`. Historical files under `docs/checkpoints/` remain immutable evidence records.

## Latest critical milestone

Read this first for the October 26 outage/resilience work:

`docs/checkpoints/M-2026-10-26-Supabase-Incident-and-Durable-Event-Resilience-v1.md`

That checkpoint records:

- the Supabase database interruption and automatic recovery evidence;
- middleware and login timeout hardening;
- the trusted event durability redesign;
- PR #187 and merge commit `9409a658c5786ae4a6fa209d976c732f0c6de00d`;
- current `booking.completed` / `payment.started` status;
- the exact next implementation sequence.

Other recent milestone records remain under `docs/checkpoints/` for onboarding, CRM, Customer 360, Conversations, Flow Builder and Universal Tracking.

---

## 0. Ordered product closeout status

The closeout discipline remains: do not claim an area closed until its real production integrity path is proven.

1. **Core CRM + lead/customer management — CLOSED V1**
2. **Customer Journey / Person 360 / Identity — CLOSED V1**
3. **Universal Tracking SDK + trusted business-event path — ACTIVE**
4. Funnel + attribution + revenue — next after Tracking closeout
5. WhatsApp automation — remaining production proof
6. Instagram automation — provider-permission/live E2E proof
7. Smart Triggers/workflow engine — final closeout audit
8. SEO/AEO/search intelligence — final closeout audit
9. Event Intelligence/feature store — final closeout audit
10. Predictive-model infrastructure — readiness/promotion closeout
11. Proven predictive accuracy from real outcomes — data-dependent calibration proof
12. R11-R14 commercial productization — later North-Star work

---

## 1. Core CRM / Customer 360

Core CRM remains CLOSED V1. PostgreSQL-backed lead/customer state, stage mutation, ownership, identity and tenant boundaries remain authoritative.

Customer Journey / Person 360 / Identity remains CLOSED V1. Exact-session anonymous-to-known identity handoff remains tenant-bound and atomic. Missing evidence must remain unknown rather than inferred.

The final pipeline stage now includes:

`closed_won` / **Deal Closed**

Authoritative paid behavior:

- lead stage -> `closed_won`;
- status -> `won`;
- stage history retained;
- after 24 hours, hourly sweep changes status to `archived`;
- lead/revenue/attribution/identity history remains preserved.

This behavior was transaction-tested before merge.

---

## 2. Universal Tracking — active closeout area

Universal Tracking is substantially implemented but not closed because the complete trusted checkout -> payment -> enrollment -> revenue journey is not yet fully proven.

Current capabilities include:

- universal browser tracking;
- Universal Lead Capture;
- detected forms + reusable form profiles;
- AJAX fallback;
- Universal Lead Sources V1;
- canonical event contracts;
- browser Site ID + trusted-origin resolution;
- secret-authenticated trusted server sources;
- tenant/source isolation;
- source counters, payload limits and rate limits;
- stable event IDs and canonical idempotent ingestion;
- browser/session/identity continuity;
- privacy-aware browser tracking and consent/GPC controls;
- trusted booking/payment/enrollment event adapters;
- independent durable queue buffering for trusted server events.

### Authority model

- browser = journey, behavior, intent and attribution evidence;
- trusted backend/provider = booking/payment/enrollment/refund/revenue truth;
- browser must never establish confirmed payment, enrollment, refund or final revenue;
- OpenSearch remains rebuildable/secondary;
- unknown evidence stays unknown.

### Required end-to-end acceptance journey

`campaign/click id -> visitor -> session -> behavior -> consent -> enquiry -> CRM lead -> Person/session identity -> checkout -> payment -> enrollment -> revenue -> attribution -> features/prediction -> observed outcome`

Tracking cannot be called fully closed until this reconciles across Tracking, Person 360, Funnel, Attribution and Revenue.

---

## 3. October 26 Supabase incident — current interpretation

The Supabase project experienced a database/data-plane incident.

Observed/proven facts:

- Supabase Health reported `db_not_reachable`;
- TCP `CONNECT_TIMEOUT` occurred;
- Data API reached 100% 5xx in the observed window;
- Auth/PostgREST/Storage became unhealthy because they depend on the database;
- Postgres logs showed an interrupted / not-properly-shut-down database and automatic recovery;
- fresh database startup/recovery was observed more than once;
- application/direct management connections timed out during the incident.

Root-cause classification:

> The Supabase Postgres instance/host path became unreachable and Postgres restarted uncleanly. The exact provider-internal trigger is not visible in tenant logs. Evidence does not support blaming Salsys application code.

Do not rewrite this as a proven host hardware/storage cause unless Supabase provides stronger evidence later.

---

## 4. Middleware and login resilience

### Middleware

Protected routes previously waited on Supabase Auth/workspace resolution long enough for Vercel to return `504 MIDDLEWARE_INVOCATION_TIMEOUT`.

PR #184 introduced bounded dependency budgets. Auth/workspace authority still fails closed; optional onboarding evidence may fail open. Remote `signOut()` is no longer a required blocking call on the membership-error path.

### Login

PR #185 bounded password-auth / tenant-binding dependency waits so login no longer appears to hang indefinitely during upstream failure.

Infrastructure failure should produce a temporary-service response, not a false invalid-password conclusion.

---

## 5. Durable Trusted Event Ingestion V1 — MERGED

PR #187 is merged to `main` at:

`9409a658c5786ae4a6fa209d976c732f0c6de00d`

The key architecture rule is now:

> A durability layer intended to survive Supabase/Postgres failure cannot depend on Supabase/Postgres for initial persistence.

### Active trusted-event flow

```text
Trusted backend/provider
-> POST /api/events/v1
-> sanitize + bounded source verification
-> independent Vercel durable queue
-> private queue-triggered consumer
-> re-validate active source + credential fingerprint
-> ingest_tracking_event_v1
-> PostgreSQL raw_events
-> process_tracking_raw_event_v1 / existing sweeper
-> business projections
```

### Security/durability properties

- plaintext trusted-source secret is never queued;
- queue envelope stores only a SHA-256 credential fingerprint;
- private consumer re-resolves active source before persistence;
- credential comparison is timing-safe;
- stable `source_key + event_id` identity supports idempotent replay;
- queue retention is seven days;
- transient failures continue retrying through retention rather than a short fixed attempt cap;
- recovery concurrency is bounded (`maxConcurrency: 5`) to avoid post-outage stampede;
- revoked/invalid source messages are permanent failures and do not retry forever;
- if the queue is unavailable but Supabase is healthy, one direct idempotent Supabase persistence attempt is made;
- if neither queue nor Supabase can accept the event, the API returns retryable HTTP 503 with `Retry-After` and must not claim durable acceptance;
- after raw-event persistence, projection can be recovered by the existing tracking sweeper.

### Regression gate

`scripts/verify-durable-event-ingestion.mjs` protects the durable-ingestion contract and is run in CI and as part of the production build gate.

`docs/durable-event-ingestion-v1.md` is the implementation/runbook reference.

---

## 6. CI verifier state

The Universal Tracking Intelligence SDK uses:

```text
public/salsys-intelligence.js
-> loader
-> public/salsys-intelligence-core-v1.6.0.js
```

PR #186 corrected the SDK verifier so it validates loader + core rather than assuming the loader contains the entire runtime.

During PR #187 CI, another stale verifier assumption was found: it looked for direct `authenticateServerTrackingSource` and `ingest_tracking_event_v1` strings inside `/api/events/v1` even though those boundaries moved to `lib/tracking/durable-events.ts`.

The verifier was updated to validate the new durable authentication/persistence boundary rather than weakening the security requirement.

---

## 7. Trusted Yogakulam server source

Current Yogakulam trusted website-backend source:

- source name: `Website backend`;
- source id: `16f15c43-2a9d-4440-b8e3-fc55e5f5acd6`;
- source key: `src_TNNyVvK1TDXkPLpBigL_VvVV`;
- source system: `website_backend`;
- auth mode: `secret`;
- status: active.

**Never commit or expose the actual source secret.**

Canonical trusted business events currently include:

- `booking.started`;
- `booking.completed`;
- `payment.started`;
- `payment.completed`;
- `payment.failed`;
- `enrollment.completed`.

Refund wiring remains pending.

---

## 8. Yogakulam PHP integration state

Important current files:

- `/includes/salsys/salsys_config.php`;
- `/includes/salsys/salsys-tracking.php`;
- private non-public environment file: `private/salsys-env.php`.

The private environment file must remain outside public web root and must never be committed.

Helper functions include:

- `salsys_send_event(...)`;
- `salsys_track_lead_submitted(...)`;
- `salsys_track_booking_completed(...)`;
- `salsys_track_payment(...)`;
- `salsys_track_enrollment_completed(...)`.

Telemetry remains fail-open relative to checkout: Salsys failure must not break a customer payment flow.

---

## 9. Booking/payment status

### `booking.completed` — PROVEN

`booking.completed` is accepted in production and links back to CRM identity through the tracking/entity resolver path.

### `payment.started` — BUILT, production proof pending

`create-payment.php` emits `payment.started` before the final JSON response.

Important revenue invariant:

> canonical Salsys amount = business subtotal, not gateway amount including processor fee.

For PayPal/USD the processing fee remains metadata and must not inflate revenue attribution.

A payment-start test was interrupted by the Supabase incident. Because database/API verification was unavailable, `payment.started` must be re-proven after recovery rather than assumed successful or rewritten again without evidence.

### `payment.completed` — PENDING

Must be emitted only from authoritative provider verification:

- PayPal capture/webhook after verified capture;
- ICICI after verified callback/status;
- Direct UPI proof upload alone is not paid truth; admin/authoritative verification is required.

Authoritative paid state should create/update Salsys payment truth and drive `closed_won`.

### `enrollment.completed` — PENDING

Emit only after authoritative enrollment completion.

### refund — PENDING

Wire only after payment completion flow is proven.

---

## 10. Test-data state

Clearly synthetic CRM records used during the earlier controlled tests were cleaned up.

At the cleanup checkpoint:

- 28 clearly synthetic/test leads were removed;
- remaining obvious test/dummy leads: 0;
- real recent leads were preserved.

Do not delete real checkout/payment records merely because they were recently created unless they are explicitly confirmed as test data.

---

## 11. SaaS onboarding / conversations / automation posture

Controlled customer provisioning and onboarding remain live.

Current onboarding sequence:

`Security -> Business -> Goals -> Website -> Channels -> Team -> Finish`

Hard requirements remain Business + Goals. `Skip != complete` for optional steps.

Home Workspace Activation continues to derive setup state from live evidence rather than fake completion state.

Conversations remains the CRM-connected shared inbox/collaboration surface.

Messaging/automation safety defaults remain:

- autonomous customer messaging OFF unless separately armed;
- high-impact actions remain approval/policy controlled;
- automatic website publishing OFF by default;
- automatic ad-budget changes OFF by default;
- no fake execution/success evidence.

---

## 12. Immediate next implementation sequence

Continue in this order.

### 1. Production proof for durable trusted ingestion

Send one controlled trusted event through the production `/api/events/v1` path and verify:

- queued/durable acceptance;
- private consumer delivery;
- raw event persisted;
- processing or sweeper recovery;
- source counters correct;
- no duplicate.

### 2. Re-prove `payment.started`

Perform one fresh Yogakulam payment-start test and verify:

- `payment.started` accepted;
- correct YKP payment reference;
- correct YGK booking reference;
- provider/payment kind/currency;
- amount equals business subtotal;
- processor fee is metadata only;
- correct lead/person linkage;
- correct payment state;
- no duplicate.

Only then mark `payment.started` PROVEN.

### 3. Wire `payment.completed`

Use authoritative provider verification only.

### 4. Wire `enrollment.completed`

Use authoritative enrollment truth only.

### 5. Reconcile revenue/attribution

Verify Funnel, Attribution, Person 360 and revenue views agree and do not include processor fees as revenue.

### 6. Add refund processor

Only after payment completion is proven.

---

## 13. Current status matrix

| Area | State |
|---|---|
| Core CRM | CLOSED V1 |
| Customer 360 / exact-session identity | CLOSED V1 |
| Universal browser lead capture | PROVEN |
| Detected Forms / reusable form profiles | PROVEN |
| Universal Lead Sources V1 | MERGED / foundation proven |
| Trusted server source | PROVEN |
| `booking.completed` | PROVEN |
| Deal Closed / auto archive | PROVEN |
| Middleware outage hardening | MERGED |
| Login outage hardening | MERGED |
| SDK loader/core verifier correction | MERGED |
| Durable trusted-event queue | MERGED via PR #187 |
| Durable ingestion contracts/build gate | MERGED |
| Production durable-queue smoke proof | PENDING |
| `payment.started` production proof | PENDING |
| `payment.completed` | PENDING |
| `enrollment.completed` | PENDING |
| Revenue reconciliation / attribution proof | PENDING |
| Refund processor | PENDING |

---

## 14. Architectural rules that must not regress

1. Salsys is universal SaaS; Yogakulam PHP is one adapter/customer implementation.
2. Browser telemetry is journey/intent evidence; trusted backend/provider events establish business truth.
3. Browser payloads never authorize payment/enrollment/revenue state.
4. Revenue excludes processor fees.
5. Stable event IDs and idempotency are mandatory for retry/replay.
6. Identity resolution stays tenant-scoped and fail-closed on ambiguity.
7. Telemetry failure must not break checkout.
8. Supabase-outage durability must not depend on Supabase for first persistence.
9. Server/source secrets stay backend-only and out of GitHub/logs/queue payloads.
10. Unknown evidence remains unknown; never claim success without observed proof.

---

## 15. Recovery order if context is lost

Read:

1. `docs/SalsysOS_North_Star_Product_Context.md`
2. `docs/SalsysOS_Current_Checkpoint.md`
3. `docs/checkpoints/M-2026-10-26-Supabase-Incident-and-Durable-Event-Resilience-v1.md`
4. `docs/durable-event-ingestion-v1.md`
5. PR #187 / merge commit `9409a658c5786ae4a6fa209d976c732f0c6de00d`

Then continue from Section 12 rather than redesigning the system.

---

## 16. Checkpoint maintenance rule

After every meaningful production milestone:

- update this file;
- update `docs/SalsysOS_North_Star_Product_Context.md` if architecture/roadmap materially changes;
- add an immutable historical checkpoint when production proof materially changes state;
- distinguish BUILT, MERGED, DEPLOYED, TESTED and fully E2E PROVEN states;
- preserve historical evidence rather than rewriting old milestone records.
