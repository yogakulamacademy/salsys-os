# SalsysOS Current Checkpoint

**Checkpoint date:** 2026-11-01  
**Canonical repository:** `yogakulamacademy/salsys-os`  
**Production branch:** `main`  
**Verified production runtime head:** `5162d40f324ec79157c0db24ff2c303ef325ea62`  
**Latest docs closeout merge:** `4ddcea8b661d7371c3e6c52adcb0b75f4c724ec1`  
**Fast resume file:** `docs/SalsysOS_Active_Handoff.md`

> Historical checkpoint files under `docs/checkpoints/` are immutable evidence records.

---

## 1. Current position

SalsysOS is a **Sales + Analysis Operating System**.

Current state:

- broad 14-surface engineering closeout: complete;
- R9 AEO / GEO / AI Visibility V1: formally closed;
- R10-P0 Recommendation Security & Reproducibility Hardening: complete;
- R10-P1 Deterministic Recommended Actions: complete;
- R10-P2 Human Feedback Lifecycle UI: complete and production-verified;
- **R10-P3 Observed Outcome & Learning Runner audit/design: complete and locked**;
- current exact checkpoint: **R10-P3 implementation against the locked hardening/runner contract**.

Read first:

- `docs/checkpoints/M-2026-11-01-R10-P3-Outcome-Learning-Audit-Design-v1.md`
- `docs/checkpoints/M-2026-11-01-R10-P2-Human-Feedback-Closeout-v1.md`
- `docs/checkpoints/M-2026-11-01-R10-P2-Human-Feedback-Audit-Design-v1.md`
- `docs/checkpoints/M-2026-11-01-R10-P1-Closeout-v1.md`

---

## 2. P2 runtime remains verified

```text
Implementation PR           #417
runtime SHA                 5162d40f324ec79157c0db24ff2c303ef325ea62
post-merge CI               #1360 passed
post-merge CodeQL           #645 passed
Production Smoke            #166 passed
Vercel production           READY on exact runtime SHA
```

No P2 schema migration was required.

P2 production evidence remained intentionally empty because no synthetic operator action was executed.

---

## 3. P3 audit findings

Current production state:

```text
recommendations                    0
acted recommendations              0
completed recommendations          0
outcome events                     0
learning profiles                  0
pg_cron installed                  true
recommendation-outcome cron        none
```

The existing observer/learning stack is not safe to schedule unchanged.

### Gap 1 — machine observer mismatch

`observe_system_intelligence_recommendation_outcomes_v1(...)` is executable only by service-role/database paths, but its body still requires `auth.uid()` and a human-bound tenant session.

Do not schedule V1.

### Gap 2 — source-family mismatch

Live P1/P2 recommendations use:

```text
source_version = 'r10-p1'
```

Existing effectiveness/action-completion reads filter only:

```text
source_version = 'v2'
```

Therefore live R10 Command Center recommendations would be omitted from those read models.

### Gap 3 — learning sample duplication

Current learning recomputation counts raw outcome-event rows. One recommendation may legitimately receive multiple later temporal observations, so one recommendation could be over-weighted.

### Gap 4 — learning-profile privileges

`authenticated` currently has broad table privileges on `system_intelligence_learning_profiles`, including mutation/TRUNCATE. P3 must reduce this to SELECT-only through tenant RLS.

### Gap 5 — no runner telemetry

There is no recommendation-outcome run ledger or System Health source. The generic `system_intelligence_events` vocabulary is not suitable for runner telemetry.

---

## 4. Locked P3 implementation contract

P3 must add:

1. machine-safe V2 observer with explicit `organization_id`, SECURITY DEFINER, trusted execution only;
2. latest-per-recommendation V2 learning recomputation;
3. effectiveness/completion reads that deliberately include supported `v2` and `r10-p1` source families;
4. SELECT-only authenticated learning-profile table access;
5. tenant-scoped `system_intelligence_outcome_runs` operational ledger;
6. bounded database-native sweep runner with per-tenant exception isolation;
7. one `pg_cron` schedule every 15 minutes;
8. canonical `v_system_health` integration sourced from the run ledger;
9. CI regression checks preserving P1/P2 and predictive-safety boundaries.

---

## 5. Learning remains descriptive

P3 must **not** apply learning-profile `score_adjustment` to live R10-P1 priority.

Live recommendation ordering remains canonical deterministic admissions priority.

Learning profiles may store descriptive sample counts, bounded adjustment metadata and confidence, but these are not trained conversion probabilities and are not automatically promoted into ranking.

Any future ranking use requires a separate checkpoint backed by sufficient real evidence.

---

## 6. Outcome semantics remain non-causal

Existing downstream evidence classes remain:

- positive: observed paid / confirmed-completed enrollment / forward stage movement after action start;
- negative: observed lost-unqualified / cancelled enrollment / refunded-partially-refunded payment after action start;
- mixed: both positive and negative observed;
- inconclusive: no resolved movement after the existing 72-hour boundary.

`acted_at` remains the temporal intervention boundary.

Outcome events are temporal associations only. They do not prove that the recommendation caused the result.

---

## 7. Runner / health model

Initial schedule:

```text
*/15 * * * *
```

The runner must fan out across active organizations explicitly and isolate tenant failures.

`system_intelligence_outcome_runs` records operational telemetry only; a successful zero-outcome run is valid scheduler evidence and is not fabricated business-outcome evidence.

System Health should reflect runner execution/failures/staleness from that ledger, not whether recommendations happened to exist.

---

## 8. Implementation sequence

1. create P3 hardening migration;
2. revoke authenticated learning-profile mutations;
3. add outcome-run ledger + RLS;
4. add V2 observer;
5. add V2 latest-per-recommendation learning recompute;
6. correct effectiveness/completion source-family filters;
7. add bounded sweep runner;
8. register one 15-minute cron job;
9. extend `v_system_health`;
10. extend R10 verifier;
11. CI + CodeQL;
12. apply migration;
13. verify cron/provenance/health read-only;
14. do not seed recommendation/outcome/learning evidence;
15. close P3 only after production acceptance.

---

## 9. Parked boundaries

Do not resume automatically:

- predictive model promotion;
- automatic learning-based recommendation priority adjustment;
- commerce completion / Hostinger PHP emitter;
- PA-1 live identity decision;
- Google/Meta provider approval;
- Search Indexing activation.

---

## 10. Locked engineering rules

- one controlled checkpoint at a time;
- verify before modifying;
- PostgreSQL remains canonical truth;
- tenant authority is explicit/server-derived;
- no fake recommendation/feedback/outcome/learning evidence;
- deterministic priority remains distinct from descriptive learning and trained prediction;
- high-impact actions remain human-governed;
- temporal observation must not be presented as causal attribution.

---

## 11. Resume instruction

1. read `docs/SalsysOS_Active_Handoff.md`;
2. read the P3 audit/design checkpoint;
3. verify main/Supabase/Vercel provenance;
4. implement P3 in the locked sequence;
5. do not schedule the legacy V1 observer;
6. do not apply learning adjustments to live ranking;
7. do not create synthetic outcome evidence during acceptance.
