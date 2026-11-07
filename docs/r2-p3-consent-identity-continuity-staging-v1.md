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
export SALSYS_STAGING_CRM_PROJECT_ID="prj_<independent-vercel-staging-project-id>"
export SALSYS_PRODUCTION_CRM_PROJECT_ID="prj_<existing-production-vercel-project-id>"
export SALSYS_STAGING_SUPABASE_URL="https://<staging-supabase-host>"
export SALSYS_PRODUCTION_SUPABASE_URL="https://<production-supabase-host>"
export SALSYS_RECOVERY_SUPABASE_URL="https://<recovery-rehearsal-supabase-host>"
export SALSYS_STAGING_SOURCE_HOSTNAME="<exact-staging-site-hostname>"
export SALSYS_STAGING_SOURCE_STATUS="active"
export SALSYS_STAGING_SOURCE_ENVIRONMENT="staging"
export SALSYS_STAGING_CONSENT_MODE="required"
export SALSYS_STAGING_FORM_CAPTURE_ISOLATED="yes"
export SALSYS_STAGING_EXTERNAL_EFFECTS_DISABLED="yes"
export SALSYS_STAGING_SCHEDULED_JOBS_DISABLED="yes"
export SALSYS_STAGING_OWNER_APPROVED="yes"
export SALSYS_STAGING_EXPECTED_COMMIT="<reviewed-PR-40-char-SHA>"
export SALSYS_STAGING_DEPLOYED_COMMIT="<actual-preview-40-char-SHA>"

node scripts/r2-consent-staging-preflight.mjs
```

**Production preview isolation:** Stage the CRM on a *different Vercel project*, not a Preview deployment inside the production `salsys-os` project. The read-only preflight checks the two supplied project IDs are well-formed and different; this is an assertion based on provided metadata, not a Vercel API verification. Independently inspect the deployed project identity and browser/server Supabase target before acceptance. Staging website and CRM origins must not be any production host or its subdomain, including `*.yogakulam.com`, `*.yogakulamacademy.com` or `*.salsysos.com` (shared-domain cookies and integrations may leak between environments).

**No-send requirement:** Set `SALSYS_STAGING_EXTERNAL_EFFECTS_DISABLED=yes` and `SALSYS_STAGING_SCHEDULED_JOBS_DISABLED=yes` *only after confirming* that the staging project cannot send real WhatsApp/Instagram/email/SMS, ad conversion or payment actions and cannot execute Vercel Cron/queue runners. Do not merely set these flags to bypass the preflight; the script never configures or disables services. Verify the absence of production provider credentials, isolate test contacts and audit network calls in the eventual staging acceptance. Because this repository's `vercel.json` includes scheduled jobs, do not auto-deploy an unreviewed staging build using inherited Preview credentials.

**Non-billable preparation mode:** Until staging costs are explicitly approved, run only checked-in, loopback/mock CI, code review, the offline preflight regression suite and draft the owner acceptance evidence. A local/fixture browser test can increase confidence but **cannot** satisfy the required real customer-site CMP and lead-form acceptance. No Supabase project/branch, Vercel project/deployment, source registration, domain purchase, provider connection or live test event may be created during this mode.

**Recovery isolation:** SalsysOS has an existing recovery-rehearsal project reserved for recovery testing. The preflight also requires its Supabase origin for a *comparison only*, and blocks any staging URL that matches it. The URL is a non-secret origin; do not provide service-role keys. Production and recovery databases must never be repurposed as staging just to pass acceptance.

This preflight makes **read-only assertions about operator-supplied staging configuration** and returns a nonzero exit on missing requirements. It performs no API calls, writes, or secret reads and does not certify that the operator supplied true information. Independently verify the source/site record and deployment metadata. A preflight PASS does **not** replace actual two-tab/CMP and exact-session lead-form acceptance.

## Verified receipt requirement (additional fail-closed control)

The browser must NOT treat a 2xx HTTP status alone as proof that analytics consent was saved. It also must not apply an unrequested advertising/analytics/marketing grant; the only permitted server-added purpose is a receipted GPC `sale_sharing: opted_out` decision. The first-party server contract in `app/api/privacy/consent/v1/route.ts` returns `ok: true`, the same `visitor_id` as the submitted receipt, `effective_decisions`, and a unique nonempty `receipt_id` for every requested purpose. The draft SDK now validates that evidence and refuses malformed or contradictory acknowledgements. A missing/mismatched receipt must **not** save a new analytics grant or initialize optional tracking. A locally requested withdrawal must remain blocked and rotate identity even when its server acknowledgment is malformed.

New loopback Chromium cases use valid HTTP 200 with missing success, wrong visitor, absent receipt, contradictory analytics decision or unexpected purpose, plus a malformed withdrawal response. These checks do not prove live provider/CMP behavior; the isolated authorized staging acceptance remains mandatory.

## Synthetic full-stack consent UI + identity SDK integration (2026-11-07)

A focused cross-draft compatibility regression is now included in **this draft PR #530** as `tests/ui/r2-consent-ui-fullstack-loopback.spec.ts`, copied from the updated synthetic consent UI draft PR #608. It runs the **actual** `public/salsys-intelligence.js` and current `public/salsys-consent.js` together with **this PR's stricter `public/salsys-tracker.js`**, not the older production tracker. Every browser request is intercepted on a disposable loopback page; the in-memory consent endpoint mimics the full real response shape (visitor ID echo, effective decisions, one synthetic receipt per purpose), not merely HTTP 200. The six checks cover no-choice, Reject All across reload, Accept All then Analytics withdrawal and reload, and a **combined UI-driven withdrawal → regrant** flow asserting that fresh optional session/page events use the rotated visitor/session identity and never revive the pre-withdrawal identity. Two additional UI-facing checks simulate **HTTP 200 with missing consent receipts**: an attempted grant must display an error, emit no optional analytics, and allow a later properly acknowledged retry; an attempted withdrawal must display an error while still rotating identity, suppressing optional analytics, and remaining blocked across reload. The fixture checks matching receipts at each successful saved-consent step.

This exercises **runtime compatibility of the UI, stricter receipt validation and identity-rotation SDK** while retaining separate detailed multi-tab/form/storage tests already in this PR. It **does not deploy or merge PR #608**, and does not prove a real site's PHP/CMP, third-party GA/Meta/Clarity/PostHog consent gating, browser privacy diversity, authoritative server persistence, or CRM production lead/form identity handoff. Both drafts remain unmerged and real-site acceptance is blocked pending isolated infrastructure (#531). Require exact-head CI + CodeQL before describing this combined regression as passing.

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

**Local browser checks (native Chromium, intercepted network):** `tests/ui/consent-identity-browser.spec.ts` uses real Chromium tabs and local network interception for grant/withdraw/regrant, including additional restricted `localStorage` and `sessionStorage` method scenarios. Under blocked privacy persistence, optional analytics must remain OFF; necessary form evidence may still use freshly rotated synthetic identity. These controlled mock tests establish browser behavior only for the tested cases; they cannot establish a real CMP, actual cross-origin configuration, private browsing implementation across browsers, full BFCache coverage, production provider policies or the live website form/CRM pipeline. An authorized isolated staging acceptance check remains mandatory. **Do not merge merely because CI passes.**

## Exact consent-receipt completeness regression (2026-11-06)

The public consent endpoint returns **exactly one saved receipt per effective purpose decision** (including a server-enforced, receipted GPC sale-sharing opt-out). The draft SDK now fails closed if a nominal HTTP 200 response contains **extra receipt rows outside effective decisions**, including unrequested advertising grants or conflicting analytics decisions. Every receipt must map one-to-one to an effective purpose and decision; an ordinary matching analytics receipt alone is not enough to override an unexplained additional receipt.

The new isolated Node VM and intercepted Chromium tests verify this while retaining the previously tested valid, receipted GPC response. This detects response-contract discrepancies and does **not** assert a real website or server compromise. There are no changes to the consent API, production release or optional behavioral event collector. **Keep the PR draft until real isolated-site CMP and form handoff acceptance.**

## Additional configuration-only staging origin checks (2026-11-06)

The **draft-only** `scripts/r2-consent-staging-preflight.mjs` now rejects IP-literal endpoints (including IPv4, IPv6 loopback and IPv4-mapped IPv6), local/internal/reserved hostnames, trailing-dot variants of live production hostnames, nonstandard HTTPS ports and staging website/CRM/Supabase origins that share a hostname. These tests cover site, CRM and database origin declarations, not just the website. The input-only preflight remains **no network/no database writes**.

**Limits:** A plausible publicly named HTTPS origin can still resolve to a private address, belong to an unauthorized party, use the wrong SSL certificate, proxy production endpoints or share uninspected production credentials. The preflight does not verify DNS, TLS, origin control, project ownership, actual Supabase/Vercel runtime settings, source registration, outbound side-effect isolation, or owner sign-off. Its affirmative environment variables are **operator declarations**, not automatically validated facts. No manual or real-CMP staging acceptance is authorized merely by a PASS.

**Cost/release guard:** No extra Vercel/Supabase project, domain, preview deployment or staging source was provisioned, no paid plan approved, and no production tracking or test leads sent. Keep Issues #531 and #528 open, PR #530 draft, and optional collector #520 OFF.

## Additional production deployment-alias guard (2026-11-07)

The isolated-staging configuration preflight now also refuses known **generated host families** of the current production SalsysOS CRM Vercel project: `salsys-<deployment-id>-salsysos.vercel.app` deployment URLs and `salsys-os-git-<branch>-salsysos.vercel.app` branch-preview aliases. Previously the check covered only stable production CRM hostnames and the `main` branch alias. Reusing an unverified production-project Preview URL must not pass merely because the operator declares a different Vercel project ID. The guard checks every declared staging endpoint (website, CRM and Supabase).

The preflight also rejects the reserved documentation domain families `example.com`, `example.net` and `example.org`, including subdomains. The synthetic acceptance fixture still uses a fictitious but publicly shaped hostname; its PASS is **only a test of input format checks**, not proof of actual DNS hosting, domain control, TLS, project/credential separation or a safe staging environment.

**Limits:** Regex-based known-hostname denial cannot identify every custom production alias, future renamed Vercel project, DNS CNAME, proxy, alternate deployment URL or shared database secret. A human operator must independently verify the **real deployed Vercel project ID and deployment SHA**, HTTPS website origin, Supabase project identity, origin-bound tracking source, no customer messaging/payment side effects, and zero ability for test leads/events to reach production. No real staging deployment, DNS lookup, Supabase write, test customer or external service call is performed by the preflight. Issue #531 stays blocked until that evidence exists; this code remains **draft and unmerged**.

## Production server-receipt chronology research (2026-11-07)

A separate **SELECT-only operator audit** is now checked into this draft:
`docs/sql/r2-consent-receipt-continuity-audit-v1.sql`. It requires an independently verified authorized organization UUID, exact registered hostname, and 1–72 hour lookback. The source selector must resolve to **exactly one active tracking source**; multiple/absent sources or over 50,000 candidate events fail closed. Only aggregate counts and a sampling timestamp leave the query. Synthetic static safety checks are in `tests/readiness/r2-consent-receipt-continuity-audit-v1.test.cjs`.

The audit matches each `web.session_started` to the **latest prior server-side analytics consent decision** using the same tenant and anonymous browser key. Both SDK event occurrence and database receipt timestamps must follow the consent receipt's corresponding timestamps; later decisions cannot justify earlier events. It separately reports `consent_mode`, client-declared consent snapshot, denied/missing prior decisions and matching browser SDK grant receipts with a notice version. No browser keys, event rows, person IDs, tenant IDs or paths are returned. Receipts are tenant- and browser-key-scoped, **not necessarily source-scoped**: shared keys across sources are a residual ambiguity.

A source-scoped production **read-only** check on 2026-11-07 at **15:18:26 UTC** for the primary `yogakulam.com` source and a **16-hour received-at lookback** returned **67 session starts** (39 SDK `required`, 28 historical SDK `granted`), all 67 with a matching **earlier analytics-grant receipt recorded by `browser_sdk_v1` with nonempty notice version**; zero lacked a prior analytics receipt or had a latest prior denial. This is a time-bound event-receipt consistency observation, **not evidence that any visitor actually saw a lawful CMP choice**. It does not prove source-specific receipt attribution, GPC, blocked requests before consent, third-party destination suppression, cross-tab withdrawal/regrant, exact CRM form identity handoff, or independent tenant/browser authorization. There is no live UI acceptance and no permission to enable optional tracking.

Do not close #588/#528/#531, merge this draft or activate collector #520 from the audit alone. An operator must separately witness and approve isolated-site CMP and network acceptance.

## Release gates

- [ ] Full CI: readiness tests, TypeScript/build, loopback Playwright tests, financial tests
- [ ] CodeQL
- [ ] Manual staging matrix including two-tab and reload behavior
- [ ] Owner review of consent/identity continuity, customer form submission and trusted server handoff
- [ ] Approve production rollout explicitly, then merge/deploy and verify exact commit and no new error cluster

R2-P3 retention KPI Issue #527 stays open. R2-P2 owner/admin QA Issue #523 remains outstanding. R2-P1 optional collection Issue #520 remains OFF.
