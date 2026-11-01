# SalsysOS Current Checkpoint

**Checkpoint date:** 2026-11-01  
**Canonical repository:** `yogakulamacademy/salsys-os`  
**Production branch:** `main`  
**Verified production head:** `acf45497b4e40c4c270d2c4122d160f07eb02cb4`  
**Companion context:** `docs/SalsysOS_North_Star_Product_Context.md`  
**Fast resume file:** `docs/SalsysOS_Active_Handoff.md`

> This is the canonical operational checkpoint. Historical files under `docs/checkpoints/` are immutable evidence records and must not be rewritten to match later implementation state.

---

## 1. Current product position

SalsysOS is a **Sales + Analysis Operating System** connecting acquisition, first-party behavior, identity/customer journey, CRM execution, conversations, follow-up, commerce/revenue, attribution and intelligence.

Current production proving ground:

- Yogakulam Academy

Canonical production app:

- `https://crm.salsysos.com`

Current execution state:

- broad 14-surface engineering closeout: complete;
- PA-1 human-approved identity merge capability: production-deployed;
- real-activity acceptance through follow-up and payment-start: production-proven;
- provider-readiness parity for Google Ads + Meta Ads: complete;
- current program: **Production Acceptance & Operational Closeout**;
- next exact checkpoint: **North-Star Rebaseline & Next Roadmap Selection**.

No unresolved internal defect from the current acceptance sweep justifies another code patch before that rebaseline.

---

## 2. Verified release state

Latest provider-readiness release:

```text
PR                         #404
main SHA                   acf45497b4e40c4c270d2c4122d160f07eb02cb4
CI                         #1330 passed
CodeQL                     #615 passed
Production Smoke           #153 passed
Vercel production          READY on exact merge SHA
```

Production migration:

```text
version                    20261101141224
name                       google_ads_operational_readiness_v1
repository migration       20261101141500_google_ads_operational_readiness_v1.sql
```

The migration is additive/read-only and does not mutate provider credentials, selected assets, sync history, CRM/customer data or raw System Health evidence.

---

## 3. Stable production baseline

Known healthy/operational surfaces:

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

Intentional or externally blocked states:

```text
Google Ads Readiness       configuration_blocked   Google Cloud production API access
Meta Ads Readiness         configuration_blocked   missing Ads permission / account selection
Customer 360               warning                 2 human-review identity conflicts
Search Indexing            inactive                intentionally disabled
Commerce Events            configuration_blocked   payment_completion_missing
```

These states must remain distinct from internal runtime failures.

---

## 4. Google Ads provider readiness — closed internally

Live evidence:

```text
connection_status          connected
auth_mode                  oauth_user
adwords_scope_present      true
selected_asset_count       1
discovered_asset_count     2
latest_sync_status         failed
provider_error             CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION
```

Operational Readiness now reports:

```text
readiness_key              google_ads_readiness
health_status              configuration_blocked
operational_status         configuration_blocked
blocker_code               google_cloud_project_test_access
issue_count                1
```

Raw `v_google_ads_sync_health` remains failed with the original Google 403 provider error. This is intentional: readiness explains the external blocker without falsifying the failed sync evidence.

External action still required:

- obtain Google Ads API production access for the OAuth Cloud project (Explorer, Basic or Standard as appropriate).

Do not rotate credentials or change the selected Ads customer merely to make the raw failure disappear.

Detailed evidence:

`docs/checkpoints/M-2026-11-01-Provider-Readiness-Parity-v1.md`

---

## 5. Meta Ads provider readiness — already modeled correctly

Current production state:

```text
connection_status          connected
auth_mode                  system_user
ads_read/ads_management    missing
selected_meta_ad_account   none
operational_status         configuration_blocked
blocker_code               meta_ads_permission_missing
```

External/provider action remains:

1. grant `ads_read` or `ads_management` through the Meta business/app configuration;
2. reconnect Meta;
3. discover the available ad accounts;
4. select the intended production account.

Do not treat the stale Meta Ads dataset as evidence of a new SalsysOS runtime regression while this provider-authorization boundary remains unresolved.

---

## 6. Real-activity production acceptance

Read-only production trace:

`Lead -> Admissions -> Conversation -> Follow-up -> Payment/Enrollment -> Revenue`

Observed production inventory at the acceptance pass:

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

Production-proven:

- Lead presence / ingestion;
- Conversation presence;
- Admissions automation event creation;
- Admissions -> follow-up task creation;
- trusted `booking.completed` intake;
- trusted `payment.started` intake;
- durable raw-event processing for the active booking/payment-start flow.

All 20 Admissions automation events inspected had a matching canonical follow-up task for the same Lead, title and due time.

Detailed evidence:

`docs/checkpoints/M-2026-11-01-Real-Activity-Acceptance-v1.md`

---

## 7. Commerce completion — intentionally parked

Current canonical readiness remains:

```text
health_status                configuration_blocked
operational_status           payment_completion_missing
booking.completed            19
payment.started               2
payment.completed             0
enrollment.completed          0
```

The SalsysOS payment/enrollment projector is ready. The missing boundary is the external Yogakulam PHP verified-success emitter.

The user explicitly chose on 2026-11-01 to **skip the live-host deployment for now**.

Therefore:

- do not reopen or deploy the PHP commerce patch unless the user chooses to resume it;
- do not manufacture `payment.completed`, Enrollment or revenue records;
- continue to classify this path as unproven.

When resumed, the validated assets remain:

- `integrations/php/yogakulam-verified-payment-enrollment.php`;
- `integrations/php/yogakulam-direct-upi-completion.php`;
- `docs/checkpoints/M-2026-10-30-Live-Commerce-Handler-Audit-v2.md`;
- `docs/checkpoints/M-2026-10-30-Live-Yogakulam-Commerce-Patch-Manifest-v1.md`.

---

## 8. PA-1 identity decision — intentionally deferred

PA-1 engineering is complete through PRs #400, #401 and #402.

Live boundary remains:

```text
open pair conflicts      2
source Person status     active
merge audit rows         0
```

The identifiers are unverified. Do not merge or dismiss the pair without explicit human approval.

This decision does not block unrelated roadmap work.

---

## 9. Search Indexing — intentionally inactive

Broad Search Indexing remains disabled by design. PostgreSQL remains authoritative and OpenSearch remains derived/rebuildable.

Do not activate broad indexing merely to make System Health green. Activation requires its own controlled checkpoint.

---

## 10. Exact next checkpoint — NORTH-STAR REBASELINE

Before starting another engineering phase, review the canonical R0-R14 roadmap against the actual Nov. 1 production state.

The rebaseline must:

1. distinguish completed engineering surfaces from operational/provider dependencies;
2. distinguish production-proven behavior from implemented-but-unproven behavior;
3. keep planning estimates separate from telemetry facts;
4. identify the highest-value remaining internal product gap that is not blocked by commerce, provider approval, PA-1 human review or disabled Search Indexing;
5. select exactly one next roadmap checkpoint with a clear acceptance contract before implementation.

Primary candidate areas from the existing North-Star roadmap include:

- R9 AEO / GEO / AI Visibility;
- R10 Predictive Intelligence + Owner Command Center maturity;
- R11 Wellness / Education productization;
- R13 Commercial SaaS readiness.

Do not choose based only on the old percentage estimates; verify actual repository and production evidence first.

---

## 11. Locked engineering rules

- one controlled checkpoint at a time;
- verify before modifying;
- production facts beat stale documentation;
- tenant authority is server-derived;
- PostgreSQL/Supabase remains canonical transactional truth;
- OpenSearch remains derived/rebuildable;
- observed facts remain separate from inferred/modelled facts;
- raw provider failures must not be hidden by readiness labels;
- no fabricated events, conversions, revenue, outcomes or training evidence;
- no automatic identity merge from ambiguous evidence;
- privacy/legal restrictions fail closed;
- browser telemetry does not establish authoritative payment/enrollment/revenue truth;
- high-impact autonomous actions remain human-governed unless explicitly activated;
- never create production data merely to make a health metric green;
- migrations, build gates, deployment provenance and post-deploy verification are part of completion.

---

## 12. Resume instruction

When resuming:

1. read `docs/SalsysOS_Active_Handoff.md`;
2. read this file;
3. read `docs/SalsysOS_North_Star_Product_Context.md`;
4. read `docs/checkpoints/M-2026-11-01-Provider-Readiness-Parity-v1.md`;
5. verify current `main`, production Supabase state and Vercel production SHA before changing anything;
6. continue from Section 10;
7. do not resume commerce deployment or PA-1 live identity resolution unless the user explicitly chooses those parked paths.
