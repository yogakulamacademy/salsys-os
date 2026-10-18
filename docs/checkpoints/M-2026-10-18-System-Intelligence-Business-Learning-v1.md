# SalsysOS — System Intelligence Business Learning v1

**Date:** 2026-10-18  
**Branch:** `feature/system-intelligence-business-learning-v1`  
**Base:** `b943e63702fed89f074960d6fd9569a1f55e226f`

## Goal

Extend the recommendation-learning loop from generic metric movement into business-aware evidence while keeping all learning bounded, tenant-scoped and observational.

Target loop:

`recommendation → linked lead subjects → human action → observed lead/payment/enrollment movement → learning profile → bounded score calibration`

The system must not claim causality merely because an outcome happened after a recommendation.

## Implemented

### 1. Recommendation → lead subject linkage

Recommendations can now retain a bounded set of tenant-verified lead IDs that were part of the evidence when the recommendation was shown.

Supported subject capture currently includes:

- reply-pressure leads
- first-touch leads
- overdue follow-up leads
- payment-pending leads
- outstanding-revenue leads by currency
- re-engaged leads

Client-supplied lead IDs are not trusted. `touch_system_intelligence_recommendation_v2` filters submitted IDs through the currently bound tenant's `leads` table before storing them.

### 2. Business outcome observation

After an acted recommendation matures, the existing outcome evaluator can inspect only the linked lead set for subsequent evidence:

- forward lead-stage transitions
- completed payments (`paid_at`)
- enrollments (`enrolled_at`)
- negative stage transitions (`not_now`, `lost`, `unqualified`)

Business outcomes are classified as:

- `positive`
- `neutral`
- `negative`
- `mixed`
- `inconclusive`

The observation note explicitly states that post-action movement is observational evidence and does not prove that the recommendation caused the change.

Business-outcome evaluation uses a longer minimum maturity window (24 hours) than basic metric movement (1 hour).

### 3. Learning profiles

New tenant-scoped table:

`system_intelligence_learning_profiles`

Profiles are keyed by:

- organization
- signal ID
- role scope

They retain:

- outcome sample count
- positive / neutral / negative / mixed / inconclusive counts
- bounded score adjustment
- confidence
- recompute timestamps

### 4. Bounded calibration

Learning does **not** immediately alter recommendations.

Rules:

- minimum 5 classified outcome samples before any score adjustment
- maximum learned score adjustment: `-8` to `+8`
- confidence scales gradually and reaches 1.0 only at 20+ classified samples
- role weighting and deterministic signal evidence remain separate from learned calibration
- a learned adjustment is shown in the signal evidence when active

This prevents one good or bad result from dominating ranking.

### 5. Tenant and permission controls

- learning profiles use tenant-bound RLS
- recommendation target IDs are filtered by server-resolved tenant
- learning-profile recomputation is service-role only
- authenticated users have read-only access to their tenant's learning profiles
- recommendation/action safety gates remain unchanged
- no autonomous customer or website action was enabled

## Production database migration

Applied successfully to production Supabase project `doaozrkrtgeslddwhclj`:

`system_intelligence_business_learning_v1`

Post-migration verification:

- new recommendation linkage columns exist
- learning-profile table exists
- recommendation rows: `0`
- linked recommendation rows: `0`
- learning-profile rows: `0`

No synthetic/fake learning history was inserted.

## Preview build verification

Vercel Preview:

- deployment: `dpl_94BDi2ojhi5qnxG2aPkGS9rV4NKE`
- branch: `feature/system-intelligence-business-learning-v1`
- commit: `b32298966e4aef0b7a986305d2f4c2e62459e8d1`
- Next.js: `15.5.26`
- compile: `Compiled successfully in 20.9s`
- static generation: `38/38`
- deployment state: `READY`

Unauthenticated access to `/api/intelligence/v1/outcomes` is routed to the SalsysOS sign-in boundary with the destination preserved, confirming that the outcome-learning surface is not publicly exposed.

## What is not yet claimed

This checkpoint does **not** claim that real Yogakulam recommendation outcomes have already trained the ranking system. There were zero real recommendation-learning rows immediately after migration.

The system now has the plumbing to learn safely as real users interact with recommendations and real business outcomes occur.

## Next checkpoint

Recommended next checkpoint:

**W8 final tenant-security validation + strict sign-off preparation**

Rationale: the adaptive intelligence loop is now sufficiently advanced that final tenant/security verification should be closed before activating production Smart Trigger sends or broader autonomous actions.
