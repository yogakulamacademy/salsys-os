# SalsysOS Active Handoff

**Purpose:** fast recovery after an interrupted conversation or tool connection.  
**Updated:** 2026-10-20  
**Repository:** `yogakulamacademy/salsys-os`  
**Production branch:** `main`  
**Production head at this handoff:** `1a15f8fca89c7f76f7111eeb92b221e43cd82437`

Read this file first when resuming active engineering. Then read:

- `docs/SalsysOS_Current_Checkpoint.md`
- `docs/SalsysOS_North_Star_Product_Context.md`
- the latest relevant file under `docs/checkpoints/`

Historical checkpoint files are evidence records and should not be rewritten to make earlier work look different.

---

## 1. Product identity and execution rule

SalsysOS = **Sales + Analysis Operating System**.

It is being built as a **Customer Journey Intelligence + Revenue Intelligence operating system**, not a generic CRM.

Core loop:

`marketing -> traffic -> source/campaign/content -> anonymous journey -> identity -> lead -> conversation -> intent/affinity -> salesperson/follow-up -> booking/payment/enrollment -> revenue -> attribution -> feature state -> prediction/recommendation -> action -> observed outcome -> learning`

Execution rule currently in force:

> **Close one product area completely before moving to the next.**

Do not skip an unresolved production-integrity blocker.

---

## 2. Ordered closeout status

### Area 1 — Core CRM + lead/customer management

**CLOSED — V1 production-integrity level.**

Evidence:

- `docs/checkpoints/M-2026-10-20-CRM-Core-Closeout-v1.md`
- production integrity health = healthy;
- zero audited integrity issues;
- canonical stage/history, ownership, tenant and message-lineage invariants protected.

### Area 2 — Customer Journey / Person 360 / Identity

**CLOSED — V1 production-integrity level.**

Evidence:

- `docs/checkpoints/M-2026-10-20-Customer360-Identity-Closeout-v1.md`
- exact-session anonymous-to-lead/Person handoff is one atomic service-role-only transaction;
- conservative explicit identity policies;
- production identity health = healthy;
- zero audited integrity issues.

### Area 3 — Universal Tracking SDK + Consent

**ACTIVE. Engineering platform is substantially built; live production closeout remains open.**

Latest engineering evidence:

- PR #89 — live tracking/consent closeout health;
- PR #90 — publishable cross-platform client SDK V1;
- PR #91 — Web Platform Adapters V1;
- PR #92 — installable WordPress Tracking Adapter V1;
- PR #93 — Tracking Sources management UI V1;
- `docs/checkpoints/M-2026-10-20-Universal-Tracking-Platform-Engineering-v1.md`.

Current production tracking health for Yogakulam:

- 4 active browser sources;
- 4/4 strict origin sources;
- 0 missing privacy-notice versions;
- GPC enabled on all;
- optional consent required on all;
- 0 Universal browser events observed through the new path;
- 0 browser consent receipts through the new path;
- `backend_status = not_live`;
- 0 publishable Android/iOS/Shopify client sources currently provisioned for Yogakulam.

Therefore **tracking engineering is not the same as live closeout**. Do not mark Area 3 closed until the live website and trusted business-event E2E journey is proven.

### Next areas after Area 3

4. Funnel + Attribution + Revenue — final E2E revenue reconciliation
5. WhatsApp Automation — remaining broad Operations/Growth production proof
6. Instagram Automation — Meta permission + live E2E proof
7. Smart Triggers / workflow engine — final closeout audit
8. SEO / AEO / search intelligence — final closeout audit
9. Event Intelligence / feature store — final closeout audit
10. Predictive-model infrastructure — final readiness/promotion closeout
11. Proven predictive accuracy — data-dependent real-outcome calibration
12. R11–R14 advanced autonomy/productization/commercial expansion

---

## 3. Universal Tracking Platform — current architecture

One canonical event system must support all target platforms.

Target chain:

`SDK/adapter -> canonical event contract -> privacy/authority gate -> PostgreSQL raw_events -> processing -> identity/journey -> attribution/revenue -> features/predictions -> outcomes`

PostgreSQL is authoritative. OpenSearch is derived/rebuildable only.

### Browser/web foundation

- `public/salsys-intelligence.js`
- `public/salsys-tracker.js`
- `public/salsys-consent.js`
- `/api/events/browser/v1`
- `/api/events/identify/v1`
- `/api/privacy/consent/v1`

Browser SDK supports anonymous visitor/session identity, UTMs/click IDs, first/session touch, page/session/CTA/form events, SPA navigation, form decoration, consent/GPC handling, sanitization and retry queue.

### Publishable client foundation

- `/api/events/client/v1`
- `/api/privacy/consent/client/v1`
- publishable `client` source type;
- no trusted secret embedded in apps/storefronts;
- `app.*` and safe `web.*` telemetry only;
- PII-key redaction;
- source-scoped rate limits;
- consent receipts;
- SDK provenance and source health.

### Android

Kotlin SDK V1 under `sdk/android/`.

Includes:

- publishable source key;
- `app.*` telemetry;
- consent state;
- anonymous visitor/session IDs;
- bounded offline queue/retry;
- SDK name/version/platform metadata;
- no trusted server secret.

### iOS

Swift Package SDK V1 under `sdk/ios/` with equivalent consent/session/offline/provenance behavior.

### WordPress

Installable plugin:

`integrations/wordpress/salsys-tracking/`

It loads the canonical browser SDK and optional Salsys consent UI. It does **not** create a separate tracking engine or database.

### Webflow / Framer / custom sites

Use the same canonical browser SDK through platform-appropriate site-level custom-code installation.

### Shopify

Adapters under `integrations/shopify/`:

- Custom Pixel adapter;
- Web Pixel Extension source.

Shopify browser/pixel events are observational only. Confirmed order/payment/refund/revenue truth stays server-side.

### Trusted server events

`/api/events/v1`

Authenticated source secret is required. Use this for authoritative business facts such as payment success, enrollment, refund and revenue.

### Source management UI

Tracking Sources workspace exists at the product layer with platform cards for:

- custom web;
- WordPress;
- Webflow;
- Framer;
- Shopify;
- Android;
- iOS.

It supports tenant-bound provisioning, install instructions, privacy/source health, SDK provenance, last-seen and event counters.

---

## 4. Tracking closeout — exact remaining work

The next controlled checkpoint is **live Yogakulam cutover**.

Required proof sequence:

1. identify the actual shared live-site script/layout files;
2. audit current GTM/GA/Meta/legacy Salsys/YK tracker placement;
3. install `salsys-intelligence.js` and `salsys-consent.js` exactly once;
4. avoid duplicate legacy + Universal tracking;
5. Reject All -> optional analytics must not persist;
6. Accept All -> canonical `web.session_started` + `web.page_viewed`;
7. Customize -> purpose-specific consent evidence;
8. withdraw consent -> correct receipt/state and storage cleanup;
9. GPC -> sale/sharing opted out where applicable;
10. verify CTA events;
11. mark real lead forms with Salsys lead-form selector/attribute;
12. prove form start/submit events without sending arbitrary input values;
13. preserve visitor/session IDs through lead capture;
14. server-side `/api/events/identify/v1` -> exact-session lead/Person link;
15. trusted server booking/payment/enrollment/revenue events;
16. reconcile one controlled journey across Tracking, Person 360, Funnel, Attribution and Revenue;
17. health view reaches `backend_closeout_candidate` with no rejections/dead letters/stuck processing;
18. only then close Area 3.

Do not invent a Hostinger path. Earlier project files show shared include calls such as `includes/inside-head-script.php`, `includes/script.php`, and `includes/inside-body-script.php`, but the actual live hosting root/path still needs direct confirmation before editing.

---

## 5. WhatsApp Automation — current state

WhatsApp Operations/Growth V1 engineering is highly complete.

Implemented across PRs #80–#83 and earlier Smart Trigger milestones:

- shared CRM inbox;
- human replies + AI-assisted drafts;
- quick replies;
- Meta template sync;
- reusable audience segments;
- broadcast campaign builder;
- schedule/approval/pause/cancel lifecycle;
- guarded per-recipient provider runner;
- suppression/STOP;
- frequency caps;
- quiet hours;
- verified-primary-contact checks;
- approved-template checks;
- idempotency;
- retry/re-arm controls;
- sent/delivered/read/replied reconciliation;
- personalization;
- Control/Challenger A/B campaigns;
- recipient/variant snapshot freezing;
- reply routing;
- operational conversion/revenue attribution;
- hardened service-role execution boundary.

Production safety defaults remain fail-closed unless a separate approved checkpoint arms them.

The controlled WhatsApp safety/E2E chain has been proven previously. Broader Operations/Growth live campaign proof remains a later ordered closeout item.

---

## 6. Instagram Automation — current state

Instagram Operations V1 is merged/deployed.

Implemented:

- inbound DM -> CRM;
- human outbound replies;
- 24-hour standard reachability enforcement;
- quick replies;
- keyword/event rules;
- comment webhook ingestion;
- guarded one-time comment -> private-DM automation;
- STOP/suppression;
- frequency limits;
- human approvals;
- idempotency;
- fail-closed provider/pilot controls;
- scheduled runner;
- CRM message lineage/reply reconciliation;
- Instagram Operations workspace.

External live dependency:

- connected Instagram account must be reauthorized with `instagram_business_manage_comments`;
- relevant Meta webhook/app permissions must be active.

Do not introduce cold/bulk Instagram DM behavior; the design intentionally follows Meta's user-initiated model.

---

## 7. Event Intelligence / predictive state

Infrastructure exists for:

- immutable `raw_events`;
- tracking sources/contracts;
- feature store;
- deterministic prediction ledger;
- freshness/expiry guards;
- privacy-aware signal quality;
- Safe-V2 lead feature snapshots;
- realized-outcome observation;
- calibration metrics/drift instrumentation;
- scheduled outcome observer;
- derived OpenSearch feature/prediction projections.

Critical truth:

**Do not claim calibrated predictive accuracy yet.**

Current bottlenecks remain real data:

- no genuine production `lead_conversion_probability` outputs established as calibrated probabilities;
- Safe-V2 labeled training evidence is insufficient;
- live consented web behavior is still missing from the Universal tracking path;
- model training/promotion must remain blocked until privacy-safe labels/outcomes meet thresholds.

Rules/deterministic scores must remain clearly distinct from probabilities.

---

## 8. Production/CI state at this handoff

Current main head:

`1a15f8fca89c7f76f7111eeb92b221e43cd82437`

Latest main CI:

- run #266;
- conclusion: **success**.

Current production Vercel deployment for that SHA:

- deployment: `dpl_6HpMP49zHgzq8zhzUgkv7r41iRG5`;
- state: **READY**;
- target: production.

Latest Universal Tracking production migrations confirmed applied:

- `tracking_live_closeout_health_v1`;
- `universal_publishable_client_v1`;
- `tracking_client_source_health_v1`.

---

## 9. Safety and architecture rules that must not regress

- tenant/org authority is server-derived;
- client-provided IDs never authorize tenant access;
- PostgreSQL remains source of truth;
- OpenSearch remains derived/rebuildable;
- no trusted server secret in browser/mobile/Shopify client code;
- browser/mobile telemetry cannot establish payment/enrollment/revenue truth;
- exact-session identity handoff remains tenant-bound and atomic;
- consent/privacy is enforced before optional behavioral persistence where required;
- no fingerprinting or consent circumvention;
- unavailable behavior = unknown, not negative intent;
- no fabricated traffic, rankings, revenue, conversions, outcomes or model-training evidence;
- no calibrated-probability claim without real evaluation evidence;
- autonomous/high-impact customer actions remain fail-closed/human-governed unless explicitly enabled;
- do not mix unrelated work into controlled checkpoints.

---

## 10. Current planning estimates

Planning estimates only — not telemetry-derived:

- Core product through roughly R10: about **96%** complete;
- full R0–R14 North-Star: about **77%** complete.

The tracking platform engineering expansion does not by itself make Area 3 100% complete because live tenant installation and end-to-end production reconciliation remain unproven.

---

## 11. Resume instruction

When resuming after interruption:

1. verify current `main` before modifying anything;
2. read this handoff + current checkpoint + North-Star context;
3. confirm whether Area 3 live website cutover is still the active blocker;
4. do not rebuild completed SDK/adapters unless verification finds regression;
5. continue one controlled checkpoint at a time;
6. after each meaningful milestone, update this handoff and the canonical checkpoint/context docs.
