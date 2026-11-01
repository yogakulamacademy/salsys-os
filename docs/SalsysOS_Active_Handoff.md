# SalsysOS Active Handoff

**Purpose:** Fast recovery after an interrupted engineering session.  
**Updated:** 2026-11-01  
**Repository:** `yogakulamacademy/salsys-os`  
**Production branch:** `main`  
**Verified production head at acceptance start:** `ca4de2d58fc7d950376ff0bf8150fe812c04386b`

Read this file first when resuming active work. Then read:

1. `docs/SalsysOS_Current_Checkpoint.md`
2. `docs/SalsysOS_North_Star_Product_Context.md`
3. `docs/checkpoints/M-2026-11-01-Real-Activity-Acceptance-v1.md`

Historical checkpoint files are evidence records and must not be rewritten to match later state.

---

## 1. Product identity and execution rule

SalsysOS = **Sales + Analysis Operating System**.

Canonical loop:

`marketing -> traffic -> source/campaign/content -> anonymous journey -> identity -> lead/opportunity -> conversation -> intent/affinity -> salesperson/follow-up -> booking/payment/enrollment -> revenue -> attribution -> recommendation -> action -> observed outcome -> learning`

Execution rule:

> **Verify first, close one controlled checkpoint at a time, and never replace missing evidence with assumptions.**

---

## 2. Stable closeout state

The prior broad 14-surface engineering closeout is complete. Do not reopen it without production evidence of regression.

Current production health already verified:

- CRM Core: healthy;
- Admissions Automation: healthy;
- Universal Tracking: healthy / collecting;
- Website Lead Capture: healthy;
- GA4: healthy;
- Google Search Console: healthy;
- Privacy Compliance: healthy;
- WhatsApp: healthy.

Parked states:

- Google Ads: external production-access approval blocker;
- Meta Ads: provider permission / App Review dependency;
- Search Indexing: intentionally inactive;
- Customer 360: two unresolved human-review identity conflicts.

---

## 3. PA-1 identity merge — capability complete, decision deferred

PA-1 engineering is complete and production-deployed through PRs #400, #401 and #402.

The live identity pair remains intentionally untouched:

```text
open pair conflicts      2
source Person status     active
merge audit rows         0
```

Do not perform the live merge or dismiss the conflicts unless a human explicitly approves one of those outcomes. The relevant identifiers are unverified.

This unresolved decision does **not** block unrelated production-acceptance work.

---

## 4. Real-activity production acceptance

A read-only production trace was run across:

`Lead -> Admissions -> Conversation -> Follow-up -> Payment/Enrollment -> Revenue`

Live inventory observed:

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

### Production-proven

- Lead presence / ingestion;
- Conversation presence;
- Admissions automation event creation;
- Admissions -> follow-up task creation;
- trusted `booking.completed` intake;
- trusted `payment.started` intake;
- durable raw-event persistence and projection for active booking/payment-start flow.

All 20 Admissions automation events inspected have a matching canonical follow-up task for the same Lead, title and due time.

---

## 5. Commerce completion status

Canonical Commerce Event Readiness currently reports:

```text
health_status                configuration_blocked
operational_status           payment_completion_missing
booking.completed (30d)      19
payment.started (30d)         2
payment.completed (30d)       0
enrollment.completed (30d)    0
```

Both `payment.started` events projected successfully into canonical Payment rows, but both remain pending.

There is no live authoritative paid Payment or canonical Enrollment from the Yogakulam checkout yet.

Raw-event processing evidence:

```text
booking.completed    17 processed
booking.completed     2 dead_letter
payment.started       2 processed
payment.completed     0 received
enrollment.completed  0 received
```

The two booking dead letters are the already-reconciled duplicate/identity-ambiguous pair from `M-2026-10-30-Booking-Dead-Letter-Reconciliation-v1.md`; they are not a new regression and must remain untouched until authoritative reservation status exists.

---

## 6. Internal SalsysOS commerce side is ready

Verified production functions already support the completion path:

- `process_payment_raw_event_v1` handles `payment.started` and `payment.completed`;
- canonical Payment projection is idempotent;
- paid Payment state triggers closed-won promotion;
- `process_enrollment_raw_event_v1` handles `enrollment.completed`;
- Enrollment projection is idempotent;
- durable trusted events persist before projection and can be retried safely.

Do not patch the SalsysOS projector merely because completion events are absent. The missing boundary is upstream.

---

## 7. EXACT CONTINUATION POINT — LIVE VERIFIED-PAYMENT EMITTER

The next work item is the external Yogakulam PHP verified-success integration.

Current live source:

```text
source_system       website_backend
integration         yogakulam_php_backend
site                www.yogakulam.com
```

Validated repository assets already exist:

- `integrations/php/yogakulam-verified-payment-enrollment.php`
- `integrations/php/yogakulam-direct-upi-completion.php`
- `docs/checkpoints/M-2026-10-30-Live-Commerce-Handler-Audit-v2.md`
- `docs/checkpoints/M-2026-10-30-Live-Yogakulam-Commerce-Patch-Manifest-v1.md`

Required live handler wiring:

1. PayPal verified-success path;
2. ICICI verified-return path;
3. Direct UPI admin verification path.

Completion events must be emitted only after authoritative verification and after the local payment transaction commits as `paid`. Tracking remains fail-open and must never roll back a real payment.

Never emit `payment.completed` from a browser success page or an unverified payment/proof.

---

## 8. Required live acceptance proof

After deploying the verified-success handlers to the Yogakulam host, execute one controlled real verified payment and require:

```text
booking.completed
payment.started
payment.completed
enrollment.completed
```

Then verify:

- no raw-event processing failure for the controlled sequence;
- existing Payment becomes paid/verified without duplication;
- Enrollment identity is deterministic: `ENR-<booking_reference>`;
- no duplicate Enrollment on retry/revisit;
- realized revenue equals business subtotal, excluding processor surcharge;
- Customer 360 shows the payment + enrollment journey;
- funnel/attribution receives the realized conversion;
- System Health shows no new internal defect.

Until that occurs, commerce remains:

`configuration_blocked / payment_completion_missing`

Do not manufacture production `payment.completed`, Enrollment or revenue records to make readiness green.

---

## 9. After commerce proof

1. reconcile Revenue, Customer 360 and attribution against the verified transaction;
2. continue broader real-activity acceptance only where evidence exists;
3. keep Google Ads parked as external approval work;
4. keep Meta Ads provider/App Review work separate;
5. leave Search Indexing inactive;
6. return to the PA-1 live identity decision only with explicit human approval;
7. choose the next genuine North-Star/productization checkpoint.

---

## 10. Safety rules that must not regress

- tenant authority is server-derived;
- PostgreSQL/Supabase remains canonical transactional truth;
- browser telemetry does not establish authoritative payment/enrollment/revenue truth;
- observed, matched, attributed, inferred and modelled evidence remain distinct;
- no fabricated production events, conversions, revenue or outcomes;
- no automatic identity merge from ambiguous evidence;
- privacy/legal restrictions fail closed;
- high-impact autonomous actions remain human-governed unless explicitly activated;
- never create or mutate production customer data merely to make a health metric green.

---

## 11. Resume instruction

When resuming:

1. verify current `main`, production Supabase state and Vercel production SHA;
2. read this file and `docs/SalsysOS_Current_Checkpoint.md`;
3. read `docs/checkpoints/M-2026-11-01-Real-Activity-Acceptance-v1.md`;
4. continue from Section 7;
5. do not perform the PA-1 live identity merge without explicit human approval.
