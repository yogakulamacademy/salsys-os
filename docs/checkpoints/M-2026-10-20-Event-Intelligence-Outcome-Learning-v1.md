# M-2026-10-20 — Event Intelligence Realized Outcome Learning V1

## Goal

Close the first honest prediction → realized outcome → measurement loop without turning deterministic ranking scores into fake probabilities.

This checkpoint prioritizes label quality over label volume.

## Production state before this checkpoint

- Event Intelligence had deterministic predictions and an outcome ledger, but zero recorded prediction outcomes.
- Lead-scoring probability predictions were also absent.
- Freshness hardening had already removed stale session/traffic/paid predictions from the active decision surface.
- Only fresh-contract predictions are eligible for the new learning observer.

## Session conversion outcome definition

For `session_conversion_intent`, the V1 learning question is:

> Did an identity-resolved lead linked to this session produce an authoritative transactional payment/enrollment conversion within 30 days after prediction generation?

Positive evidence requires a `v_lead_conversion_facts` row with:

```text
authority_level = transactional
conversion_type in (payment_success, enrollment_confirmed)
```

The observer records:

```text
linked_transactional_conversion_within_30d
```

with `binary_outcome = 1`.

A negative outcome is recorded only after the 30-day horizon matures and only when the session has a resolved lead identity. It records:

```text
no_linked_transactional_conversion_within_30d
```

with `binary_outcome = 0`.

## Critical conservative rule

An anonymous session that remains identity-unresolved after the horizon is **not forced negative**.

This avoids teaching the model that an inability to observe a customer identity means the person did not convert.

The observer reports these separately as:

```text
matured_identity_unresolved
```

They remain unlabeled.

## Historical boundary

Only predictions containing the explicit `feature_freshness` evidence contract are eligible for outcome learning.

The older stale predictions remain in PostgreSQL for audit but are not retroactively used as training/evaluation evidence.

## Added

### Outcome horizon policy

`event_intelligence_outcome_horizon_v1(prediction_type)`

V1 horizons are explicit and family-specific. Session and lead conversion use a 30-day realized-outcome horizon. Other families have reserved horizons for later observers.

### Session outcome observer

`observe_session_conversion_intent_outcomes_v1(org_id, limit)`

Guardrails:

- tenant scoped;
- advisory-lock protected against concurrent double observation;
- only freshness-contract predictions;
- only authoritative transactional positives;
- negatives only after horizon maturity;
- negatives require resolved lead identity;
- unresolved anonymous sessions remain unlabeled;
- records through the canonical `record_event_intelligence_outcome_v1` ledger.

### Realized session ranking dataset

`v_session_conversion_intent_outcome_dataset_v1`

Uses one latest realized prediction per session subject to prevent refresh frequency from overweighting the same session in ranking evaluation.

### Ranking quality bands

`v_session_conversion_intent_ranking_quality_v1`

Reports by deterministic score band:

- observed predictions;
- positive outcomes;
- negative outcomes;
- average ranking score;
- observed conversion rate;
- baseline conversion rate;
- lift vs baseline.

These are ranking diagnostics, not probability calibration.

### Ranking learning health

`v_session_conversion_intent_ranking_health_v1`

Minimum evidence gates:

- at least 30 observed predictions;
- at least 5 positive outcomes;
- at least 5 negative outcomes;
- at least two comparable populated score-band transitions.

The view checks whether observed conversion rates are non-decreasing across sufficiently populated score bands.

It explicitly exposes:

```text
calibrated_probability_claim = false
```

### Probability calibration health

`v_event_intelligence_probability_calibration_health_v1`

For future probability models only, Brier score and Expected Calibration Error are withheld until there are at least:

- 50 observed probability predictions;
- 10 positive outcomes;
- 10 negative outcomes.

Until those thresholds are met, the system reports an evidence/readiness state rather than a calibration number.

### Combined outcome-learning health

`v_event_intelligence_outcome_learning_health_v1`

Separates:

- deterministic ranking learning;
- probability calibration learning;
- evidence collection state.

## CI protection

Added:

```text
npm run verify:outcome-learning
```

CI verifies:

- explicit horizons;
- transactional positive authority;
- freshness-contract boundary;
- conservative negative labeling;
- unresolved identity handling;
- ranking-vs-probability separation;
- Brier/ECE sample thresholds;
- combined outcome-learning health.

## Accuracy principles locked by this checkpoint

1. No outcome is fabricated just to increase sample size.
2. Unknown identity is not a negative conversion outcome.
3. Operational CRM status is not substituted for authoritative transactional conversion in this observer.
4. Historical stale predictions do not become training evidence retroactively.
5. Repeated refreshes do not overweight one session in ranking diagnostics.
6. A deterministic score is evaluated as a ranking, not as a probability.
7. Calibration metrics are withheld until minimum class/sample evidence exists.
8. Outcome learning is based on realized facts in PostgreSQL.

## Production acceptance

After merge/application:

1. run the observer once for the production tenant;
2. verify the 500 historical stale session predictions remain unobserved/excluded;
3. verify no anonymous unresolved session is labeled negative;
4. verify any eligible transactional positive is recorded once;
5. verify the current health state honestly reports insufficient/collecting evidence when appropriate;
6. do not train/promote a probability model until safe feature snapshots and realized outcomes reach the existing promotion thresholds.

The next accuracy checkpoint should focus on distribution/missingness/outcome drift after enough fresh production evidence begins accumulating.
