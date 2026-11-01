# SalsysOS — Provider Readiness Parity v1

**Date:** 2026-11-01  
**Production organization:** Yogakulam Academy  
**Engineering PR:** #404  
**Production merge SHA:** `acf45497b4e40c4c270d2c4122d160f07eb02cb4`

## Purpose

Continue Production Acceptance after the user intentionally parked the live Yogakulam PHP commerce-completion deployment.

This checkpoint separates external provider/configuration blockers from genuine SalsysOS runtime defects without rewriting raw sync evidence.

## Google Ads — live evidence

Production evidence showed:

```text
connection_status          connected
auth_mode                  oauth_user
adwords_scope_present      true
selected_ads_customer      1
discovered_ads_customers   2
latest_sync_status         failed
latest_sync_http_status    403
provider_error             CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION
```

The selected production Ads customer and OAuth connection are valid. GA4 and Google Search Console continue to sync successfully through the Google connection.

The Google Ads failure is therefore not evidence of a SalsysOS credential, tenant-routing or customer-selection defect. It is a Google Cloud project production-access restriction.

## Product-modeling gap

Raw System Health correctly records the latest Google Ads run as failed/critical. That evidence must remain unchanged.

However, Operational Readiness already classified Meta Ads configuration/provider blockers separately and had no equivalent Google Ads readiness row.

PR #404 added parity without weakening raw health semantics.

## Implemented boundary

Migration:

`supabase/migrations/20261101141500_google_ads_operational_readiness_v1.sql`

Creates:

`public.v_google_ads_operational_readiness_v1`

The view is additive, tenant-scoped by the consuming server read, `security_invoker = true`, and unavailable to public/anon/authenticated roles.

Classification precedence:

1. no Google connection -> `not_configured` / inactive;
2. disconnected Google connection -> `configuration_blocked`;
3. missing Google Ads OAuth scope -> `configuration_blocked`;
4. no selected Google Ads customer -> `configuration_blocked`;
5. known Google Cloud Test-access production rejection -> `configuration_blocked`;
6. any other failed Ads sync -> `runtime_failure` / critical;
7. stale completed sync -> warning / stale;
8. otherwise healthy.

Known provider-access blocker code:

`google_cloud_project_test_access`

The existing raw `v_google_ads_sync_health` view and failed sync history are not altered.

## Production verification

After deployment, Yogakulam reports:

```text
Google Ads Readiness
health_status              configuration_blocked
operational_status         configuration_blocked
active                     true
issue_count                1
blocker_code               google_cloud_project_test_access
connection_status          connected
adwords_scope_present      true
selected_asset_count       1
discovered_asset_count     2
last_sync_status           failed
```

At the same time, raw Google Ads sync health still reports the original 403 provider failure. This split is intentional.

Migration ledger:

```text
version  20261101141224
name     google_ads_operational_readiness_v1
```

Release validation on merge SHA `acf45497...`:

- CI #1330 — passed;
- CodeQL #615 — passed;
- Production Smoke #153 — passed;
- Vercel production deployment — READY on the exact merge SHA.

## Meta Ads — current production classification

Meta Ads was already modeled correctly by `v_meta_ads_operational_health_v1` / Operational Readiness.

Current production state:

```text
connection_status          connected
auth_mode                  system_user
ads_read/ads_management    missing
selected_meta_ad_account   none
latest_historical_sync     success
operational_state          configuration_blocked
blocker_code               meta_ads_permission_missing
```

This remains provider authorization/App Review/configuration work, not a newly discovered internal sync regression.

## Provider actions still external

### Google Ads

Obtain production Google Ads API access for the OAuth Cloud project (Explorer, Basic or Standard as appropriate). Do not rotate SalsysOS credentials or change the selected Ads customer merely to suppress the current error.

### Meta Ads

Grant the required Ads permission (`ads_read` or `ads_management`) through the Meta business/app configuration, reconnect Meta, discover available ad accounts and select the intended account.

## Parked acceptance boundaries

The following remain intentionally unresolved and must not be made green with synthetic data:

- commerce completion: `payment.completed` / `enrollment.completed` not yet emitted from the live Yogakulam PHP host; user chose to park this deployment for now;
- PA-1 identity pair: two human-review conflicts remain open; no merge/dismissal is authorized;
- Search Indexing: intentionally inactive.

## Acceptance decision

Provider Readiness Parity V1 is complete.

SalsysOS now preserves raw provider failure evidence while separately communicating whether the operator can fix the issue inside SalsysOS or must complete an external provider-access step.
