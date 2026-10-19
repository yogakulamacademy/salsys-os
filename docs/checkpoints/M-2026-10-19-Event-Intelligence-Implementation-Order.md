# M-2026-10-19 — Event Intelligence implementation order

## Current status

1. **Universal event ingestion — MERGED / foundation complete**
   - `/api/events/v1`
   - `/api/events/browser/v1`
   - tracking source registry
   - event families/contracts
   - rate limiting
   - privacy gate
   - sanitization/redaction
   - idempotent canonical raw-event ingestion

2. **Direct first-party browser SDK + website relay/outbox — NEXT / not complete**
   - install directly in Yogakulam source, not GTM
   - tenant-neutral SDK
   - preserve existing visitor/session continuity
   - first-party relay/outbox so downstream outages do not lose events

3. **Semantic projection / normalization compatibility — foundation complete, live validation remains**
   - canonical website processor remains compatible with raw-event ingestion
   - sessions/touchpoints remain PostgreSQL-backed derived state

4. **Feature store + derived feature builders — FOUNDATION MERGED**
   - session/journey behavior
   - page traffic + SEO conversion
   - paid-media conversion
   - lead conversion bridge

5. **Deterministic/statistical prediction ledger — FOUNDATION MERGED**
   - deterministic scores remain explicitly uncalibrated
   - existing trained lead-scoring outputs may be bridged as statistical predictions
   - outcome fields/reason codes/evidence retained

6. **Derived OpenSearch projections — FOUNDATION MERGED / indexing remains fail-closed**
   - `event_feature`
   - `event_prediction`
   - automatic search outbox queueing
   - guarded bounded pilot staging
   - search outbox entity constraint supports derived Event Intelligence types

7. **Production Yogakulam cutover + full E2E proof — NOT COMPLETE**
   - campaign/click id -> visitor/session -> behavior -> consent -> lead -> identity -> checkout -> payment -> enrollment -> revenue -> attribution -> features -> prediction -> outcome

## Immediate execution order

`direct SDK -> first-party relay/outbox -> consent -> forms/identity -> checkout/payment/enrollment -> revenue attribution -> data-quality monitoring -> controlled OpenSearch pilot -> predictive calibration`

Do not enable autonomous customer messaging, automatic ad-budget changes or broad OpenSearch indexing as part of this implementation sequence.
