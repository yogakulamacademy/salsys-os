# SalsysOS v0.9.0 — Education & Wellness Vertical Pack

**Release date:** 2026-11-02  
**Release type:** Product milestone / production release

## Release identity

```text
Product:      SalsysOS
Version:      0.9.0
Release:      Education & Wellness Vertical Pack
Status:       Production
```

## Why v0.9.0

SalsysOS has completed the core Sales + Analysis Operating System foundation and the first reusable vertical productization milestone for Education / Wellness.

The product is intentionally not labeled v1.0.0 yet. v1.0.0 is reserved for commercial SaaS readiness: canonical plans and subscriptions, entitlement governance, self-service onboarding, billing-provider lifecycle, commercial enforcement/recovery, usage/limits, and production customer lifecycle controls.

## Included milestone state

- broad CRM / analytics / automation / tracking product closeout complete;
- R9 V1 closed;
- R10 V1 closed;
- R11 Education / Wellness Productization closed;
- R11-P0 Capability + Security Foundation complete;
- R11-P1 Education Product Surface Gating complete;
- R11-P2 Generic Catalog Adapter Boundary complete and production-accepted;
- accommodation / residential operations retired from active Education product scope;
- R13 Commercial SaaS Readiness audit/design locked;
- next implementation checkpoint is R13-P0 Commercial State Foundation.

## Product version source of truth

The application release version is defined centrally in:

```text
lib/product-version.ts
```

Production exposes the release identity at:

```text
GET /api/version
```

The sign-in screen also displays the release version.

Component/protocol versions remain independent. For example, the tracking diagnostic may continue to report its own tracker version separately from the SalsysOS product version.

## v1.0.0 gate

Do not promote SalsysOS to v1.0.0 until R13 commercial SaaS readiness is production-accepted, including at minimum:

- plans and subscriptions;
- entitlement governance;
- self-service onboarding;
- verified billing-provider lifecycle;
- trial / grace / cancellation / reactivation rules;
- commercial enforcement without destructive customer-data loss;
- usage / limit controls where required;
- commercial onboarding and operational acceptance.
