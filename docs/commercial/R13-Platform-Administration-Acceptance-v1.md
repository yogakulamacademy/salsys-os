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

## SA-06 financial metric acceptance

The SaaS payment evidence draft is not an installed production ledger. Before enabling financial KPIs, separately approve a billing model, currency and tax treatment, period and cancellation policy, merchant verification, refunds/disputes, invoice balances and reconciliation. Report MRR only from qualifying active recurring contracts normalized to monthly amounts, excluding complimentary accounts, taxes and one-time setup fees; ARR is annualized MRR, not booked cash. Report collections from reconciled settlement evidence net of relevant refunds/disputes, with explicit currency, period and accounting definition. Outstanding balances require issued invoices and applied payments. Never use CRM customer/student payments, plan list price, offline approval references or trial counts as settlement evidence. Do not install the draft or activate billing as part of this PR.

## SA-07 customer success monitoring

The protected customer-success page exposes only exact organization/onboarding counts, including not started, in progress, completed, dismissed, missing records and enforcement-configured incomplete records. Missing records are a legacy/not-enrolled possibility, not a failure. These counts include demos; do not call them paying customers or infer product adoption, support satisfaction or churn. Add isolated tests of zero rows, inconsistent concurrent reads, revoked operators and authorized access. No new customer data, tracking or support writes are enabled.

## SA-08 operations and security

The new protected health page reads the existing internal-tenant v_system_health_summary with exact tenant filtering and returns only validated counts and source check time. Configuration booleans describe server switches, not actual registration availability, job execution, uptime or security approval. The scheduler credential is shown only as configured/not configured. No other tenant's monitoring detail, raw logs, credentials or customer records are exposed. Missing, malformed or inconsistent data must render unavailable, never healthy by default.

## SA-09 release candidate checklist

Use the consolidated PR #838; do not merge #837 and #838 independently. Freeze the reviewed commit and require its own full CI, CodeQL and readiness suite. Verify the new pages with feature flag off, unauthenticated session, ordinary customer administrator, employee, wrong platform tenant, revoked operator, and valid active platform operator. Test direct existing commercial/provisioning actions separately. Verify desktop/mobile navigation and business routes, provider permissions, legacy customer behavior, and unavailable monitoring/count states. Retain production signup closed, trial policy disabled and staging on hold unless separately authorized. A rollback of presentation can turn off SALSYS_PLATFORM_ADMIN_ENABLED; this is not rollback of separately activated subscriptions or billing. Do not treat flag rollback as revocation of pre-existing legacy provisioning rights.

The platform foundation is a release candidate only. SaaS billing and settlement, effective contract history, live provider onboarding, support ticketing, adoption/churn, platform-wide API/queue/cron and AI telemetry remain deferred, not implemented by these monitoring surfaces. No production release, schema migration or provider mutation is authorized by this document.
