# R13 browser acceptance — manual-first pilot

Status: planned, NOT executed. No production testing or hosted staging provisioning authorized.

## Environment prerequisites

Use an isolated Supabase project or isolated local stack plus an HTTPS test app origin. Never copy live users, leads, service keys, provider tokens, or SMTP credentials. Confirm that the test project URL and server key belong to the isolated project before enabling any flags. Set SALSYSOS_APP_URL to its exact HTTPS root origin. Configure the isolated Auth Site URL and exact /signup/verify redirect allowlist, confirm email verification is required, and supply separate Turnstile configuration for the same hostname. Keep gateway/quote switches off. Verify mail delivery only to controlled synthetic recipients (local Auth mail capture if available). Do not weaken CAPTCHA, email verification, TLS, or session checks to make a test pass.

Apply reviewed manual-first candidate schema in the documented dependency order, prepare four synthetic governed published offers and the disabled trial policy, configure separate verified synthetic author/reviewer/publisher and dedicated pilot approver. Confirm database configuration readiness; enable the isolated policy and feature flags only in the test environment. No production grants or publication.

## Browser acceptance cases

| ID | Test | Expected outcome |
| --- | --- | --- |
| B01 | Visit /signup with release flag off or invalid origin | Registration unavailable; no signup action accepted |
| B02 | Enable isolated signup and submit without valid CAPTCHA | Denied; no registration intent or workspace |
| B03 | Submit valid synthetic customer registration | Neutral verification notice; no workspace before verification |
| B04 | Open the controlled verification email in original browser | Exact isolated /signup/verify callback; verified identity; no production redirect |
| B05 | Replay/expire code, resend, and retry sign-in | No duplicate workspace or extended trial; neutral errors; resend quota enforced |
| B06 | Finish protected signup onboarding and sign in | Tenant-bound owner session; correct isolated organization; 30-day Pro trial and one counted user |
| B07 | Open /settings/subscription | Actual plan, usage, history; no payment checkout |
| B08 | Visit admin commercial routes as customer, including direct URL | Access denied; no operator mutations |
| B09 | Sign in as isolated platform pilot approver and enable plan requests | Eligibility enabled, no access or slot change |
| B10 | Customer requests Basic; approver selects Growth | Admin-selected published Growth activated; original request remains superseded; no charge |
| B11 | Approver manually renews or downgrades to Free | Exact approved scope/limits, preserved data, one distinct pilot slot |
| B12 | Use a synthetic expiry fixture; run secret-protected expiry scheduler | Effective Free before reconciliation, canonical Free after; no automatic renewal or data deletion |
| B13 | Test a second organization with different login/session | No cross-tenant subscription or CRM exposure |
| B14 | Pause new signup and assignment | Existing managed access enforcement and expiry continue; legacy tenants unaffected |

For each case record exact commit SHA, isolated environment identifier, expected/actual result, pass/fail and redacted evidence. Never record access tokens, service keys, email verification URLs/codes, CAPTCHA tokens, customer secrets or passwords. Treat failed cases as release blockers, not as completed work. A SQL fixture using simulated JWT claims is not equivalent to an actual browser session or Auth-issued token.

## Remaining decisions

Staging hosting/project and test credentials require explicit separate approval. Owner confirmed the price/user/lead structure and website lead forms plus Instagram for every tier; exact governed publication snapshots still require configuration. Add Free website-form ingestion and Instagram checks before and after expiry/downgrade. Gateway is deferred; ten manual organizations does not cap Free registrations. No launch or production migration authorized.
