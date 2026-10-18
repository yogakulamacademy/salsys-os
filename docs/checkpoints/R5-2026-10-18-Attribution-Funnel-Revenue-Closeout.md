# R5 — Attribution, Funnel & Revenue Intelligence Closeout

**Date:** 2026-10-18  
**Repository:** `yogakulamacademy/salsys-os`  
**Branch:** `feature/system-intelligence-v2`  
**Production Supabase:** `doaozrkrtgeslddwhclj`

## Status

**R5 measurement baseline: COMPLETE.**

This closeout covers the tenant-safe measurement chain:

`traffic/source → attribution evidence → Lead cohort funnel → qualified/paid/enrolled outcomes → per-currency actual revenue → source/campaign performance`

It does not claim that configured stage-weighted pipeline values are learned predictive forecasts, and it does not claim completion of provider-side conversion feedback or commercial SaaS billing.

## Verified production capabilities

### Attribution

- Canonical tenant-aware Lead attribution facts exist for every current Lead.
- Attribution supports four separate observed views without overwriting source history:
  - `first_touch`
  - `lead_creation`
  - `last_touch`
  - `current_channel`
- Every current Lead produces exactly four rows in `v_attribution_model_rows`.
- Attribution read models are `security_invoker=true` and therefore preserve underlying RLS behavior.
- The application derives the active organization server-side before loading Attribution.
- The optimized Attribution RPC is security-invoker and receives the server-derived organization ID; the compatibility RPC remains fail-closed with empty output.

### Funnel

- The 30-day funnel measures visitors, sessions, page views, intent, form submissions, Leads, qualified Leads, paid Leads and enrolled Leads.
- Source, landing-page, country, event, new/returning and repeat-visit breakdowns are available.
- Google Ads and Meta Ads CRM-performance read models are integrated into the Funnel workspace when those providers are connected.
- The optimized Funnel RPC is security-invoker and explicitly checks current organization membership.

### Revenue

- Actual revenue is derived from payment records, not CRM stage labels.
- Refund transactions reduce net actual revenue.
- Currency values remain separated at the source; mixed currencies are not silently added in canonical database views.
- Outstanding balance is derived from Lead potential value versus net paid amount in the same currency.
- Revenue can be viewed by stage, month, source and location.
- The Revenue workspace derives its organization server-side and reads tenant-scoped models through RLS/security-invoker paths.

## R5 integrity audit

Production checks returned **zero** for:

- Lead attribution ↔ Lead tenant mismatch
- duplicate attribution state for the same organization + Lead
- attribution transition ↔ Lead tenant mismatch
- Attribution Lead fact without matching Lead
- Revenue-status row without matching Lead
- paid payment without matching Lead
- first-touch attribution pointer tenant mismatch
- lead-creation attribution pointer tenant mismatch
- last-marketing-touch attribution pointer tenant mismatch
- conversion-touch attribution pointer tenant mismatch
- Attribution model row-count mismatch
- Revenue-status row-count mismatch

At closeout, the production model contained:

- SalsysOS: 7 Leads → 7 Attribution Lead facts → 28 Attribution model rows
- Yogakulam Academy: 31 Leads → 31 Attribution Lead facts → 124 Attribution model rows
- Test Yoga School: zero business rows at this checkpoint

## Revenue reconciliation

The live Yogakulam payment ledger and canonical actual-revenue view reconciled exactly for the observed USD payment evidence:

- payment-ledger net received: **USD 300.00**
- `v_actual_revenue_by_currency.actual_revenue`: **USD 300.00**
- difference: **USD 0.00**

This is a reconciliation of the currently observed production payment evidence, not a claim that all future provider settlements or accounting adjustments are automatically reconciled.

## Attribution coverage is evidence completeness, not causation

Observed Yogakulam model coverage at closeout:

- lead creation: **100%**
- current channel: **100%**
- first touch: **80.65%**
- last touch: **58.06%**

These percentages describe how much attribution evidence is currently known. They do not prove that a source or channel caused a conversion.

## R5 funnel semantic hardening

During closeout, the original `v_end_to_end_funnel_30d` mixed two different populations:

- Lead/qualified/enrolled stages used Leads created in the last 30 days.
- Paid stage used payments that occurred in the last 30 days regardless of Lead creation date.

That could make the visual funnel internally inconsistent.

Migration:

`supabase/migrations/20261018202000_r5_funnel_cohort_integrity_v1.sql`

Commit:

`5337c5d112ef1c6dcf4fa7314b1db00d21c45b9e` — **Make R5 funnel stages cohort-consistent**

The migration:

1. keeps traffic/touchpoint metrics as 30-day period metrics;
2. establishes a 30-day Lead-created cohort;
3. evaluates qualified, paid and enrolled stages against that same Lead cohort;
4. counts successful non-refund payments for cohort Leads regardless of whether the payment happened later in the same reporting window;
5. recognizes confirmed/completed enrollment records as enrolled outcomes in addition to CRM stage;
6. preserves `security_invoker=true` and authenticated/service-role read access only.

Post-migration live Yogakulam cohort snapshot:

- Leads: 31
- qualified-plus: 10
- paid: 1
- enrolled: 1
- Lead → qualified: 32.26%
- Lead → enrolled: 3.23%

The migration is applied in production and its Vercel deployment is green.

## Forecasting boundary

`v_revenue_forecast` currently uses configurable stage probabilities to create a weighted pipeline estimate. Those probabilities are explicit configuration values, not learned historical conversion probabilities.

The product UI already preserves this distinction. Therefore:

- **R5:** configured stage-weighted revenue planning is available;
- **R10:** learned conversion/payment probability and historically calibrated predictive revenue forecasting remain future intelligence work.

No R5 closeout claim should describe the current weighted forecast as predictive ML.

## Boundaries intentionally left for later phases

- intent, product affinity, objection and sales-priority intelligence → R6
- Google/Meta closed-loop conversion feedback and provider delivery/retry depth → R7
- learned conversion/payment probability and predictive revenue forecasting → R10
- commercial subscription billing, invoices and SaaS finance lifecycle → R13
- final accounting/settlement reconciliation beyond CRM payment evidence remains separate finance/commercial work

## Exit criteria

R5 is considered closed because SalsysOS can now connect acquisition and journey evidence to Lead outcomes and real payment revenue through tenant-safe, internally reconciled read models, while preserving clear boundaries between observed attribution, configured planning estimates and future predictive intelligence.

## Next phase

Proceed to **R6 — Intent, Product Affinity & Sales Intelligence** and verify/build:

`Lead evidence → intent signals → product affinity → objection/context signals → sales priority → lead-level next-best action → explainable operator guidance`
