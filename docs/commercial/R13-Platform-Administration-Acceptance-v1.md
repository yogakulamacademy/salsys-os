# R13 platform administration — SA-01 to SA-05 acceptance

This candidate is off by default. Keep SALSYS_PLATFORM_ADMIN_ENABLED=false in production until independent review, isolated verification and release approval. Do not enable signup, trial policy, manual activation or payment collection as part of this change.

## Candidate scope
- Dedicated platform overview, customer registry, commercial plans and manual approval pages share a separate frame.
- Business operations at /platform-admin/business uses session-bound effective workspace access, matching platform tenant and existing provider inventory.
- Subscription monitoring exposes recorded state and deadline counts, not effective access or verified payment.
- No additional customer data access, provider credential changes, schema changes or new subscription writes.

## Required acceptance
| Case | Expected |
| --- | --- |
| Flag off | New pages inaccessible, legacy behavior unchanged |
| Signed-out request | No platform content |
| Ordinary customer owner/admin, employee | No platform content or privileged action |
| Platform member without operator permission | New platform pages and enabled-mode registry/provisioning denied |
| Active verified operator in configured tenant | Overview, registry and permitted business workspaces load |
| Revoked/disabled operator or tenant mismatch | Fail closed |
| Direct provisioning or plan action | Existing server guard and exact action permissions required |
| Provider inventory missing/error/truncated | No invented status or credential disclosure |
| Commercial read failure | No new platform privilege granted |
| Subscription counts incomplete/inconsistent | Unavailable rather than invented zero |
| Mobile and desktop | Dedicated navigation, normal CRM remains unchanged |
| Existing customer routes | Tenant access and data remain isolated |
| Signup and trial | Remain closed/disabled |

Run full CI, CodeQL, readiness suite, real signed-session negative tests, and responsive preview in a separately authorized isolated environment. Record evidence before changing production. Do not use production tenant provisioning as a test.

## Remaining scope
- Validate actual marketing routes and reconnect provider accounts through existing approved OAuth/connection flows for the internal tenant.
- Define payment evidence before displaying collected revenue, MRR, ARR, outstanding balances or churn. No CRM payments as a SaaS billing substitute.
- Effective entitlement and contract history reporting, customer success/support, platform health, governance and onboarding acceptance remain separate work.
- Existing registry pagination and dependency on commercial operator read availability need review before commercial scale.
- No production deployment or public signup authorization is implied by these tests.
