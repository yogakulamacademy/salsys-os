# SalsysOS Current Checkpoint

**Checkpoint date:** 2026-11-01  
**Canonical repository:** `yogakulamacademy/salsys-os`  
**Production branch:** `main`  
**Verified production head at acceptance start:** `ca4de2d58fc7d950376ff0bf8150fe812c04386b`  
**Companion context:** `docs/SalsysOS_North_Star_Product_Context.md`  
**Fast resume file:** `docs/SalsysOS_Active_Handoff.md`

> This is the canonical operational checkpoint. Historical files under `docs/checkpoints/` are immutable evidence records and must not be rewritten to match later implementation state.

---

## 1. Current product position

SalsysOS is a **Sales + Analysis Operating System** connecting marketing acquisition, first-party behaviour, identity/customer journey, CRM execution, conversations, follow-up, commerce/revenue, attribution and intelligence.

Current production proving ground:

- Yogakulam Academy

Canonical production app:

- `https://crm.salsysos.com`

Current execution mode:

- broad 14-surface engineering closeout: complete;
- PA-1 human-approved identity merge capability: implemented and production-deployed;
- PA-1 live identity decision: still intentionally unresolved;
- current program: **Production Acceptance & Operational Closeout**;
- current exact checkpoint: **live verified-payment completion emitter**.

The unresolved PA-1 pair must remain untouched unless explicit human approval is given, but it no longer blocks unrelated production-acceptance work.

---

## 2. Stable production baseline

Read-only health already established:

```text
CRM Core Integrity          healthy
Admissions Automation      healthy
Universal Tracking         healthy / collecting
Website Lead Capture       healthy
GA4                        healthy
Google Search Console      healthy
Privacy Compliance         healthy
WhatsApp                   healthy
```

Parked/non-regression states:

```text
Google Ads       critical   external Google production-access approval blocker
Meta Ads         warning    provider permission + App Review dependency
Customer 360     warning    2 open human-review identity conflicts
Search Indexing  inactive   intentionally disabled
```

Google Ads remains an external provider-access issue (`CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION`), not a newly discovered SalsysOS defect.

Search Indexing remains intentionally disabled.

---

## 3. PA-1 status — engineering complete, live decision deferred

PA-1 provides the controlled human-approved identity merge path.

Relevant production changes:

- PR #400 — merge capability + audit boundary;
- migration `human_approved_identity_merge_v1` (`20261101125123`);
- PR #401 — post-deploy advisor/index closeout;
- migration `person_merge_audit_fk_indexes_v1` (`20261101130010`);
- PR #402 — final PA-1 documentation closeout.

Current live PA-1 boundary remains:

```text
open pair conflicts      2
source Person status     active
merge audit rows         0
```

No live identity merge has occurred.

The pair is still human-review only because the phone/email identifiers are unverified. Do not auto-merge, auto-dismiss or infer approval from similarity.

---

## 4. Real-activity production acceptance — 2026-11-01

A read-only live acceptance pass was run across:

`Lead -> Admissions -> Conversation -> Follow-up -> Payment/Enrollment -> Revenue`

Detailed evidence is recorded in:

`docs/checkpoints/M-2026-11-01-Real-Activity-Acceptance-v1.md`

### Live production inventory

```text
leads                         596
conversations                 566
admissions_auto_task_events    20
follow-up tasks                22
lead contact logs              16
payments                        2
enrollments                     0
conversion facts                1
```

### Accepted segment

The live path through follow-up is production-proven:

- multiple real Leads have canonical Conversations plus Admissions automation plus generated follow-up tasks;
- all 20 Admissions automation events inspected have a matching canonical follow-up task for the same Lead/title/due time;
- booking events are reaching the trusted server event pipeline;
- both live `payment.started` events projected successfully to canonical Payment rows.

Open follow-up task status is an operational usage state, not evidence that task generation failed.

---

## 5. Commerce completion boundary

Canonical `v_commerce_event_readiness_v1` currently reports:

```text
health_status                configuration_blocked
operational_status           payment_completion_missing
booking.completed (30d)      19
payment.started (30d)         2
payment.completed (30d)       0
enrollment.completed (30d)    0
```

Current canonical Payment rows are still pending.

No live authoritative paid Payment or canonical Enrollment has yet been produced through the Yogakulam checkout integration.

Therefore the following are **not yet production-proven**:

- verified `payment.completed`;
- canonical paid revenue from the live checkout;
- `enrollment.completed`;
- canonical Enrollment creation from the live checkout;
- complete Customer 360 payment/enrollment journey;
- realized revenue/attribution from a real verified transaction.

---

## 6. Commerce processor integrity

The SalsysOS projection side is ready for completion events:

- `process_payment_raw_event_v1` handles `payment.started` and `payment.completed`;
- canonical Payment writes are idempotent;
- paid Payment state is wired to the closed-won promotion trigger;
- `process_enrollment_raw_event_v1` handles `enrollment.completed`;
- Enrollment writes are idempotent;
- durable trusted events are persisted before projection and are retryable.

Current raw-event projection evidence:

```text
booking.completed    17 processed
booking.completed     2 dead_letter
payment.started       2 processed
payment.completed     0 received
enrollment.completed  0 received
```

The 2 booking dead letters are the already-reconciled duplicate/identity-ambiguous pair documented in:

`docs/checkpoints/M-2026-10-30-Booking-Dead-Letter-Reconciliation-v1.md`

They are not a new regression and must remain immutable until the Yogakulam reservation database supplies authoritative status.

---

## 7. Exact current checkpoint — LIVE VERIFIED-PAYMENT EMITTER

The current blocker is external to the SalsysOS projector.

The Yogakulam PHP verified-success handlers have not yet emitted:

```text
payment.completed
enrollment.completed
```

The live source is:

```text
source_system       website_backend
integration         yogakulam_php_backend
site                www.yogakulam.com
```

Validated adapter assets already exist:

- `integrations/php/yogakulam-verified-payment-enrollment.php`
- `integrations/php/yogakulam-direct-upi-completion.php`
- `docs/checkpoints/M-2026-10-30-Live-Commerce-Handler-Audit-v2.md`
- `docs/checkpoints/M-2026-10-30-Live-Yogakulam-Commerce-Patch-Manifest-v1.md`

Required live handler wiring:

1. PayPal verified-success path;
2. ICICI verified-return path;
3. Direct UPI admin verification path.

Completion emission must remain:

- provider/admin verified;
- after the local payment transaction commits as paid;
- fail-open with respect to Salsys tracking;
- deterministic/idempotent;
- based on business subtotal, not processor surcharge.

Do not emit completion from a browser success page or from an unverified payment/proof.

---

## 8. Required controlled live proof

After the live Yogakulam completion handlers are deployed, perform one controlled verified transaction and require:

```text
booking.completed
payment.started
payment.completed
enrollment.completed
```

Then verify:

```text
raw event processing failures         0 for the controlled sequence
Payment status                        paid/verified
Payment duplication                   none
Enrollment identity                   ENR-<booking_reference>
Enrollment duplication                none
Revenue amount                        business subtotal only
Customer 360                          payment + enrollment visible
Funnel / attribution                  realized conversion visible
System Health                         no new internal processing defect
```

Until this occurs, commerce must remain classified as:

`configuration_blocked / payment_completion_missing`

Do not create synthetic production payment/enrollment records merely to make the readiness state green.

---

## 9. Next sequence after commerce proof

Once real payment/enrollment completion is production-proven:

1. reconcile Revenue / Customer 360 / attribution from that real transaction;
2. continue broader real-activity acceptance and investigate only evidence-backed failures;
3. keep Google Ads parked as an external approval dependency;
4. keep Meta Ads permission/App Review separated from internal defects;
5. leave Search Indexing inactive until its dedicated activation checkpoint;
6. return to the PA-1 live identity decision only when a human explicitly approves one of its outcomes;
7. then choose the next genuine North-Star/productization checkpoint.

---

## 10. Locked engineering rules

- one controlled checkpoint at a time;
- verify before modifying;
- production facts beat stale documentation;
- tenant authority is server-derived;
- PostgreSQL/Supabase remains canonical transactional truth;
- OpenSearch remains derived/rebuildable when enabled;
- observed facts remain separate from inferred/modelled facts;
- no fabricated events, conversions, revenue, outcomes or training evidence;
- no automatic identity merge from ambiguous evidence;
- privacy/legal restrictions fail closed;
- browser telemetry does not establish authoritative payment/enrollment/revenue truth;
- high-impact autonomous actions remain human-governed unless explicitly activated;
- never create production data just to make a health metric green;
- migrations, build gates, deployment provenance and post-deploy verification are part of completion.

---

## 11. Resume instruction

When resuming in a new chat/session:

1. read `docs/SalsysOS_Active_Handoff.md`;
2. read this file;
3. read `docs/SalsysOS_North_Star_Product_Context.md`;
4. read `docs/checkpoints/M-2026-11-01-Real-Activity-Acceptance-v1.md`;
5. verify current `main`, production Supabase state and Vercel production SHA before changing anything;
6. continue from Section 7;
7. do not perform the unresolved PA-1 live identity merge without explicit human approval.
