# M-2026-10-22 — Universal Tracking + Server Integration V1 checkpoint

## Status

**PRODUCTION PLATFORM CAPABILITIES MERGED / LIVE WEBSITE PHP CUTOVER STILL IN PROGRESS.**

This checkpoint records the Oct 22 tracking-platform work and the current Yogakulam PHP integration state. It deliberately distinguishes SalsysOS platform capabilities that are deployed from the external Yogakulam website integration that is still being installed and tested.

## Production references

- Canonical repository: `yogakulamacademy/salsys-os`
- Production branch: `main`
- Production head at checkpoint creation: `2060daf03e2a640820c7f1a83ff38fa7333c4506`
- Production deployment: `dpl_72Wd8Un2es2xyEHkpNhfDjhgLEU1`
- Deployment state: `READY`
- Public domains remain attached through the normal production project aliases.

## 1. Universal multi-tenant tracking model

Current canonical model:

`Organization -> Registered Site -> Tracking Source -> Canonical Events`

Browser path:

`Website -> Site ID + Origin -> canonical organization_site -> tracking_source -> canonical events`

Trusted server path:

`Backend -> Source Key + Server Secret -> POST /api/events/v1 -> tenant-scoped tracking source -> canonical events`

Important authority rule:

- browser events are journey/behavior/attribution telemetry;
- server events are durable backend facts or explicitly server-observed requests;
- payment, enrollment, refund and revenue truth must come from an authoritative backend path;
- missing evidence remains unknown rather than inferred.

## 2. Canonical site + www alias consolidation

The tracking site model was hardened so `www` hostnames are aliases of the real canonical site instead of separate user-facing websites.

Canonical active websites:

- `yogakulamacademy.com` — Site ID `SAL-089DAA06B6`; alias `www.yogakulamacademy.com`
- `yogakulam.com` — Site ID `SAL-D5A5A0E954`; alias `www.yogakulam.com`

Legacy `www` source records remain backward-compatible where required but are hidden from the normal source picker/manager so users see two real websites, not four apparent sites.

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

Current server-event source behavior includes:

- secret-authenticated source resolution;
- tenant/source isolation;
- payload-size enforcement;
- per-source rate limiting;
- sanitization;
- canonical raw-event ingestion;
- processing through the canonical event processor;
- idempotent retries using stable source event IDs;
- accepted/duplicate/rejected source counters;
- secret stored hash-only.

Supported server event families are intentionally restricted to:

- `web.*`
- `lead.*`
- `booking.*`
- `payment.*`
- `enrollment.*`

## 4. Server tracking source management

Existing server tracking sources can now be managed from the Tracking workspace.

Implemented operations:

- create server source;
- list/manage existing server sources;
- edit source name;
- edit stable source-system key;
- set source status active/paused;
- edit per-minute rate limit;
- edit max payload size;
- edit allowed event families within the approved prefix set;
- rotate the server secret;
- display the newly rotated secret once only;
- old secret stops working immediately after rotation;
- delete unused server tracking sources through the guarded management UI/API.

Server secrets are never redisplayed after initial creation/rotation because only the hash is stored.

## 5. Guided installation UX

Production includes a platform-first installation experience so end users do not need to understand transport syntax before they know where tracking belongs.

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

The UI explains, per platform:

- where server tracking belongs;
- where the secret must be stored;
- what backend action should trigger the event;
- which implementation/runtime example is relevant.

Raw examples remain an advanced layer rather than the main onboarding decision. Quick examples include PHP, Node, Python and cURL.

Key security guidance in the installer remains:

- never expose the server secret in HTML, browser JavaScript, GTM, mobile code or public repositories;
- server code belongs in the backend handler/webhook/function that knows the business action succeeded.

## 6. Yogakulam PHP / Hostinger installation — current state

The external Yogakulam website integration is **not yet called complete**.

Current intended private layout on the PHP website:

```text
public_html/
  includes_private/
    .htaccess
    salsys-config.php
    salsys-tracking.php
```

`includes_private` is being used because the current hosting setup placed the helper under the public web root. Direct HTTP access should be denied with `.htaccess` and secrets must never be exposed through browser code.

Recommended include from website backend handlers:

```php
require_once $_SERVER['DOCUMENT_ROOT']
    . '/includes_private/salsys-tracking.php';
```

This replaces path assumptions such as `dirname(__DIR__)` when the handler is nested at an uncertain depth.

### PHP helper behavior

The helper should:

- load private Salsys config;
- verify cURL availability;
- JSON-encode safely;
- use short connection/request timeouts;
- return success/status/response/error;
- never make a tracking outage break the primary website enquiry flow;
- log failures server-side rather than expose credentials/debug data to visitors.

## 7. Contact form integration audit

The reviewed `contact-process.php` flow was corrected conceptually to:

`validate -> INSERT enquiry -> obtain lastInsertId -> Salsys server event -> existing CRM capture -> emails -> public success response`

Important corrections identified during review:

- do not call `lastInsertId()` before `$stmt->execute()`;
- remove the duplicate CRM-capture block that previously ran before the DB insert;
- do not use an undefined `$insertedId` variable;
- reuse the website's existing `yk_visitor_id` and `yk_session_id` values for browser/server linkage;
- remove internal `crm_debug` from the public JSON response;
- use a stable server event ID tied to the stored enquiry;
- wrap Salsys tracking in `try/catch` so telemetry failure does not make the user-facing form fail.

### Duplicate-lead safety decision

The Yogakulam website already has an existing CRM lead capture path through `yogakulam_crm_capture_lead(...)`.

Until downstream duplicate semantics are explicitly proven across both ingestion paths, the contact handler should **not** blindly emit a second lead-creation event through the Events API.

Current safer tracking event for the contact handler:

```text
web.form_submitted
```

with a stable event ID such as:

```text
form_<website_enquiry_id>
```

The existing CRM capture path remains responsible for CRM lead creation.

This preserves the distinction:

- server `web.form_submitted` = server-confirmed form evidence;
- existing CRM capture = CRM lead creation.

## 8. Browser/server identity continuity

The current Yogakulam forms already capture legacy continuity fields:

- `yk_visitor_id`
- `yk_session_id`
- `yk_first_touch`
- `yk_session_touch`

The server event should forward the visitor/session IDs when available so browser attribution/journey evidence can be connected to the backend-confirmed action.

Do not rename these fields to `salsys_visitor_id` / `salsys_session_id` in the website integration unless the browser SDK/form contract is deliberately migrated at the same time.

## 9. What is proven vs pending

### Proven / deployed in SalsysOS

- universal server Events API;
- source authentication and tenant isolation;
- source counters/idempotency foundation;
- canonical site alias behavior;
- server source create/edit/pause/rotate/delete management;
- platform-first guided installation UI;
- production build/deploy for the current platform state is `READY`.

### Still pending before Universal Tracking live closeout

- successful live Yogakulam contact-form submission with the final PHP helper/include path;
- confirmed accepted `web.form_submitted` server event from the live website;
- browser/server visitor-session linkage verification on the same real enquiry;
- verification that browser-observed and server-confirmed form events reconcile without double-counting conversions;
- authoritative booking event contract selection and live proof;
- authoritative payment callback/webhook event proof;
- enrollment event proof;
- full campaign -> visitor -> enquiry -> CRM -> checkout -> payment -> enrollment -> revenue reconciliation.

## 10. Next execution sequence

1. Fix/verify the PHP helper include path using `$_SERVER['DOCUMENT_ROOT']`.
2. Keep the helper fail-safe so tracking cannot break the enquiry form.
3. Submit one controlled live contact enquiry.
4. Verify DB enquiry creation and existing CRM lead creation remain unchanged.
5. Verify the server tracking source records one accepted `web.form_submitted` event.
6. Verify visitor/session identity linkage and attribution evidence.
7. Only after lead/form evidence is stable, add booking and payment server events one business action at a time.
8. Do not mark Universal Tracking live closeout complete until the full acquisition-to-revenue acceptance path is reconciled.

## Safety / integrity rules preserved

- no server secret in frontend code;
- no invented event success;
- no claim that the external PHP integration is live until a real event is observed;
- no duplicate CRM lead creation merely to increase tracking coverage;
- PostgreSQL remains source of truth;
- browser telemetry is not authoritative payment/revenue truth;
- retries must reuse stable business event IDs;
- tracking failure must not break primary website business actions.
