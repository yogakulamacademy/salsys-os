# M-2026-10-20 — Funnel + Attribution + Revenue Commercial Intelligence V1

**Status:** engineering baseline implemented; production closeout remains dependent on the live Universal Tracking / trusted business-event journey.

## Purpose

Turn Funnel, Attribution and Revenue from reporting-only workspaces into an explainable commercial decision layer while preserving SalsysOS truth boundaries.

The commercial loop remains:

`traffic -> journey -> lead -> qualified -> payment/enrollment -> revenue -> attribution -> decision support -> observed outcome`

This checkpoint does **not** promote an uncalibrated model to authoritative prediction.

## What V1 adds

### Unified commercial intelligence engine

`lib/commercial-intelligence.ts`

Provides deterministic, explainable diagnostics for:

- Funnel leakage across observed conversion steps;
- form-start -> submit completion;
- strongest observed source evidence;
- re-engaged lead opportunity;
- attribution coverage by canonical model;
- Unknown / unattributed revenue exposure;
- cross-model attribution disagreement;
- opportunity valuation completeness;
- expected-close-date completeness and stale close dates;
- refund-rate diagnostics;
- weighted-pipeline source concentration;
- Revenue <-> Attribution payment-revenue reconciliation by currency.

### Paid-media business intelligence

`components/paid-media-intelligence-panel.tsx`

Adds a decision layer over existing Google Ads and Meta Ads business facts:

- spend;
- CRM leads / qualified / enrolled;
- CPL;
- CAC;
- ROAS;
- CRM revenue;
- campaign-ID / paid-lead attribution coverage;
- unmatched / weak-lineage warnings.

No provider spend or outcome is fabricated when the integration is unavailable.

### Explainable decision UI

`components/commercial-intelligence-panel.tsx`

Surfaces:

- evidence/readiness score;
- reasoned signals;
- recommended next actions;
- methodology/guardrails;
- Revenue <-> Attribution reconciliation state.

Readiness is explicitly a data-completeness diagnostic, not a calibrated win probability.

### Commercial command center

`/commercial-intelligence`

Joins the current tenant's:

- Funnel workspace;
- paid-media business attribution;
- Attribution workspace;
- Revenue workspace;
- Revenue/Attribution reconciliation.

The command center provides one place to answer:

1. Where is the funnel leaking?
2. Which observed sources are producing downstream outcomes?
3. How trustworthy is attribution coverage?
4. Which paid channels have usable CPL/CAC/ROAS evidence?
5. Is the open pipeline valued and dated well enough to forecast operationally?
6. Are refunds, outstanding balances or source concentration creating risk?
7. Does net payment revenue reconcile to attributed payment revenue by currency?

## Truth and safety invariants

- PostgreSQL/Supabase remains authoritative.
- Missing behavioral evidence remains Unknown.
- No fabricated sessions, leads, enrollments, payments, revenue or outcomes.
- First Touch, Lead Creation, Last Marketing Touch and Current Channel remain distinct models.
- INR and USD remain separate unless an explicit FX display layer converts them.
- Stage-weighted forecasts remain deterministic planning values, not calibrated probabilities.
- Evidence/readiness scores describe data completeness only.
- Budget changes are recommendations for human review, not autonomous spend actions.
- Predictive promotion remains blocked until real labeled outcomes satisfy calibration/readiness rules.

## Verification

CI now includes:

```text
npm run verify:commercial-intelligence
npm run typecheck
npm run build
```

The commercial-intelligence verification contract checks that the three intelligence builders, reconciliation logic, UI surfaces and probability/currency/Unknown guardrails remain present.

## Production closeout still required

This checkpoint does **not** mark Area 4 production-closed while Area 3 live tracking is unresolved.

Final closeout requires one controlled real journey with authoritative lineage:

1. consented source/campaign visit;
2. canonical session/journey events;
3. exact-session lead/Person identification;
4. lead progression / conversation evidence;
5. trusted booking/payment/enrollment events;
6. net revenue and refunds from server-side business truth;
7. source/campaign attribution visible without overwriting first touch;
8. Funnel, Attribution and Revenue views reconcile for that journey;
9. Revenue <-> Attribution payment totals reconcile per currency;
10. no rejected/dead/stuck processing affecting the journey.

Until that proof exists, label this area **engineering complete / production reconciliation pending**, not fully production-closed.
