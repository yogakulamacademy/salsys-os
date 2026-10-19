# R10 System Intelligence + Predictive Intelligence — Closeout

## Status

R10 engineering architecture is structurally complete on `feature/system-intelligence-v2`.

This closeout does **not** mean a statistically mature production prediction model already exists, and it does **not** yet constitute final production-runtime activation sign-off. Predictive activation remains evidence-gated: the system stays on deterministic operational priority scoring until enough real point-in-time feature history and positive/negative outcomes exist to train, evaluate and promote a model safely.

## Operating loop delivered

Observe → Understand → Remember → Decide → Act → Measure → Learn → Predict → Monitor → Retrain

### Observe / understand
- tenant-scoped system awareness
- reply backlog and overdue follow-up pressure
- lead re-engagement and behaviour signals
- lead/inbound velocity shifts
- backend/system failures and pending work
- directional awareness trends from historical snapshots

### Remember
- append-only system awareness snapshots
- append-only operational event memory
- point-in-time lead feature snapshots
- auditable lead outcome evidence
- recommendation outcome/event history

### Decide / act
- role-aware system-intelligence ranking
- bounded recommendation calibration
- deterministic operational lead priority
- next-best-action foundation
- Owner Command Center contract
- recommendation effectiveness contract

### Predict
- predictive readiness gate
- smart lead scoring contract separating operational score from probability
- point-in-time training dataset with temporal-leakage checks
- candidate-training readiness and auditable training-run registry
- logistic-regression candidate trainer
- grouped/time-aware holdout evaluation
- model registry and evaluation registry
- promotion guardrails and lifecycle audit
- production prediction worker with model-versioned explanations
- prediction TTL / refresh cycle

### Monitor / retrain
- realized-outcome drift evaluation
- model health and staleness checks
- retraining recommendation contract
- 14-day substantive retraining cooldown
- incumbent-vs-candidate shared-evidence comparison
- successor non-inferiority guardrail
- automatic retraining orchestrator
- automatic safe promotion worker

## Scheduled intelligence loop

- system awareness snapshot: hourly
- lead feature snapshot: every 6 hours
- production prediction refresh: every 6 hours
- realized-outcome drift evaluation: daily
- retraining orchestration: daily
- incumbent/candidate comparison: daily
- guarded model promotion: daily

All scheduled predictive actions are no-op or deterministic-fallback-safe when evidence is insufficient.

## Guardrails

- open/unlabeled leads are never silently treated as negatives
- deterministic lead priority is never presented as conversion probability
- prediction generation requires predictive-readiness plus an active validated model
- candidate training requires point-in-time data, class balance and zero temporal-order violations
- production promotion requires holdout quality/calibration gates
- replacing an incumbent additionally requires shared realized-outcome non-inferiority evidence
- sparse drift samples are observational only, not proof of degradation
- recommendation outcome rates are observed associations, not causal claims
- R10 views use `security_invoker=true`; anon access is revoked and tenant RLS remains enforced

## Current production-data state

The canonical database currently has insufficient predictive history for a real model. Yogakulam remains in deterministic guarded / insufficient-history mode with no active predictive model, which is the intended safe behaviour.

## Validation addendum — 2026-10-19

### Middleware / worker authentication

Production-validation review found that tenant middleware could intercept scheduled machine-worker requests before their Bearer-secret route authentication.

Fixed by commit:

`eeb412b3524e5ac32a006d99ee08f5337887f555` — `Allow secret-auth R10 workers through middleware`

The exact R10 worker routes may now pass through middleware to their route-level authentication. This does not expose the normal user-facing Intelligence API.

Vercel status for that implementation commit is GREEN.

### Production cron evidence still pending

The feature branch preview deployment is green, but preview deployment does not provide evidence of natural Vercel Cron execution for the production scheduler lifecycle.

Final runtime activation sign-off must be performed after a controlled production cutover by verifying real creation of:

- hourly awareness snapshots;
- six-hour lead feature snapshots;
- operational event memory;
- worker-authenticated scheduled executions;
- bounded/idempotent writes.

This is an activation/revalidation item rather than missing R10 architecture.

### Candidate trainer feature-set hardening required before real model activation

A fresh source review found that the current candidate trainer still includes target-adjacent fields while the model target is `eventual_positive_terminal_outcome`:

- `payment_starts_7d`
- `net_paid`
- `outstanding_balance`
- `operational_priority_score`

The v1 training target/prediction point must be made explicit and these inputs must be removed or deliberately justified before allowing a real candidate to train/promote. `net_paid` and `outstanding_balance` are especially close to the terminal commercial outcome and present a strong target-leakage risk for this target definition.

This does **not** currently create a bad production probability because there is no active predictive model and the canonical data is still below readiness thresholds.

Until this is hardened:

- do not force candidate training;
- do not force model promotion;
- deterministic guarded scoring remains authoritative.

Detailed validation checkpoint:

`docs/checkpoints/R10-2026-10-19-System-Predictive-Intelligence-Validation.md`

## Phase boundary

R10 remains closed as an **architecture/engineering build phase**. Do not reopen it merely because more real data is required for model maturity.

However, final **production activation sign-off** remains conditional on:

1. candidate trainer target/feature leakage hardening;
2. controlled production deployment;
3. natural scheduler/runtime verification.

After those checks pass, ongoing model training, calibration, drift evidence and recommendation effectiveness become operational learning rather than roadmap construction.

Next roadmap work after R10 activation sign-off:

1. close remaining R7 provider-validation items;
2. R11 Wellness/Education productization;
3. minimum viable R13 commercial SaaS readiness.
