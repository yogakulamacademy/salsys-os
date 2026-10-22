# SalsysOS Current Checkpoint

**Date:** 2026-10-22  
**Canonical repository:** `yogakulamacademy/salsys-os`  
**Production branch:** `main`  
**Latest verified product-code production head before checkpoint-only documentation commits:** `2060daf03e2a640820c7f1a83ff38fa7333c4506`  
**Latest verified production deployment for that product-code head:** `dpl_72Wd8Un2es2xyEHkpNhfDjhgLEU1` — `READY`

This is the canonical operational checkpoint. Historical milestone files under `docs/checkpoints/` remain evidence records and must not be rewritten to make earlier work look different from what was actually verified at the time.

The latest detailed tracking milestone is:

`docs/checkpoints/M-2026-10-22-Universal-Tracking-Server-Integration-v1.md`

## 0. Ordered product closeout status

The execution rule remains: close one major product area at production-integrity level before calling it complete and moving the active closeout target forward.

### Area 1 — Core CRM + lead/customer management: CLOSED V1

Canonical evidence:

`docs/checkpoints/M-2026-10-20-CRM-Core-Closeout-v1.md`

The CRM integrity closeout remains valid. PostgreSQL-backed lead/customer state, canonical stage mutation, ownership integrity and tenant boundaries remain the source of truth.

### Area 2 — Customer Journey / Person 360 / Identity: CLOSED V1

Canonical evidence:

`docs/checkpoints/M-2026-10-20-Customer360-Identity-Closeout-v1.md`

The identity closeout remains valid. Exact-session anonymous -> known identity handoff remains tenant-bound and atomic. Missing identity evidence must remain unknown rather than inferred.

### Area 3 — Universal Tracking SDK + Consent: ACTIVE

The platform foundation is substantially deployed, but the live production acquisition-to-revenue acceptance path is **not yet closed**.

Current production platform capabilities now include:

- universal browser + trusted server ingestion;
- canonical event contracts;
- tenant/source isolation;
- Site ID + origin verification for browser sources;
- secret-authenticated server sources;
- canonical site/www alias consolidation;
- source counters, rate limits and payload limits;
- server-source create/edit/pause/rotate/delete management;
- platform-first guided server installation UX;
- idempotent source-event ingestion;
- privacy-aware browser ingestion;
- browser/session/identity continuity foundations;
- direct first-party tracking direction rather than GTM as a core dependency.

Live Yogakulam PHP/Hostinger proof is still in progress and is the immediate blocker before this area can be called closed.

## 1. Universal multi-tenant tracking architecture

Canonical model:

`Organization -> Registered Site -> Tracking Source -> Canonical Events`

Browser path:

`Website -> public Site ID + requesting Origin -> canonical organization_site -> tracking_source -> canonical events`

Trusted server path:

`Backend -> Source Key + Server Secret -> POST /api/events/v1 -> tenant-scoped tracking source -> canonical events`

Authority rule:

- browser = journey, behavior and attribution telemetry;
- trusted server = durable backend facts or explicitly server-observed requests;
- payment/enrollment/refund/revenue completion must come from authoritative backend confirmation;
- server-observed requests are not magically equivalent to client-only interaction telemetry;
- unknown/missing evidence stays unknown.

## 2. Canonical website model

The tracking UI no longer treats `www` aliases as separate websites.

Canonical active sites:

- `yogakulamacademy.com` — public Site ID `SAL-089DAA06B6`; alias `www.yogakulamacademy.com`
- `yogakulam.com` — public Site ID `SAL-D5A5A0E954`; alias `www.yogakulam.com`

Legacy `www` source records remain backward-compatible where needed but are hidden from normal canonical site selection/management.

The public Site ID is **not a secret**. Browser authorization is based on Site ID + trusted origin/domain resolution.

## 3. Server Events API

Canonical endpoint:

```text
POST https://salsysos.com/api/events/v1
```

Authentication:

```http
X-Salsys-Source-Key: src_xxxxx
Authorization: Bearer <server secret>
```

Current server source behavior includes:

- secret-authenticated source resolution;
- organization/source isolation;
- source status enforcement;
- payload-size enforcement;
- per-source rate limiting;
- sanitization/redaction boundary;
- canonical raw-event ingestion;
- processing through the canonical event processor;
- accepted/duplicate/rejected tracking counters;
- stable-event-id retry semantics;
- server secret stored hash-only.

Supported server event-family prefixes remain deliberately restricted to:

- `web.*`
- `lead.*`
- `booking.*`
- `payment.*`
- `enrollment.*`

## 4. Server tracking source operations

The Tracking workspace supports server-source lifecycle management.

Implemented:

- create server source;
- show Source Key + new secret once on creation;
- list/manage existing server sources;
- edit source name;
- edit source-system key;
- activate/pause source;
- edit rate limit;
- edit max payload size;
- edit allowed event families inside the approved prefix set;
- rotate secret;
- show rotated secret once only;
- invalidate the old secret immediately after rotation;
- delete unused server tracking sources through the guarded management action.

Existing secrets are never redisplayed because only their hash is retained.

## 5. Guided server installation UX

Server tracking onboarding is now platform-first rather than syntax-first.

Primary platform choices include:

- PHP / Hostinger
- WordPress / WooCommerce
- Shopify
- Node / Next.js / Express
- Laravel
- Python
- Supabase
- Firebase
- AWS
- Vercel
- n8n
- Make
- Zapier
- Custom / Other

The installation experience tells the user:

1. where the integration belongs;
2. where the server secret must be stored;
3. which backend action should trigger the event;
4. which example/runtime pattern to use;
5. how to verify the first event.

Advanced raw examples remain available for PHP, Node, Python and cURL.

Security rule remains non-negotiable: the server secret must never be placed in HTML, browser JavaScript, GTM, mobile code, or a public repository.

## 6. Yogakulam PHP / Hostinger integration — current live-site status

This integration is **IN PROGRESS — not yet proven live**.

Current intended helper layout on the Yogakulam website:

```text
public_html/
  includes_private/
    .htaccess
    salsys-config.php
    salsys-tracking.php
```

Because this folder is under `public_html`, direct HTTP access should be denied. If hosting later permits moving the secret/config outside the public web root, that is preferable.

Recommended handler include:

```php
require_once $_SERVER['DOCUMENT_ROOT']
    . '/includes_private/salsys-tracking.php';
```

This is preferred over fragile relative-depth assumptions when the handler location is nested.

The helper should be fail-safe:

- check PHP cURL availability;
- JSON-encode safely;
- use short connect/request timeouts;
- return status/error details to server code;
- never expose the secret;
- never make a tracking outage break the primary enquiry/payment/enrollment action;
- log tracking failures server-side.

## 7. Contact-form integration — reviewed state

The reviewed `contact-process.php` should follow this order:

`validate -> INSERT enquiry -> obtain lastInsertId -> Salsys server event -> existing CRM capture -> emails -> public success response`

Corrections already identified during review:

- `lastInsertId()` must run only after `$stmt->execute()` succeeds;
- the duplicate CRM-capture block that ran before the DB insert must be removed;
- an undefined `$insertedId` must not be used;
- internal CRM debug output must not be exposed to public form responses;
- tracking should be wrapped so a telemetry failure cannot make the form fail;
- use the existing Yogakulam browser continuity fields rather than inventing a second field contract mid-cutover.

Existing Yogakulam continuity fields:

- `yk_visitor_id`
- `yk_session_id`
- `yk_first_touch`
- `yk_session_touch`

For browser/server linkage, the server event should forward the existing visitor/session IDs when available.

### Duplicate CRM lead safety

The website already has an existing CRM lead creation path through `yogakulam_crm_capture_lead(...)`.

Until downstream duplicate semantics are explicitly proven across the old CRM capture path and the new Events API, the contact handler should not blindly emit a second lead-creation event.

Current safer server-tracking event for the contact handler:

```text
web.form_submitted
```

with a stable server event ID such as:

```text
form_<website_enquiry_id>
```

Current responsibility split:

- `web.form_submitted` = server-confirmed form evidence;
- existing `yogakulam_crm_capture_lead(...)` = CRM lead creation.

This prevents tracking expansion from creating duplicate CRM leads.

## 8. Live tracking acceptance path still required

Do **not** call Universal Tracking complete until a real production journey proves and reconciles:

`campaign/click id -> website visitor -> session -> page/CTA behavior -> consent -> enquiry/form -> CRM lead -> exact-session identity -> checkout -> payment -> enrollment -> revenue -> attribution -> features/prediction -> observed outcome`

The same journey should reconcile across PostgreSQL-backed Tracking, Person 360, Funnel, Attribution and Revenue views.

Immediate live proof sequence:

1. fix/verify the PHP helper include path;
2. confirm the contact form still successfully creates the website enquiry;
3. confirm existing CRM lead creation remains unchanged;
4. observe an accepted server `web.form_submitted` event from the live website;
5. verify visitor/session linkage on that same enquiry;
6. reconcile browser-observed vs server-confirmed form evidence without double-counting conversion;
7. add authoritative booking tracking only after selecting/verifying the exact booking event contract;
8. add `payment.completed` only from a verified payment callback/webhook/backend confirmation;
9. add enrollment completion from the authoritative enrollment state transition;
10. complete acquisition-to-revenue reconciliation.

## 9. Event Intelligence state

Event Intelligence remains built around PostgreSQL evidence first.

Completed foundations still include:

- immutable/canonical raw-event evidence;
- tracking source and contract registries;
- privacy-aware signal quality;
- feature-store foundations;
- deterministic prediction ledger with evidence/reason codes;
- outcome observation/calibration instrumentation;
- freshness guards;
- optional rebuildable OpenSearch projection.

OpenSearch remains a **secondary rebuildable retrieval/intelligence index**, not the authority for raw events, identity, consent, CRM state, payments, enrollments, revenue, features, predictions or observed outcomes.

Rules-generated scores must never be presented as calibrated probabilities. Current evidence remains insufficient to claim broadly proven predictive accuracy from real outcomes.

## 10. Messaging / channel milestones

### WhatsApp

Controlled production WhatsApp E2E proof remains valid, including provider lifecycle, inbound reply handling, stop-on-reply behavior, suppression, approvals, frequency caps, idempotency and fail-closed send gates.

Customer messaging remains deliberately fail-closed unless explicitly armed.

### Instagram

Instagram Operations V1 remains implemented with Meta-compatible user-initiated messaging semantics. Broader live proof still depends on the connected account/app permission posture where applicable; do not invent a WhatsApp-style cold-broadcast primitive for Instagram.

## 11. Active ordered implementation sequence

1. **Core CRM + lead/customer management — CLOSED V1**
2. **Customer Journey / Person 360 / Identity — CLOSED V1**
3. **Universal Tracking SDK + consent — ACTIVE; close Yogakulam live production proof**
4. Funnel + attribution + revenue — close full E2E reconciliation
5. WhatsApp automation — remaining Operations/Growth production proof
6. Instagram automation — provider-permission/live E2E proof
7. Smart Triggers/workflow engine — final closeout audit
8. SEO/AEO/search intelligence — final closeout audit
9. Event Intelligence/feature store — final closeout audit
10. Predictive-model infrastructure — readiness/promotion closeout
11. Proven predictive accuracy from real outcomes — data-dependent calibration proof
12. Advanced R11–R14 intelligence/autonomy — later North-Star work

Do not skip forward while the active area has an unresolved production-integrity blocker.

## 12. Safety defaults

Unless a separate approved checkpoint explicitly changes them:

- autonomous customer messaging OFF;
- automatic website publishing OFF;
- automatic ad-budget changes OFF;
- broad/global OpenSearch indexing OFF;
- PostgreSQL remains source of truth;
- human approval remains required for sensitive/high-impact actions;
- server secrets remain backend-only;
- payment/enrollment/revenue truth remains backend-authoritative;
- no fake traffic, rankings, revenue, conversion outcomes or model-training evidence;
- no claim of tracking success without observed evidence.

## 13. Checkpoint maintenance rule

After every meaningful production milestone:

- update this file;
- update `docs/SalsysOS_North_Star_Product_Context.md` if roadmap/progress materially changes;
- update the relevant active checkpoint;
- add a historical milestone record when production proof materially changes system state;
- distinguish built, merged, deployed, tested and fully E2E-proven states;
- preserve historical evidence rather than rewriting it to match the latest plan.
