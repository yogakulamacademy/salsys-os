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

**Known review gap:** The current draft's synthetic harness models one browser context with shared storage on reload, not complete browser-managed cross-tab `storage` events or independent browser lifecycle rules. A multi-tab acceptance check is required and may necessitate follow-up code changes on this draft. Do **not** merge merely because CI passes.

## Release gates

- [ ] Full CI: readiness tests, TypeScript/build, loopback Playwright tests, financial tests
- [ ] CodeQL
- [ ] Manual staging matrix including two-tab and reload behavior
- [ ] Owner review of consent/identity continuity, customer form submission and trusted server handoff
- [ ] Approve production rollout explicitly, then merge/deploy and verify exact commit and no new error cluster

R2-P3 retention KPI Issue #527 stays open. R2-P2 owner/admin QA Issue #523 remains outstanding. R2-P1 optional collection Issue #520 remains OFF.
