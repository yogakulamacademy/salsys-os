# M-2026-10-19 — Event Intelligence deterministic predictions v1

## Status
FOUNDATION MERGED; calibration/learned-model expansion pending real outcome volume.

The first Event Intelligence prediction layer is deterministic and evidence-bearing by design.

It ranks:
- session conversion intent;
- page traffic decline risk;
- SEO growth opportunity;
- paid attribution/lead-quality signals;
- existing statistical lead-scoring outputs bridged into the universal prediction ledger.

Every prediction records feature state, model key/version/mode, reason codes, explanation, evidence, generation/expiry information and later observed outcome.

## Model truth rules

- rules-generated scores are explicitly uncalibrated;
- deterministic scores must never be described as probabilities;
- only outputs from an evaluated statistical model registry may be represented as statistical probabilities;
- predictions are recommendations/evidence, not authorization to mutate customer/business state;
- actual outcomes must be written from real source evidence such as CRM/payment/enrollment/revenue state, never invented to improve a model.

## OpenSearch interaction

Derived predictions may be projected into OpenSearch for retrieval and similarity/search use. PostgreSQL remains authoritative for model version, score/probability, evidence and outcome.

## Next predictive work

After the universal first-party Yogakulam E2E journey is collecting reliable data:
1. measure feature coverage and missingness;
2. collect sufficient payment/enrollment/loss outcomes;
3. evaluate deterministic scores against outcomes;
4. train/compare statistical candidates only when sample size is credible;
5. promote only through existing model-evaluation/promotion guards;
6. add traffic, SEO, paid-media and revenue forecasts with explicit confidence/error metrics.

No prediction can autonomously change ad budgets, CRM stages, customer messaging, publishing or payments.
