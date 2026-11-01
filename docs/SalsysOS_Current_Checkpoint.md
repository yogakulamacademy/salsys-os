# SalsysOS Current Checkpoint

**Checkpoint date:** 2026-11-01  
**Canonical repository:** `yogakulamacademy/salsys-os`  
**Production branch:** `main`  
**Verified production head:** `1577f637e8cea3f8dbce8ef79f001667a1666540`  
**Companion context:** `docs/SalsysOS_North_Star_Product_Context.md`  
**Fast resume file:** `docs/SalsysOS_Active_Handoff.md`

> This is the canonical operational checkpoint. Historical files under `docs/checkpoints/` are immutable evidence records and must not be rewritten to match later implementation state.

---

## 1. Current position

SalsysOS is a **Sales + Analysis Operating System**.

Current state:

- broad 14-surface engineering closeout: complete;
- PA-1 human-approved identity merge capability: deployed; live decision deferred;
- real Lead -> Conversation -> Admissions -> Follow-up -> Booking -> Payment Started path: production-proven;
- Google/Meta provider-readiness parity: complete;
- North-Star R0-R14 rebaseline: complete;
- current exact checkpoint: **R9 — AEO / GEO / AI Visibility Production Closeout V1**.

Detailed rebaseline evidence:

`docs/checkpoints/M-2026-11-01-North-Star-Rebaseline-v1.md`

---

## 2. Verified production release

Latest merged main before this docs-only rebaseline:

```text
main SHA                   1577f637e8cea3f8dbce8ef79f001667a1666540
CI                         #1332 passed
CodeQL                     #617 passed
Production Smoke           #154 passed
Vercel production          READY on exact SHA
```

---

## 3. Evidence-led roadmap result

Do not use the old R0-R14 percentage estimates as current completion metrics.

Current evidence-led classification:

```text
R0  Platform Rebrand                         V1 closed / stable
R1  Foundation / Tenancy / Security          V1 closed / stable
R2  Lead Capture / Identity / Raw Events     implemented; selected boundaries parked
R3  CRM Sales Execution                      V1 closed / stable
R4  Customer Journey / Person 360            V1 closed; human-review identity exception
R5  Attribution / Funnel / Revenue           implemented; verified revenue proof incomplete
R6  Intent / Product Affinity                implemented; outcome maturity incomplete
R7  Integrations / Conversion Feedback       implemented; provider approvals parked
R8  Content + SEO Intelligence               implemented; crawl evidence coverage incomplete
R9  AEO / GEO / AI Visibility                READY FOR FORMAL CLOSEOUT
R10 Predictive + Owner Command Center         active product gap
R11 Wellness / Education Productization      substantial vertical layer; broader productization remains
R12 Realty                                    future vertical program
R13 Commercial SaaS Readiness                major productization program
R14 Marketing / First 100 Customers          future GTM program
```

---

## 4. Why R9 is next

Production `v_seo_r9_closeout_readiness_v1` currently reports:

```text
r9_closeout_status                   ready_for_r9_closeout
technical_integrity_clean            true
completed_probe_runs                 1
model_observations                   1
orphan_observations                  0
orphan_citations                     0
observation_tenant_mismatches        0
citation_tenant_mismatches           0
completed_missing_completed_at       0
failed_missing_error                 0
```

Live R9 evidence also includes:

```text
operational_status                    healthy
aeo_page_rows                         195
geo_page_rows                         195
answer_query_rows                     707
answer_query_impressions              5402
answer_query_clicks                   43
pages_with_answer_demand              21
ga4_ai_sessions                       128
ai_referral_sessions                  67
pages_with_ai_referrals               16
ai_linked_leads                       2
observed_ai_providers                 2
completed_probe_runs                  1
failed_probe_runs                     0
model_observations                    1
measured_model_visibility_available   true
ai_referrals_are_observed             true
readiness_is_deterministic            true
citations_observed                    0
mention_observations                  0
```

The zero citation/mention counts are legitimate observed zero evidence. Do not create or infer citations/mentions to make R9 appear stronger.

---

## 5. R9 closeout acceptance contract

Before declaring R9 V1 closed, verify read-only:

1. `r9_closeout_status = ready_for_r9_closeout`;
2. technical integrity remains clean;
3. at least one genuine completed provider probe exists;
4. at least one measured model observation exists;
5. all orphan/tenant-mismatch checks remain zero;
6. completed/failed probe evidence is structurally complete;
7. deterministic AEO/GEO readiness stays distinct from measured model visibility;
8. GA4 AI referrals remain labeled observed evidence;
9. zero citations/mentions stay honest zero evidence;
10. no code/data mutation occurs unless verification exposes a real defect.

If all ten remain true, close R9 by evidence/documentation rather than inventing feature work.

---

## 6. Next genuine build after R9

R10 is the clearest internal product gap.

Current production:

```text
event_intelligence_predictions             767
event_intelligence_prediction_outcomes       0
system_intelligence_recommendations           0
system_intelligence_recommendation_events     0
lead_scoring_predictions                      0
```

`v_r10_recommendation_effectiveness_v1` reports `learning_status = no_recommendations`.

Therefore the next build checkpoint after R9 should be:

**R10 — Recommendation Lifecycle & Action-Outcome Learning V1**

Do not implement R10 until R9 closeout is formally finished and the R10 acceptance/design contract is reviewed.

---

## 7. R8 operating note

R8 capability is mature, but current evidence coverage is incomplete:

```text
gsc_status               fresh
semantic_status          strong
semantic_coverage_pct    78.9
crawl_status             partial
crawl_coverage_pct       9.7
r8_data_readiness_band   degraded
```

This is currently an evidence-coverage/operations state, not justification to rebuild R8.

---

## 8. R11 / R13 notes

R11 Yogakulam vertical evidence already includes:

```text
courses                              16
course_batches                       85
upcoming_batch_capacity_rows         63
person_course_affinity_rows          21
person_course_recommendation_rows    20
```

R13 customer provisioning exists, but these remain intentionally unimplemented:

- public tenant signup;
- billing/subscription enforcement;
- plan limits/entitlements;
- signup abuse controls/throttling;
- customer-controlled organization deletion.

R11 and R13 are broader productization programs, not the next smallest evidence-backed checkpoint.

---

## 9. Parked boundaries

### Commerce completion

```text
booking.completed       19
payment.started          2
payment.completed        0
enrollment.completed     0
```

The user explicitly chose to skip the live Hostinger/PHP completion deployment for now. Do not resume it or manufacture revenue evidence unless the user returns to that path.

### PA-1 identity decision

```text
open conflicts          2
source Person           active
merge audit rows        0
```

No merge/dismissal is authorized without explicit human approval.

### Google / Meta

Both are now correctly modeled as external/provider configuration blockers, not internal runtime defects.

### Search Indexing

Intentionally inactive. OpenSearch remains derived/rebuildable.

---

## 10. Locked engineering rules

- one controlled checkpoint at a time;
- verify before modifying;
- production evidence beats stale planning percentages;
- tenant authority is server-derived;
- PostgreSQL/Supabase remains canonical truth;
- OpenSearch remains derived/rebuildable;
- observed, deterministic, attributed, inferred and modelled evidence remain distinct;
- raw provider failures are never hidden by readiness labels;
- no fabricated events, citations, conversions, revenue, outcomes or training evidence;
- no automatic ambiguous identity merge;
- browser behavior does not establish authoritative payment/enrollment/revenue truth;
- privacy/legal restrictions fail closed;
- high-impact actions remain human-governed unless explicitly activated.

---

## 11. Resume instruction

When resuming:

1. verify current `main`, production Supabase and Vercel provenance;
2. read `docs/SalsysOS_Active_Handoff.md`;
3. read this file;
4. read `docs/checkpoints/M-2026-11-01-North-Star-Rebaseline-v1.md`;
5. continue with the R9 closeout acceptance contract in Section 5;
6. do not resume parked commerce or PA-1 live identity work without explicit user choice.
