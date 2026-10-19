# M-2026-10-20 — Event Prediction Freshness V1

## Goal

Prevent Salsys from presenting old evidence as a new actionable prediction.

A prediction can be technically reproducible and still be misleading if the underlying feature state is stale. This checkpoint adds a hard freshness contract between feature observation time and prediction generation time.

## Production issue found

Before this checkpoint, deterministic prediction refresh selected the most recent feature states by subject but did not require them to be recent relative to prediction generation time.

Production inspection found that all currently generated Event Intelligence deterministic predictions with an `observed_at` evidence timestamp were older than 24 hours at generation time. Examples included session-intent features that were roughly two weeks old being emitted as fresh 24-hour predictions.

That does not mean the historical behavior score itself was mathematically wrong. It means the score was being packaged with an actionable freshness/expiry window that could overstate how current the evidence was.

## Added

### Central freshness policy

`event_intelligence_prediction_max_feature_age_v1(prediction_type)`

Current V1 evidence-age limits:

```text
session_conversion_intent   24 hours
traffic_decline_risk        72 hours
seo_growth_opportunity       7 days
paid_attribution_gap_risk   72 hours
paid_lead_quality           72 hours
lead_conversion_probability 24 hours
```

The limits intentionally vary by signal family. A website session intent score decays much faster than an SEO opportunity built from multi-day search data.

### Prediction write guard

`record_event_intelligence_prediction_v1(...)` now:

- verifies feature-state tenant alignment;
- rejects missing feature observation time;
- rejects evidence timestamped materially in the future;
- rejects features older than the configured prediction-family limit;
- rejects already-expired prediction windows;
- does not supersede a valid active prediction when a stale replacement attempt is rejected;
- records explicit feature-freshness provenance for accepted predictions.

A rejected stale prediction returns `NULL` and creates no prediction row.

### Accurate refresh accounting

`refresh_event_intelligence_predictions_v1(...)` now distinguishes:

- predictions actually emitted;
- candidates skipped by freshness/expiry guards.

The existing response keys are preserved, with additional `freshness_skips` counters and `feature_freshness_guard=true`.

The lead-scoring bridge additionally ignores expired lead predictions and inactive model versions.

### Existing stale-prediction cleanup

When the migration is applied, currently active predictions backed by evidence outside the same freshness policy are marked `expired`.

Historical rows remain in PostgreSQL. They are not deleted, preserving auditability.

### Freshness health

`v_event_intelligence_prediction_freshness_health_v1`

Reports by organization and prediction type:

- total predictions;
- active predictions;
- fresh active predictions;
- stale active predictions;
- expired predictions;
- observed predictions;
- average/max feature age for active predictions;
- configured max feature age;
- freshness health state.

The desired invariant is:

```text
stale_active_predictions = 0
```

## Accuracy principles locked by this checkpoint

1. Old evidence is not current evidence.
2. Prediction expiry alone is insufficient; feature freshness must also be valid.
3. A stale candidate must not supersede a valid fresh prediction.
4. Deterministic ranking scores remain explicitly distinct from calibrated probabilities.
5. Historical stale predictions are preserved for audit but removed from the active decision surface.
6. Freshness limits are prediction-family specific rather than one global TTL.
7. Source timestamps materially in the future fail closed.

## CI protection

Added:

```text
npm run verify:intelligence-freshness
```

CI verifies the freshness policy, future-clock guard, stale suppression, cleanup contract, lead-model bridge guards, freshness health view and continued non-probabilistic labeling of deterministic rules.

## Production acceptance

After merge/application:

1. stale active predictions should be zero;
2. old feature states should not create new active predictions;
3. fresh feature states should still create predictions;
4. refresh counters must report skipped candidates separately;
5. accepted prediction evidence should include feature-freshness provenance;
6. no probability accuracy claim should be made from deterministic scores.

The next checkpoint should focus on realized-outcome observation and calibration/drift measurement after fresh, privacy-aware evidence begins accumulating.
