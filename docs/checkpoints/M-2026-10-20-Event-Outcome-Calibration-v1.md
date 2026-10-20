# M-2026-10-20 — Event Outcome Calibration V1

## Goal

Make Salsys more accurate by comparing genuine probability predictions with authoritative realized business outcomes, while preserving privacy restrictions and keeping deterministic ranking scores separate from probabilities.

This checkpoint does **not** claim that the model is already accurate. It builds the measurement system required to prove, reject, and improve that claim with real outcomes.

## Why this checkpoint exists

Salsys already had:

- privacy-aware signal-quality controls;
- immutable feature/prediction history;
- deterministic Event Intelligence ranking scores;
- a statistical lead-conversion probability bridge;
- evidence freshness and prediction-expiry guards.

The missing accuracy loop was realized-outcome evaluation. Without it, a prediction can be reproducible and fresh but still cannot be objectively calibrated against what actually happened.

## Added

### Authoritative lead outcome observer

`observe_event_intelligence_lead_outcomes_v1(organization_id, limit)`

The observer evaluates only genuine `lead_conversion_probability` predictions with a non-null probability.

Positive resolution evidence comes from the canonical `v_lead_conversion_facts` view:

- payment success;
- confirmed enrollment;
- CRM won.

Negative resolution evidence comes from explicit CRM terminal stage transitions:

- lost;
- unqualified.

The V1 target is explicitly defined as:

```text
first_authoritative_sales_resolution_after_prediction
```

If no authoritative resolution exists yet, the prediction remains unresolved. Missing outcome evidence is not converted into a negative label.

### Append-only outcome evidence

Observed outcomes are written to `event_intelligence_prediction_outcomes` under:

```text
lead_conversion_resolution_v1
```

A unique partial index makes the resolution idempotent per prediction.

The original prediction score/probability row is not rewritten. Outcome evidence is appended separately so the historical model decision remains auditable.

### Privacy guard

Outcome observation and active calibration evaluation require the lead to remain eligible for profiling under `v_r10_lead_signal_quality_v1`.

If profiling is currently restricted:

- the observer skips the prediction;
- historical outcome receipts can remain available for controlled audit/history;
- the active probability-evaluation surface excludes the subject.

This prevents the accuracy pipeline from treating privacy restrictions as permission to continue model-quality profiling.

### Probability evaluation

`v_event_intelligence_probability_evaluation_v1`

For resolved, privacy-eligible probabilistic predictions it exposes:

- predicted probability;
- binary realized outcome;
- probability error;
- absolute error;
- squared error;
- log loss;
- hours to authoritative resolution;
- outcome provenance.

Deterministic scores are deliberately excluded.

### Calibration bins

`v_event_intelligence_calibration_bins_v1`

Predictions are grouped into ten probability bands. Each band reports:

- sample count;
- positive/negative outcomes;
- mean predicted probability;
- observed outcome rate;
- absolute calibration gap;
- Brier component.

This lets Salsys answer questions such as: when the model says approximately 70%, do roughly 70% of comparable resolved leads actually convert?

### Probability health

`v_event_intelligence_probability_health_v1`

Reports per model/version:

- eligible prediction count;
- resolved/unresolved outcome coverage;
- positive and negative outcome counts;
- Brier score;
- mean absolute probability error;
- mean log loss;
- expected calibration error (ECE);
- predicted vs observed conversion rate;
- average resolution latency;
- calibration readiness/status.

V1 explicitly gates any calibration claim until at least:

```text
100 observed predictions
20 positive outcomes
20 negative outcomes
```

Statuses are:

```text
collecting_outcomes
early_sample
directional_only
measurable
```

Before the gate is satisfied, the system labels metrics as observational rather than validated accuracy.

### Distribution drift

`v_event_intelligence_probability_drift_v1`

Uses Population Stability Index (PSI) to compare:

```text
current cohort: previous 30 days
baseline:        prior 90 days
```

Drift is only considered measurable with at least:

```text
30 current predictions
50 baseline predictions
```

States:

```text
insufficient_sample
stable
watch
material_shift
```

PSI is explicitly treated as a prediction-distribution warning, not proof of model error or causality.

## Accuracy principles locked by this checkpoint

1. Realized business outcomes, not model confidence, determine whether predictions were right.
2. No outcome yet means unresolved, not negative.
3. Authoritative payment/enrollment facts outrank inferred browser behavior.
4. Prediction history stays auditable; outcomes are appended separately.
5. Deterministic ranking scores are never silently converted into probabilities.
6. Probability calibration metrics only apply to genuine probability outputs.
7. Privacy/profiling restrictions apply to model evaluation as well as prediction generation.
8. Small samples cannot be marketed as model accuracy.
9. Drift warnings indicate distribution change, not automatically poor performance.
10. Model improvement must be driven by observed outcomes and versioned evidence.

## CI protection

Added:

```text
npm run verify:intelligence-calibration
```

CI verifies:

- canonical realized-outcome sources;
- explicit positive and negative resolution rules;
- idempotent outcome observation;
- immutable prediction history contract;
- privacy-aware evaluation;
- probability-only calibration metrics;
- Brier/log-loss/ECE surfaces;
- minimum sample gates;
- PSI drift monitoring;
- continued explicit non-probabilistic labeling of deterministic scores.

## Production acceptance

After migration/application and fresh real data accumulation:

1. run `observe_event_intelligence_lead_outcomes_v1` for the production organization;
2. verify resolved predictions link only to business facts after prediction time;
3. verify unresolved leads remain unresolved;
4. verify lost/unqualified transitions become negative only when they are the first authoritative resolution;
5. verify payment/enrollment/CRM-won facts become positive outcomes;
6. verify profiling-restricted subjects are absent from active evaluation;
7. monitor outcome coverage;
8. do not claim calibrated accuracy until the sample gate is met;
9. monitor calibration bins and ECE after sufficient outcomes accumulate;
10. monitor PSI separately from performance metrics.

## What this does not claim

This checkpoint does not claim that today's lead-scoring probability is calibrated or accurate. It establishes the instrumentation necessary to measure that objectively.

Until sufficient real outcomes accumulate, the correct product state is:

```text
calibration pipeline: implemented
realized outcome collection: enabled after production migration/run
model accuracy: not yet proven
```

## Next checkpoint

After production outcome coverage begins accumulating, the next accuracy step should use these measurements to build versioned recalibration/model promotion rules, including champion/challenger evaluation and automatic rejection of models that regress against a validated baseline.
