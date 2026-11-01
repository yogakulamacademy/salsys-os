# SalsysOS — North-Star Rebaseline v1

**Date:** 2026-11-01  
**Production organization:** Yogakulam Academy  
**Production head verified at rebaseline:** `1577f637e8cea3f8dbce8ef79f001667a1666540`

## Purpose

Rebaseline the R0-R14 roadmap against current repository and live production evidence after the engineering closeout, PA-1 capability, real-activity acceptance, and provider-readiness parity work.

Old roadmap percentages are planning estimates, not telemetry. This checkpoint replaces percentage-led sequencing with evidence-led status categories.

No customer, provider, payment, identity, recommendation or production business state was modified during this rebaseline.

## Status categories

- **V1 closed / stable** — audited engineering invariants are complete and no current production evidence requires reopening the phase.
- **Implemented, operational evidence incomplete** — material capability exists but production coverage/outcome proof is incomplete.
- **Ready for formal closeout** — the phase's own closeout readiness contract is currently satisfied; formal closeout remains to be recorded.
- **Active product gap** — material internal product work is still missing and can be advanced without an external blocker.
- **Parked / externally blocked** — progress currently requires provider approval, external host deployment, explicit human decision, or a separately authorized activation checkpoint.
- **Future vertical / commercial program** — larger productization work that should not displace a smaller evidence-backed checkpoint.

## R0-R14 rebaseline

| Phase | Evidence-led state | Current interpretation |
|---|---|---|
| R0 Platform Rebrand | V1 closed / stable | Broad 14-surface closeout is complete; no current regression evidence requires reopening platform identity/navigation work. |
| R1 Foundation / Tenancy / Security | V1 closed / stable | Tenant/server-authority, platform onboarding, role boundary, security and recovery contracts are production-deployed and validated. |
| R2 Lead Capture / Identity / Raw Events / Data Quality | Implemented; selected boundaries parked | Universal lead capture and identity/customer-360 foundations are live. PA-1 merge capability exists, but the current two-person ambiguity remains explicit human review. Commerce-authoritative completion is parked externally. |
| R3 CRM Sales Execution | V1 closed / stable | CRM Core V2 health is clean; real Leads, Conversations, Admissions automation and follow-up task creation are production-proven. |
| R4 Customer Journey / Person 360 | V1 closed with explicit human-review exception | Customer 360 is structurally healthy apart from the two intentional open identity conflicts. No auto-merge is permitted. |
| R5 Attribution / Funnel / Revenue | Implemented; revenue proof incomplete | Acquisition/funnel/conversion structures exist, but live verified payment/enrollment/revenue completion is not yet production-proven because the Yogakulam PHP completion emitter is parked. |
| R6 Intent / Product Affinity / Sales Intelligence | Implemented; outcome maturity incomplete | Person/course affinity and recommendation surfaces exist; recommendation/action outcome learning is not yet operating. |
| R7 Integrations / Conversion Feedback | Implemented; provider dependencies parked | GA4, GSC and WhatsApp are healthy. Google Ads and Meta Ads are correctly classified as provider/configuration blocked rather than internal runtime defects. |
| R8 Content + SEO Intelligence | Implemented; operational evidence coverage incomplete | GSC is fresh and semantic coverage is strong, but crawl coverage is only 9.7%; current R8 data-readiness band is degraded because site-wide crawl evidence is incomplete. |
| R9 AEO / GEO / AI Visibility | **Ready for formal closeout** | Production `v_seo_r9_closeout_readiness_v1` reports `ready_for_r9_closeout`; technical integrity is clean and genuine measured provider-probe evidence exists. |
| R10 Predictive Intelligence + Owner Command Center | **Active product gap** | Prediction foundation is active, but the recommendation/action/outcome learning loop has not started in production. |
| R11 Wellness / Education Productization | Substantial vertical layer; broader productization incomplete | Yogakulam has real course, batch, capacity, affinity and course-recommendation structures; reusable vertical-pack/generalization work remains larger than the immediate R9/R10 checkpoints. |
| R12 Realty | Future vertical program | Not selected in this rebaseline; remains the planned second vertical after the core/reusable product is stronger. |
| R13 Commercial SaaS Readiness | Major future productization program | Customer provisioning/onboarding exists, but public signup, billing/subscription enforcement, plan entitlements, abuse controls and customer-controlled organization deletion remain intentionally unimplemented. |
| R14 Marketing + First 100 Customers | Future GTM program | Depends on a sufficiently productized/commercially packaged R11/R13 surface; not the next engineering checkpoint. |

## R8 live evidence

`v_seo_r8_health_v1` currently reports:

```text
gsc_status                         fresh
semantic_status                    strong
semantic_coverage_pct              78.9
crawl_status                       partial
crawl_coverage_pct                 9.7
page_inventory_count               195
crawled_page_count                 19
crawl_queue_count                  175
deterministic_action_candidates    40
learning_enabled                   true
learning_status                    ready_no_samples
r8_data_readiness_band             degraded
```

Interpretation:

R8's capability surface is not the immediate engineering gap. The current weakness is evidence coverage/operations: the crawl queue must progress before site-wide conclusions are treated as complete.

Do not rebuild R8 merely because the data-readiness band is degraded.

## R9 live evidence

`v_seo_r9_health_v1` currently reports:

```text
operational_status                    healthy
aeo_page_rows                         195
geo_page_rows                         195
answer_query_rows                     707
answer_query_impressions              5402
answer_query_clicks                   43
pages_with_answer_demand              21
avg_answer_readiness_score            7.4
avg_generative_readiness_score        7.9
strong_geo_readiness_pages            5
ga4_ai_sessions                       128
ga4_ai_users                          108
ai_referral_sessions                  67
pages_with_ai_referrals               16
ai_linked_leads                       2
observed_ai_providers                 2
probe_runs                            1
completed_probe_runs                  1
failed_probe_runs                     0
model_observations                    1
citations_observed                    0
mention_observations                  0
measured_model_visibility_available   true
ai_referrals_are_observed             true
readiness_is_deterministic            true
citation_evidence_available           false
```

The absence of citation/mention observations is preserved as an observed zero; it must not be converted into fabricated evidence.

### R9 formal readiness

`v_seo_r9_closeout_readiness_v1` reports:

```text
r9_closeout_status                   ready_for_r9_closeout
technical_integrity_clean            true
orphan_observations                  0
orphan_citations                     0
observation_tenant_mismatches        0
citation_tenant_mismatches           0
completed_missing_completed_at       0
failed_missing_error                 0
completed_probe_runs                 1
model_observations                   1
```

Closeout reason:

`R9 direct-evidence integrity checks are clean and at least one genuine measured probe observation exists.`

The view's own contract requires clean integrity, at least one completed real probe, and at least one measured model observation. Production currently satisfies that contract.

## R10 live evidence

Current production counts:

```text
event_intelligence_predictions             767
event_intelligence_prediction_outcomes       0
system_intelligence_recommendations           0
system_intelligence_recommendation_events     0
lead_scoring_predictions                      0
```

`v_r10_recommendation_effectiveness_v1` reports:

```text
recommendations_total               0
recommendations_shown               0
recommendations_acted               0
recommendations_accepted            0
recommendations_completed           0
recommendations_dismissed           0
observed_outcome_events             0
learning_status                     no_recommendations
```

Interpretation:

R10 already has prediction infrastructure, but the North-Star loop does not yet reach recommendation -> human action -> observed outcome -> learning in production. This is the clearest next internal build gap after R9 is formally closed.

## R11 live vertical evidence

Yogakulam currently has:

```text
courses                              16
course_batches                       85
upcoming_batch_capacity_rows         63
person_course_affinity_rows          21
person_course_recommendation_rows    20
batch_demand_leads                    0
```

This proves that Wellness/Education productization is already substantial. It should be treated as a broader reusable-vertical program, not as an empty phase and not as the smallest next checkpoint.

## R13 known commercial gaps

Existing onboarding/provisioning evidence explicitly leaves these intentionally unimplemented:

- public tenant signup;
- billing/subscription enforcement;
- plan limits/entitlements;
- signup abuse controls/throttling;
- customer-controlled organization deletion.

R13 is therefore a major commercial SaaS program. It should follow, not precede, the immediate R9 closeout and R10 recommendation lifecycle work.

## Parked boundaries

These remain intentionally outside the next checkpoint:

### Commerce completion

```text
booking.completed       19
payment.started          2
payment.completed        0
enrollment.completed     0
```

The user chose to skip the live Hostinger/PHP completion deployment for now.

### PA-1 live identity decision

```text
open conflicts          2
source Person           active
merge audit rows        0
```

No human merge/dismiss decision has been authorized.

### Provider approvals

- Google Ads: `google_cloud_project_test_access` / external Google Cloud production API access;
- Meta Ads: `meta_ads_permission_missing` / external Meta business/app permission + account selection.

### Search Indexing

Intentionally inactive; OpenSearch remains derived/rebuildable.

## Sequencing decision

The next exact checkpoint is:

# R9 — AEO / GEO / AI Visibility Production Closeout V1

This is a closeout/verification checkpoint, not a new feature-build checkpoint.

If R9 verification remains clean, close R9 without inventing additional engineering work.

The next build checkpoint after R9 should be:

# R10 — Recommendation Lifecycle & Action-Outcome Learning V1

because production already contains prediction evidence but no recommendation/action/outcome loop.

## R9 closeout acceptance contract

Before R9 is marked closed, verify all of the following from live production and current repository state:

1. `r9_closeout_status = ready_for_r9_closeout`;
2. `technical_integrity_clean = true`;
3. at least one genuine completed provider probe exists;
4. at least one measured model observation exists;
5. orphan/two-tenant integrity violations remain zero;
6. completed runs have completion timestamps and failed runs have error evidence;
7. deterministic AEO/GEO readiness is clearly separated from measured model visibility;
8. observed GA4 AI referrals remain labeled observed evidence;
9. zero citations/mentions remain honest zero evidence and are not converted into synthetic proof;
10. no code or data mutation is performed unless verification reveals a real defect.

## Decision

North-Star Rebaseline v1 is complete.

The stale R9 ~65% planning estimate must not drive sequencing. Current production evidence says R9 is ready for formal closeout. R10 is the next genuine internal product gap after that closeout.
