# DM-LINK-02 — Offline link coverage and destination safety

**Recorded:** 2026-11-11  
**Status:** Feature branch code and local offline unit tests only. NOT merged, independently reviewed, deployed, migrated or live-enabled.  
**Branch:** `feature/dm-link-evidence-policy-v1-20261111`  
**Parent work:** [Issue #696](https://github.com/yogakulamacademy/salsys-os/issues/696), DM-LINK-01; the R2, AI and staging release holds remain in force.

## Delivered in this checkpoint

1. **`lib/ai/dm-link-destination.ts`** — strict, configurable HTTPS origin and course-path destination validator. Rejects disallowed sites, HTTP, userinfo, nonstandard ports, unsafe query/fragment and encoded traversal/backslashes. It **does not redirect, issue tokens or send a message**.
2. **`lib/ai/dm-link-coverage.ts`** — deterministic event rollup around the existing DM-LINK-01 visit classifier:
   - explicit matching tenant and link ID, valid event identity, permitted processing purpose;
   - bounded history (max 100 observations), replay dedupe, rejects conflicting duplicate event IDs;
   - separate preview/bot/ambiguous requests from qualifying browser observations;
   - records coarse trusted **network country**, not actual customer location, identity proof, residence, nationality, or price eligibility;
   - multiple distinct or unknown visit-country signals prevent a confident single-country summary;
   - emits a safe `clickStatus` consumed by the already-existing staff-follow-up policy.
3. **`tests/readiness/dm-link-coverage-v1.test.cjs`** — 15 targeted, synthetic node:test regressions. A no-event eligible delivered link can become a **staff-review suggestion only**, and any observed browser visit suppresses the “no verified click” suggestion; nothing authorizes automatic DMs.

## Evidence and limitations

A standalone local copy of the three TypeScript policy modules was exercised with installed TypeScript / Node:
- `NODE_PATH=$(npm root -g) node --test tests/readiness/dm-link-coverage-v1.test.cjs` — **15 passed, 0 failed**.
- `tsc --noEmit --strict --target es2022 --lib es2022,dom --module commonjs --moduleResolution node` on the three modules — **passed**.
- The test is in `tests/readiness/`, included by the repository's `test:readiness` glob.
- **No complete repository install, full CI/CodeQL, signed-in staging, security review, real Meta event, IP lookup, provider sending or database integration** was performed. The local tests do not demonstrate live customer behavior.

## Clear non-goals of the current code

- No working course link shortener, no redirect or visitor geolocation API; no cookies, live IP collection, analytics toggles or event persistence.
- No scheduled worker, persistent CRM task, SMS/WhatsApp/Instagram sends, or Co-Pilot/model provider invocation.
- No new pricing tier, no rule that an observed country defines Indian/international rate eligibility; no CRM lead-country mutation.
- No privileged Supabase database functions/migrations, RLS changes, production writes, preview/staging deploy, merge, reviewer bypass, or new infrastructure spend.
- An HTTP request may be a preview, forwarded URL or a web proxy. Even a plausible browser visit is token-link evidence, **not proof the original Instagram sender personally opened it**.

## Next authorized path (after existing independent review and owner privacy decisions)

1. **DM-LINK-00 remaining prerequisite:** audit the current first-party website path and R2 consent purpose. Approve what may be logged and associated to a person, retention and removal, applicable Instagram API messaging eligibility, and domain configuration.
2. **DM-LINK-03 controlled design:** audit and reuse current message-send IDs, organization/lead/conversation identity and trusted tracking event contract. Define exact server-side token registry, revocation and expiration, approved destination allowlist, country derivation, idempotent event store and tenant-isolation / RLS design. No release until separate sign-off.
3. **Human queue integration:** only after approved storage and consent, use fresh, authorized lead/reply/suppression state and transactional uniqueness to create one staff-review task. A link click cannot reopen Instagram's messaging window.
4. **Acceptance:** isolated signed-in two-tenant tests, bot/crawler/referrer leakage tests, URL forwarding, wrong country/VPN, withdrawn consent, customer correction, repeated click, and reply/scheduling races, rollback. Existing staging hold still controls.

**Next exact action:** complete a read-only reuse audit of existing Instagram, Journey, R2 consent, and CRM task interfaces, then propose an approved minimum DB/endpoint contract. Do NOT implement a live redirect or task scheduler without the privacy/security sign-off and explicitly reviewed release scope.
