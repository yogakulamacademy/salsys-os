# M-2026-10-26 — Supabase Incident and Durable Event Resilience V1

**Date:** 2026-10-26  
**Repository:** `yogakulamacademy/salsys-os`  
**Production branch:** `main`  
**Production head at checkpoint start:** `9409a658c5786ae4a6fa209d976c732f0c6de00d`  
**Primary Supabase project:** `doaozrkrtgeslddwhclj`  
**Primary Vercel project:** `prj_oNvjC0PwwNEAHHlES3xyP36lISAy` (`salsys-os`)

This milestone records the October 26 Supabase outage, the resulting SalsysOS resilience work, and the exact trusted-event/payment state after the incident. It is intended to be sufficient recovery context if conversational context is lost.

---

## 1. Incident summary

On 2026-10-26, the SalsysOS Supabase project became unavailable at the database/data-plane layer.

Supabase Health reported:

- `db_not_reachable` — **Database not usable**;
- TCP-layer `CONNECT_TIMEOUT` after approximately 5.3 seconds;
- Data API 5xx rate at **100% of 125 requests** across the observed periods;
- Database, PostgREST/Data API, Auth and Storage unhealthy;
- Realtime and Edge Functions remained available.

During the same window, production traffic showed repeated Supabase API failures including 520/522 responses for:

- `/rest/v1/rpc/resolve_tracking_source_by_site_v1`;
- `/rest/v1/tracking_sources`;
- `/rest/v1/integration_connections`;
- `/auth/v1/token`;
- `/auth/v1/user`;
- `/rest/v1/rpc/get_current_workspace_context_v1`;
- `/rest/v1/rpc/bind_current_tenant_session`.

Direct database administration calls also returned connection timeouts.

### Database restart evidence

Postgres logs showed unclean restart/recovery behavior, including messages equivalent to:

- database system was interrupted;
- database system was not properly shut down;
- automatic recovery in progress;
- database system is ready to accept connections.

Fresh Postgres startup/recovery was observed around **12:20:56 UTC** and again around **13:15:18 UTC**.

Before the second restart, checkpoint/storage timing was abnormally slow for a very small write volume, supporting the conclusion that the database host/storage path was unhealthy shortly before restart.

### Root-cause classification

**Proven:** the Supabase Postgres instance became unreachable at the TCP layer and was interrupted/restarted without a clean shutdown, cascading into Auth and PostgREST/Data API failure.

**Not proven from tenant-visible logs:** the exact provider-internal trigger that interrupted the underlying database host/process. Possible provider-side causes include host/node failure, storage stall, infrastructure replacement/restart, or maintenance/recovery action.

No evidence was found that Salsys application code caused the database restart. No clear evidence was found for connection-slot exhaustion, an application SQL query crashing Postgres, or an application-level out-of-memory condition.

---

## 2. User-visible failure before hardening

The outage exposed two SalsysOS dependency weaknesses.

### Protected-route middleware

Protected page middleware synchronously waited on Supabase Auth/workspace resolution. During the outage this produced Vercel:

`504 MIDDLEWARE_INVOCATION_TIMEOUT`

The `/conversations` page itself was not the cause; routing middleware was blocked on upstream Supabase calls.

### Login action

The login server action also performed unbounded Supabase calls, including password sign-in and tenant/session binding. During Supabase degradation the login could appear stuck even when the supplied password was not known to be wrong.

---

## 3. Middleware and login hardening already merged

### PR #184 — middleware timeout hardening

Production middleware was changed to use bounded external dependency budgets instead of waiting until Vercel terminates the middleware invocation.

Behavior after hardening:

```text
Supabase healthy
-> authenticate
-> resolve workspace
-> continue

Supabase slow/unreachable
-> stop waiting within Salsys budget
-> controlled Salsys failure response
-> no Vercel middleware invocation timeout
```

Security posture remains fail-closed for authentication and workspace/tenant authority. Optional onboarding evidence may fail open because it is not an authorization boundary.

A blocking remote `signOut()` dependency was removed from the membership-error path; auth cookies can be cleared locally so an unavailable Supabase API does not create a second blocking network dependency.

### PR #185 — login action hardening

The login action now bounds Supabase dependency waits and returns an explicit temporary-service error instead of hanging.

The intended user-facing meaning is:

> Sign-in service is temporarily unavailable. Your password was not rejected.

This distinction is important: infrastructure downtime must not be presented as an invalid-password result.

---

## 4. CI verifier correction already merged

A separate CI failure was discovered while login hardening was being validated.

The Universal Tracking Intelligence SDK verifier assumed `public/salsys-intelligence.js` contained the full SDK runtime. The architecture had already evolved to:

```text
public/salsys-intelligence.js
-> loader
-> public/salsys-intelligence-core-v1.6.0.js
-> product-facing SalsysIntelligence runtime
```

The verifier was updated to validate loader + core together instead of reporting a false failure.

This was merged through PR #186.

---

## 5. Trusted server event foundation before resilience work

Canonical trusted event endpoint:

`POST /api/events/v1`

Yogakulam trusted website-backend source:

- source name: `Website backend`;
- source id: `16f15c43-2a9d-4440-b8e3-fc55e5f5acd6`;
- source key: `src_TNNyVvK1TDXkPLpBigL_VvVV`;
- source system: `website_backend`;
- auth mode: `secret`;
- source status: active.

The source secret is deliberately **not** recorded in this checkpoint. It must remain backend-only and must never be committed to GitHub.

Canonical trusted business events currently include:

- `booking.started`;
- `booking.completed`;
- `payment.started`;
- `payment.completed`;
- `payment.failed`;
- `enrollment.completed`.

Refund wiring is intentionally pending.

Authority model:

- browser = journey/intent/acquisition evidence;
- trusted backend/provider = authoritative booking/payment/enrollment/revenue truth;
- browser must never establish paid/refunded/enrolled/final-revenue facts.

---

## 6. Yogakulam PHP integration state

Important website integration files:

- `/includes/salsys/salsys_config.php`;
- `/includes/salsys/salsys-tracking.php`;
- private environment file outside public web root: `private/salsys-env.php`.

Dynamic environment path used by PHP:

```php
$salsysEnvPath =
    dirname($_SERVER['DOCUMENT_ROOT']) .
    '/private/salsys-env.php';
```

Tracking helper path:

```php
$salsysTrackingPath =
    $_SERVER['DOCUMENT_ROOT'] .
    '/includes/salsys/salsys-tracking.php';
```

Never commit or expose `SALSYS_SERVER_SECRET`.

Current helper capabilities include:

- `salsys_send_event(...)`;
- `salsys_track_lead_submitted(...)`;
- `salsys_track_booking_completed(...)`;
- `salsys_track_payment(...)`;
- `salsys_track_enrollment_completed(...)`;
- short connection/request timeouts;
- fail-open telemetry behavior so a Salsys tracking failure does not break customer checkout.

---

## 7. `booking.completed` status — PROVEN

`booking.completed` is fully wired and has been accepted by Salsys production.

The booking integration sends the user response first and then emits the trusted event using server-validated booking/course/value information plus visitor/session continuity when available.

The entity resolver links accepted booking events back to the CRM lead/person boundary.

This area is considered **PROVEN**.

---

## 8. Pipeline `closed_won` / automatic archive — PROVEN

A dedicated final sales stage exists:

`closed_won` / **Deal Closed**

Authoritative paid payment behavior:

- lead stage -> `closed_won`;
- lead status -> `won`;
- stage history retained;
- after 24 hours in closed_won, hourly sweep changes status to `archived`;
- lead is not deleted;
- revenue, attribution, identity and history remain available.

This was validated in a rollback-controlled database transaction before production merge.

---

## 9. Test-data cleanup — PROVEN

Before continuing authoritative payment testing, clearly synthetic CRM test data was cleaned up.

At the time of cleanup:

- 28 clearly synthetic/test leads were deleted;
- remaining obvious dummy/test leads: 0;
- real recent leads were preserved.

Deletion required cleaning/detaching related child rows in several tables because foreign keys and triggers correctly protected related identity/automation/session state.

---

## 10. `payment.started` integration state

`create-payment.php` has been wired to emit trusted `payment.started` before the final JSON response.

Important business-revenue rule:

**Salsys event amount must use the business subtotal, not the gateway amount including processor fees.**

For USD/PayPal, processor fee remains metadata and must not inflate attributed revenue.

Current event shape includes:

- `payment_reference`;
- `booking_reference`;
- customer email/phone;
- provider/gateway;
- payment kind/plan;
- business subtotal as canonical amount;
- currency;
- gateway order id in metadata;
- course/course id;
- course amount;
- bonus amount;
- processor fee;
- gateway amount;
- remaining balance;
- coupon code;
- checkout stage.

### Payment-start test before outage

A fresh booking produced accepted `booking.completed`, but `payment.started` had not yet been proven in Salsys when the Supabase outage occurred.

The outage made it impossible to distinguish an application event-delivery problem from infrastructure failure, and direct database verification was unavailable.

Therefore:

- `booking.completed` = **PROVEN**;
- `payment.started` PHP wiring = **BUILT / STRUCTURALLY REVIEWED**;
- `payment.started` production ingestion = **PENDING RE-PROOF**.

Do not modify the PHP payment integration again unless a clean post-recovery test demonstrates a real code defect.

---

## 11. Why a Supabase-local queue was rejected

A retry/outbox table stored in the same Supabase/Postgres database would not protect against the exact incident observed on 2026-10-26.

If Postgres is unreachable, Salsys cannot insert into a queue table stored inside that same Postgres instance.

Therefore the trusted-event durability boundary must exist **outside Supabase**.

This is a permanent architecture principle.

---

## 12. Durable Trusted Event Ingestion V1 — MERGED

### PR #187

Title:

`Harden trusted event ingestion with durable queue buffering`

Merged to `main` at:

`9409a658c5786ae4a6fa209d976c732f0c6de00d`

### New architecture

```text
Any trusted backend/provider
        |
        v
POST /api/events/v1
        |
        |  sanitize + envelope + bounded source verification
        v
Vercel Queue (independent of Supabase)
        |
        |  private queue-triggered consumer
        |  retry while transient dependency is unavailable
        v
re-validate active source + secret fingerprint
        |
        v
canonical ingest_tracking_event_v1
        |
        v
raw_events in PostgreSQL
        |
        v
process_tracking_raw_event_v1 / existing sweeper
        |
        v
identity / booking / payment / enrollment / revenue projections
```

### Queue-first admission

For trusted `/api/events/v1` requests, the preferred durability path is now the independent Vercel queue before Supabase persistence.

This prevents a temporary Supabase outage from automatically destroying an authoritative business event.

### Secret handling

The queue envelope contains a SHA-256 fingerprint of the submitted server secret, never the plaintext secret.

The private consumer later resolves the active source from Supabase and performs timing-safe comparison against the stored source secret hash before any business event is persisted.

### Stable idempotency

The queue publish uses stable identity derived from:

`source_key + source event_id`

Canonical Postgres ingestion also retains source-event idempotency.

Therefore replay after infrastructure recovery must not create duplicate bookings/payments/enrollments when the same authoritative event is retried.

### Source verification during outage

When Supabase is healthy, `/api/events/v1` verifies the source before queue acceptance.

If source verification cannot complete only because the dependency is unavailable/timeout, the queue can accept the hashed-credential envelope. The private consumer **must re-validate** the active source before persistence after Supabase recovers.

Invalid/revoked credentials are permanent failures and are acknowledged/discarded rather than retried forever.

### Queue outage fallback

If Vercel Queue is temporarily unavailable while Supabase is healthy, the API performs one direct idempotent Supabase persistence attempt.

### Both durability paths unavailable

If both:

- independent Vercel Queue is unavailable, and
- direct Supabase persistence is unavailable,

then `/api/events/v1` returns retryable HTTP `503` with `Retry-After`.

It must **not** falsely report durable acceptance.

Trusted adapters should retry the same stable event id.

### Queue retention and recovery

Current queue design:

- retention: 7 days;
- no short `maxDeliveries` cap for transient dependency failures;
- bounded recovery concurrency: `maxConcurrency: 5`;
- transient consumer failures return non-2xx so Vercel retries;
- permanent invalid/revoked/malformed messages are acknowledged and discarded;
- raw-event persistence is the durable Postgres boundary;
- projection failure after raw persistence can be recovered by the existing tracking sweeper.

The bounded consumer concurrency exists to prevent a large post-outage backlog from stampeding a newly recovered Supabase database.

### Private consumer

Queue delivery is bound through Vercel `queue/v2beta` trigger configuration in `vercel.json`.

The consumer validates Vercel Queue CloudEvent metadata before processing the payload.

---

## 13. Durable ingestion regression contracts

A dedicated verifier exists:

`scripts/verify-durable-event-ingestion.mjs`

The verifier protects these invariants:

1. trusted events use independent Vercel queue persistence;
2. seven-day queue retention is explicit;
3. stable event identity is used for queue deduplication;
4. plaintext source secrets are not queued;
5. consumer re-validates active source credentials;
6. obsolete manual polling/lease code is absent;
7. API attempts queue durability before direct Supabase fallback;
8. credential verification can be deferred only for dependency outage/timeout;
9. API returns retryable 503 when neither durability path succeeds;
10. private consumer validates expected queue CloudEvent metadata;
11. permanent failures are acknowledged while transient failures retry;
12. Vercel trigger is bound to the intended topic;
13. transient failures can continue through the retention window rather than a short attempt cap;
14. recovery concurrency is bounded.

The durability verifier is included in CI and is also a deployment build gate before `next build`.

Vercel preview validation confirmed:

- durability verifier PASS;
- Next production compile PASS;
- TypeScript validity PASS;
- queue trigger configuration accepted by Vercel;
- preview deployment READY.

A stale string-based Universal Tracking verifier was then corrected so it validates the new durable authentication/persistence boundary instead of requiring the old direct `authenticateServerTrackingSource` call to remain inside `/api/events/v1`.

---

## 14. Security invariants after durability work

The resilience layer must not weaken tenant or credential security.

Required invariants:

- plaintext trusted-source secret is never queued or logged;
- queued credential fingerprint alone does not grant persistence authority;
- active source is re-resolved from PostgreSQL before persistence;
- source credential fingerprint is timing-safe compared;
- revoked/inactive source events are discarded permanently;
- all persisted events remain tenant/source scoped;
- browser events cannot become payment/enrollment authority;
- stable event ids remain mandatory for authoritative retries;
- no customer checkout may depend on Salsys telemetry success;
- no event may be reported as durably accepted if neither queue nor Postgres accepted it.

---

## 15. What is now protected against another Supabase outage

For trusted server/provider business events, the target behavior is now:

```text
Customer completes business action
        |
        v
Trusted adapter emits stable event id
        |
        v
Salsys durable queue accepts event
        |
        +---- Supabase unavailable ----> message retained/retried
        |
        +---- Supabase recovers -------> source revalidated
                                           |
                                           v
                                     idempotent Postgres ingest
                                           |
                                           v
                                     business projection
```

This makes temporary Supabase unavailability survivable for trusted event ingestion within the configured retention window.

It does **not** make the Salsys web application fully usable while Supabase Auth/database are unavailable. Login and tenant-backed UI still depend on Supabase, but they now fail in a controlled bounded manner rather than hanging until Vercel timeout.

---

## 16. Remaining resilience work

Durable Trusted Event Ingestion V1 substantially improves authoritative event survival, but full SaaS resilience still requires additional work over time.

Recommended future items:

- provider/dashboard health observability for queue backlog, retry age and oldest unprocessed event;
- operational alert when trusted-event queue backlog grows beyond threshold;
- explicit dead-letter / quarantine workflow if Vercel queue semantics require one for exhausted/expired messages;
- periodic disaster-recovery drill;
- Supabase PITR/backups review;
- connection/pool configuration review;
- capacity and connection-headroom review;
- incident runbook for database unavailable / Auth unavailable / Data API unavailable;
- adapter-level retry/outbox guidance for integrations that can safely persist locally before calling Salsys;
- recovery reconciliation reports comparing provider truth vs Salsys persisted facts.

Do not add a second queue inside Supabase and call it outage protection; it cannot protect against Postgres being unreachable.

---

## 17. Immediate next implementation sequence

After this checkpoint, continue in this order unless new evidence requires a change.

### Step 1 — verify production deployment of PR #187

Confirm the merge commit has a READY production deployment and aliases are assigned correctly.

### Step 2 — perform one clean trusted event smoke test

With Supabase healthy, emit one controlled trusted event through `/api/events/v1` and verify:

- API returns queued/durable acceptance;
- private consumer executes;
- raw event lands in Postgres;
- processing completes or is recoverable by sweeper;
- source counters remain correct;
- no duplicate appears.

### Step 3 — re-prove `payment.started`

Perform one fresh payment-start test from Yogakulam checkout.

Verify:

- `payment.started` accepted;
- correct `YKP-...` payment reference;
- correct `YGK-...` booking reference;
- provider, payment kind and currency;
- canonical amount equals business subtotal, not processor-inclusive gateway amount;
- processor fee remains metadata;
- event links to correct CRM lead/person;
- payment row/state is correct;
- no duplicate event.

Only after this proof mark `payment.started` PROVEN.

### Step 4 — wire authoritative `payment.completed`

Rules:

- PayPal: emit only after verified capture/webhook confirmation;
- ICICI: emit only after verified callback/status confirmation;
- Direct UPI proof upload is **not** equivalent to paid; completion requires an authoritative verification/admin-paid commit;
- authoritative paid event should create/update Salsys payment truth and promote lead to `closed_won`.

### Step 5 — wire `enrollment.completed`

Emit from authoritative enrollment completion only.

### Step 6 — prove revenue attribution

Verify payment/enrollment/revenue facts reconcile into Funnel, Attribution, Person 360 and revenue views without processor-fee inflation.

### Step 7 — refunds

Add authoritative refund processing only after payment completion flow is proven.

---

## 18. Current status matrix

| Area | State |
|---|---|
| Universal browser lead capture | PROVEN |
| Detected Forms / reusable form profiles | PROVEN |
| Universal Lead Sources V1 | MERGED / PROVEN foundation |
| Trusted server event source | PROVEN |
| `booking.completed` | PROVEN |
| Deal Closed / auto archive | PROVEN |
| Middleware outage hardening | MERGED |
| Login outage hardening | MERGED |
| CI SDK loader/core verifier correction | MERGED |
| Durable trusted-event queue | MERGED via PR #187 |
| Durable ingestion contracts/build gate | MERGED |
| Production queue smoke test | PENDING |
| `payment.started` production proof | PENDING |
| `payment.completed` | PENDING |
| `enrollment.completed` | PENDING |
| revenue reconciliation / attribution proof | PENDING |
| refund processor | PENDING |

---

## 19. Architectural principles to preserve

1. Salsys is a universal SaaS platform; Yogakulam PHP is only one adapter/customer implementation.
2. Browser telemetry is discovery/intent evidence; trusted backend/provider events are business truth.
3. Never trust browser-supplied payment amount/status as authoritative revenue.
4. Revenue excludes processor fees.
5. Stable event IDs + idempotency are mandatory for retry/replay.
6. Identity resolution remains tenant-scoped, exact where possible, and fail-closed on ambiguity.
7. Salsys telemetry failure must not break customer checkout.
8. A durability layer intended to survive Supabase failure must not depend on Supabase for initial persistence.
9. Unknown evidence remains unknown; never fabricate success.
10. Server secrets remain backend-only and must never be committed to GitHub.

---

## 20. Recovery instruction if conversational context is lost

Read, in this order:

1. `docs/SalsysOS_North_Star_Product_Context.md`
2. `docs/SalsysOS_Current_Checkpoint.md`
3. this file: `docs/checkpoints/M-2026-10-26-Supabase-Incident-and-Durable-Event-Resilience-v1.md`
4. `docs/durable-event-ingestion-v1.md`
5. PR #187 / merge commit `9409a658c5786ae4a6fa209d976c732f0c6de00d`

Then continue with **Step 1** in Section 17 rather than redesigning the architecture from scratch.
