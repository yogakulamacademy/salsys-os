# R2-P3 / Issue #528 — Consent identity continuity safety checkpoint

**State:** DRAFT / staging acceptance required. **No approved production rollout.**

The release under review changes `public/salsys-tracker.js` **only** for its identity and consent lifecycle. The optional R2-P1 website behavior collector is not activated. Existing consent HTTP endpoints, tenant-source routing, CRM identity promotion, payments, and website form submission contracts are unchanged.

## Confirmed baseline (synthetic runtime, old tracker)

An isolated Node VM loads the existing first-party tracker, fake storage, a synthetic form and mocked HTTP consent/event responses. No live customer identity or web browser is used.

On the prior SDK build, five newly introduced negative tests failed:
- withdrawing analytics did not rotate in-memory visitor/session IDs or clear per-tab identifiers;
- regrant in the same tab reused the prior identity and failed to open a fresh session-start/page-view boundary;
- a pending withdrawal allowed optional analytics events until server reply;
- a failed remote opt-out left the previous local grant effectively active;
- reloading the same tab after withdrawal restored the previous session-scoped visitor ID.

Three initial tests passed, including necessary form-submission evidence and unrelated marketing-preference changes.

## Draft remediation semantics

1. On an explicit analytics denial/withdrawal/opt-out/limited choice, the local browser stops optional analytics **immediately**, including while the consent request is pending.
2. Keep the privacy decision locally on remote consent errors; the caller still receives a failed Promise and the UI must not claim server receipt success.
3. Record the consent request using the *pre-rotation* visitor ID, then rotate the in-memory visitor and session IDs; clear persistent ID, first touch, event retry queue and stale sessionStorage identifiers.
4. Refresh synthetic/current forms' hidden `salsys_visitor_id` and `salsys_session_id`, keeping necessary `web.form_submitted` evidence available per the current policy.
5. On a later **server-acknowledged** analytics grant, restore fresh storage keys, session-start marker, first touch, and a new page-view observation.
6. Guard old in-flight event retries and obsolete queued events against crossing the new visitor identity boundary. Network requests already sent before withdrawal cannot be retracted.
7. Consent POST requests are serialized per tab. A conflicting server opt-out acknowledgment cannot override the local denial.
8. A previously explicit analytics opt-out must take precedence over a site declared default `granted` mode after a reload.
9. Normal approved sessions retain the existing same-tab visitor/session continuity. Marketing-only or advertising-only settings must not rotate analytics identity.

## Automated contract

`tests/readiness/r2-consent-identity-lifecycle-v1.test.cjs` executes the actual browser source using Node's `vm` with fake `window`, `document`, storage, forms and consent/event HTTP calls. It is included by the repository's `npm run test:readiness` CI step.

No real tracking endpoint, customer cookie, or CRM record is used. These synthetic checks do not prove how every browser implements storage or cross-tab events.

## Environment inventory and isolation gate (2026-11-06)

Read-only account/database verification found **no authorized staging website**:
- `organization_sites`: only the two active production hostnames (`yogakulam.com`, `yogakulamacademy.com`) and revoked/inactive `www` variants. No `environment=staging` site.
- `tracking_sources`: the matching two production sources are active under strict consent; both `www` sources are revoked. No active staging source.
- Vercel project `salsys-os`: latest production release is READY, but **no deployment for `test/r2-p3-consent-id-continuity-v1`** was found. There is no preview/staging custom domain on that project.
- Vercel preview configuration includes `SUPABASE_SECRET_KEY`, `SUPABASE_URL`, `TRACKING_INGEST_SECRET` and a publishable Supabase URL. Values were **not decrypted**, and isolation from the production Supabase project has **not been established**. Do not assume that a default PR preview is safe for test writes.

**Environment blocker:** no live customer-site experiment, production website changes, synthetic lead submission against production services, or guessed staging-domain registration is approved. An authorized owner must provision or identify an isolated HTTPS website, separate test CRM/backend and Supabase data project, register a `staging` site/source with strict consent, and verify that form/lead delivery is isolated (no customer emails/WhatsApp or payment actions).

Before running any manual acceptance, the release engineer must verify the staging source is active, the expected PR commit exactly matches the deployed commit and the staging Supabase endpoint is distinct from production. Use:

```bash
# Set the following in your own protected testing shell/CI environment.
# Do not paste secrets, credentials, cookies, customer IDs or values into GitHub.
export SALSYS_STAGING_SITE_ORIGIN="https://<approved-staging-site>"
export SALSYS_STAGING_CRM_ORIGIN="https://<isolated-staging-crm>"
export SALSYS_STAGING_SUPABASE_URL="https://<staging-supabase-host>"
export SALSYS_PRODUCTION_SUPABASE_URL="https://<production-supabase-host>"
export SALSYS_STAGING_SOURCE_HOSTNAME="<exact-staging-site-hostname>"
export SALSYS_STAGING_SOURCE_STATUS="active"
export SALSYS_STAGING_SOURCE_ENVIRONMENT="staging"
export SALSYS_STAGING_CONSENT_MODE="required"
export SALSYS_STAGING_FORM_CAPTURE_ISOLATED="yes"
export SALSYS_STAGING_OWNER_APPROVED="yes"
export SALSYS_STAGING_EXPECTED_COMMIT="<reviewed-PR-40-char-SHA>"
export SALSYS_STAGING_DEPLOYED_COMMIT="<actual-preview-40-char-SHA>"

node scripts/r2-consent-staging-preflight.mjs
```

This preflight makes **read-only assertions about operator-supplied staging configuration** and returns a nonzero exit on missing requirements. It performs no API calls, writes, or secret reads and does not certify that the operator supplied true information. Independently verify the source/site record and deployment metadata. A preflight PASS does **not** replace actual two-tab/CMP and exact-session lead-form acceptance.

## Controlled staging acceptance — REQUIRED BEFORE MERGE

Use disposable staging/site identities (never real prospects). Configure a test site's tracking source with `data-consent-mode="required"` and an authorized staging domain. Record aggregate result/status only; do not paste raw visitor IDs or credentials into GitHub issues.

| Scenario | Pass criterion |
|---|---|
| First consent grant; same-tab reload | Same visitor/session inside the consent epoch |
| Grant → withdraw | No further optional page/CTA analytics; local persistent key and retry queue cleared; old session-scoped identifiers not reused |
| Withdrawal server offline | UI shows save failure, while local tracking remains blocked and no old ID is restored |
| Withdraw → regrant in same tab | Fresh visitor/session; new session start; page view and synthetic forms use fresh IDs |
| Form submitted while denied | Existing necessary capture continues, without silently resuming optional analytics |
| Regrant request fails | Remains locally blocked; no persistent ID written |
| Denied/withdrawn on reload | No silent analytics regrant, including `granted` site mode with a prior explicit decision |
| New tab and browser restore | No old revoked identifier leaks from copied sessionStorage or browser restore |
| Two open tabs | Denial in one tab immediately suppresses optional tracking in the other; later grant does not reactivate the other's stale in-memory ID |
| Storage restricted/private window | Local privacy block remains effective; report any inability to persist preferences |
| Back/forward SPA navigation | No duplicated initial event or old-ID replay across consent epoch |
| Offline retry resolves after regrant | No pre-withdrawal event placed into new identity's retry queue |
| Trusted exact-session CRM identity handoff | Does not attach the new session to an earlier withdrawn visitor identifier |

**Cross-tab automated coverage added:** The synthetic harness now simulates two separate tab runtimes with shared localStorage and isolated sessionStorage. It checks withdrawal blocking, identity rotation, delayed consent-grant binding, old-event retry suppression, dropped storage notifications, frozen-tab restoration and stale sessionStorage after a second tab's regrant.

**Still unverified in real browsers:** The synthetic runner manually emits storage/pageshow notifications; it cannot prove native browser ordering, permissions, BFCache behavior, blocked storage or concurrent race timing. An authenticated staging acceptance check with two actual tabs and lead forms is required. Do **not** merge merely because CI passes.

## Release gates

- [ ] Full CI: readiness tests, TypeScript/build, loopback Playwright tests, financial tests
- [ ] CodeQL
- [ ] Manual staging matrix including two-tab and reload behavior
- [ ] Owner review of consent/identity continuity, customer form submission and trusted server handoff
- [ ] Approve production rollout explicitly, then merge/deploy and verify exact commit and no new error cluster

R2-P3 retention KPI Issue #527 stays open. R2-P2 owner/admin QA Issue #523 remains outstanding. R2-P1 optional collection Issue #520 remains OFF.
