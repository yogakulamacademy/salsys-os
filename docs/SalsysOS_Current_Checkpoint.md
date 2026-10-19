# SalsysOS — Current Checkpoint

**Updated:** 2026-10-19  
**Canonical repository:** `yogakulamacademy/salsys-os`  
**Canonical production Supabase:** `doaozrkrtgeslddwhclj`  
**Production domain:** `https://salsysos.com`  
**Current engineering branch:** `feature/system-intelligence-v2`  
**Latest validated implementation HEAD before checkpoint documentation:** `eeb412b3524e5ac32a006d99ee08f5337887f555` — `Allow secret-auth R10 workers through middleware`  
**Vercel status for that implementation HEAD:** GREEN

> This is the mutable implementation checkpoint. It records verified phase state, production-safety posture, known blockers and the immediate execution order. Historical documents remain useful context, but this file is the current roadmap checkpoint.

---

## 1. Product north star

SalsysOS is a **Sales + Analysis Operating System**, not a generic CRM.

Core business loop:

`marketing spend → traffic → source/campaign/content → lead → conversation → intent/objection/product → salesperson activity → follow-up → payment/enrollment → revenue → attribution → ad feedback → learning`

System Intelligence loop:

`Observe → Understand → Remember → Decide → Act → Measure → Learn → Predict → Monitor → Retrain`

Primary proving vertical: **Wellness / Education**, using Yogakulam Academy as the live proving ground.  
Second planned vertical: **Realty**.

Guardrails remain locked:

- observed facts must stay separate from inferred/modelled data;
- deterministic matching/scoring is preferred before probabilistic output;
- raw evidence is append-only where appropriate;
- predictive probabilities are never shown unless model readiness and promotion gates pass;
- open/unlabeled leads are not silently treated as negatives;
- correlation must not be described as causation;
- customer-facing or financially sensitive automation remains bounded and auditable.

---

## 2. Roadmap phase status

Directional productization estimates are separate from formal engineering closeouts.

| Phase | Scope | Current state |
|---|---|---:|
| R0 | Platform rebrand / baseline cleanup | ~95% |
| R1 | Foundation, tenancy, security baseline | **100% — closed** |
| R2 | Lead capture, identity, raw events, data quality | **100% — closed** |
| R3 | CRM sales execution | **100% — closed** |
| R4 | Customer journey / Customer 360 | **100% — closed** |
| R5 | Attribution, funnel and revenue intelligence | **100% — closed** |
| R6 | Intent, product affinity and sales intelligence | **100% — closed** |
| R7 | Integrations + conversion feedback | ~85% |
| R8 | Content + SEO intelligence | **100% — closed** |
| R9 | AEO / GEO / AI visibility | **100% — closed** |
| R10 | System + Predictive Intelligence | **Engineering architecture complete; runtime/model activation revalidation open** |
| R11 | Wellness / Education productization | ~50% |
| R12 | Realty vertical | ~10–15% |
| R13 | Commercial SaaS readiness | ~60% |
| R14 | Marketing + first 100 customers | ~15–20% |

Current high-level directional estimates:

- **Core technical platform:** ~92–94%
- **Wellness/Education technically usable:** ~85–88%
- **Wellness/Education commercially SaaS-ready:** ~76–80%
- **Complete roadmap including SaaS + Realty + GTM:** ~64–68%

These percentages are planning estimates, not formal QA or provider-readiness guarantees.

---

## 3. Closed engineering phases

### R1 — Foundation / tenancy / security

Formal closeout is complete. Tenant/session boundaries, membership enforcement, RLS posture and zero-multi-active-org assumptions were validated for the closed scope.

### R2 — Lead capture / identity / raw events

Closed. Source event → privacy/contract → raw evidence → retry → identity → ingest/dedupe → attribution → integrity path is implemented.

### R3 — CRM sales execution

Closed. Lead lifecycle, stages, ownership, follow-up/task execution and admissions/sales workspace foundations are implemented.

### R4 — Customer Journey / Customer 360

Closed. Unified journey evidence and Customer 360 foundations are implemented.

### R5 — Attribution / funnel / revenue

Closed. Cohort-consistent funnel and revenue/attribution models are implemented.

### R6 — Intent / product affinity / sales intelligence

Closed. Observed intent and derived sales intelligence are separated. Predictive conversion probability belongs to R10 rather than R6.

### R8 — Content + SEO Intelligence

Closed. SEO evidence, decision, learning and bounded recommendation systems are materially complete for the formal phase scope.

### R9 — AEO / GEO / AI Visibility

Closed. AI-referral visibility, answer-demand/AEO evidence and grounded direct-model observation architecture are implemented. Do not equate referral traffic with citations or one probe with stable ranking.

---

## 4. R7 — integrations + conversion feedback

**Current:** ~85%.

Implemented:

- Google/Meta/WhatsApp integration foundations;
- consent-safe conversion-feedback architecture;
- Google payment-success validation route in validate-only posture;
- Meta adapter/registry foundations.

Remaining:

- Meta Ads permission + ad-account selection;
- Meta conversion-feedback route validation;
- Google validation using a genuinely eligible consented conversion with match evidence;
- operator retry/failure feedback UI;
- final scheduler/worker verification;
- formal R7 closeout.

Do not force provider validation by bypassing consent or match requirements.

---

## 5. R10 — System + Predictive Intelligence

### Engineering status

R10 architecture is structurally complete on `feature/system-intelligence-v2`.

Delivered operating path:

`live state → awareness snapshots → event memory → directional trend → role-aware ranking → recommendations/actions → point-in-time lead features → outcome labels → candidate training → holdout evaluation → promotion guardrails → production predictions → realized-outcome drift → retraining/comparison`

Major delivered components include:

- system awareness and urgency signals;
- hourly awareness snapshots;
- directional trend detection;
- append-only operational event memory;
- role-aware system-intelligence ranking;
- recommendation calibration/effectiveness foundations;
- predictive-readiness gate;
- smart lead scoring with deterministic fallback;
- point-in-time lead feature snapshots;
- auditable outcome evidence;
- training dataset/readiness and training-run contracts;
- model/evaluation registry;
- candidate logistic-regression trainer;
- holdout metrics and promotion thresholds;
- model lifecycle audit + guarded promotion;
- production prediction worker and expiry;
- model health/staleness/drift contracts;
- realized-outcome drift evaluation;
- retraining readiness + cooldown;
- incumbent-vs-candidate comparison;
- successor non-inferiority guardrail;
- Owner Command Center backend contract.

### Scheduled runtime

Configured worker cadence:

- system awareness snapshot — hourly;
- lead feature snapshot — every 6 hours;
- lead prediction refresh — every 6 hours;
- realized-outcome drift evaluation — daily;
- retraining orchestration — daily;
- candidate/incumbent comparison — daily;
- guarded model promotion — daily.

### Validation completed

- Vercel preview build: GREEN;
- canonical DB/RLS/security-invoker posture checked for R10 objects;
- worker-level secret-auth pattern verified;
- `CRON_SECRET` environment support exists for the relevant deployment environments;
- middleware bug found and fixed at `eeb412b3524e5ac32a006d99ee08f5337887f555` so exact machine-worker routes can reach their own Bearer-secret authentication rather than being redirected as normal user routes;
- normal user-facing Intelligence API remains authenticated.

### R10 production activation blockers / revalidation items

#### A. Natural cron evidence

The completed R10 code is on a Vercel preview branch. Natural Vercel Cron execution requires the production deployment path, so canonical production still lacks the natural scheduled snapshot/event history needed for final scheduler sign-off.

After controlled production cutover, verify:

1. hourly system snapshots;
2. six-hour lead feature snapshots;
3. event memory accumulation;
4. scheduler authentication;
5. no duplicate/unbounded writes;
6. readiness progression from real evidence only.

#### B. Candidate trainer feature leakage hardening

Fresh source review found the candidate trainer still includes target-adjacent fields while targeting `eventual_positive_terminal_outcome`:

- `payment_starts_7d`
- `net_paid`
- `outstanding_balance`
- `operational_priority_score`

This must be hardened before any real model is deliberately trained/promoted. `net_paid` and `outstanding_balance` are especially close to the terminal commercial outcome and require an explicit prediction-point/horizon design or removal from the v1 feature set.

There is **no current bad production probability impact** because no validated active predictive model exists and the canonical dataset remains insufficient for predictive activation.

Until hardened, deterministic guarded scoring remains authoritative.

Detailed checkpoint:

`docs/checkpoints/R10-2026-10-19-System-Predictive-Intelligence-Validation.md`

---

## 6. R11 — Wellness / Education productization

**Current:** ~50%.

The underlying engine is already much further along than the reusable customer product layer.

Remaining major work:

- onboarding wizard;
- organization/school profile setup;
- course/batch/workflow presets;
- role presets;
- follow-up/nurture templates;
- payment/deposit setup;
- integrations wizard;
- demo/sample data;
- guided setup and onboarding health;
- reusable dashboard defaults;
- terminology/branding configuration;
- customer-facing setup documentation.

Goal: turn Yogakulam-proven infrastructure into a repeatable Wellness/Education edition without bespoke engineering per customer.

---

## 7. R13 — commercial SaaS readiness

**Current:** ~60%.

Remaining major work:

- plans, subscriptions and billing;
- trial lifecycle;
- entitlements / usage limits;
- self-service signup and tenant provisioning;
- upgrade/downgrade paths;
- failed-payment handling;
- cancellation;
- customer export/delete controls;
- admin/support console;
- retention/backups operating controls;
- subscription/usage analytics.

Minimum viable R13 should follow R11 closely enough to enable paid Wellness customers.

---

## 8. R12 — Realty

**Current:** ~10–15%.

The generic platform is reusable, but Realty-specific entities/workflows remain mostly future work:

- developers/projects/towers/units;
- inventory and pricing;
- buyer preferences and matching;
- site visits;
- channel partners/brokers;
- booking/reservation flow;
- Realty-specific intent/scoring/predictions;
- Realty dashboards.

Do not prioritize full Realty before Wellness productization and minimum commercial SaaS readiness.

---

## 9. R14 — GTM / first 100 customers

**Current:** ~15–20%.

Remaining:

- product/pricing site;
- public demo/trial;
- sales deck and Yogakulam case study;
- Wellness landing pages;
- outbound/referral/partner motions;
- customer-success/support process;
- activation/churn analytics;
- first 10 / 25 / 50 / 100 customer milestones.

---

## 10. Exact next execution order

1. **R10 validation hardening:** remove/redesign target-adjacent trainer features and make prediction point/horizon explicit.
2. **Controlled R10 production cutover:** build a bounded diff from current `main`; do not blindly deploy the long-lived feature branch.
3. **R10 production-runtime sign-off:** observe natural cron snapshots/events and verify scheduler auth/idempotency.
4. **Close R7** provider-validation items that are possible with real permissions/evidence.
5. **R11 Wellness/Education productization.**
6. **Minimum viable R13** for paid SaaS onboarding/billing/entitlements.
7. Begin selling the Wellness Edition.
8. Build R12 Realty after the reusable product/commercial path is stable.
9. Scale R14 GTM.

---

## 11. Current safety posture

- GitHub feature branch is the engineering source of truth for the current R10 work.
- Canonical Supabase remains `doaozrkrtgeslddwhclj`; do not use the legacy/wrong project.
- Do not fabricate predictive probabilities, AI citations, provider conversion validation or model maturity.
- Do not manually force a predictive model while readiness is insufficient or trainer target leakage remains unresolved.
- Do not deploy the entire long-lived feature branch to production without a controlled cutover review.
- Human approval remains required for sensitive external actions.

This checkpoint supersedes the older System Intelligence Core v1 status in this mutable file.
