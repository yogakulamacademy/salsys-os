# Checkpoint M-2026-10-18 — System Intelligence v2 + Claude Operating Synthesis

**Date:** 2026-10-18  
**Branch:** `feature/system-intelligence-v2`  
**Base:** `eb735cd36e56dcfb81a8ae017d8485ce06eeeb4a`  
**Latest code commit before this checkpoint:** `f0f6775b929457ac5c0a01fdc6757158e068fc0e`

## Goal

Advance SalsysOS from a deterministic but mostly single-snapshot operating brief into a more adaptive intelligence layer that can:

1. correlate overlapping symptoms into operating situations,
2. incorporate behavioral re-engagement and short-window velocity,
3. lower confidence when system evidence is degraded,
4. rank the same facts differently for owner/manager/admissions roles,
5. let Claude synthesize a concise operating brief without allowing the model to invent underlying business facts.

The product loop for this checkpoint is:

`live tenant evidence → deterministic correlation/velocity/role scoring → ranked signals → bounded Claude synthesis → human action`

No autonomous execution is introduced.

---

## 1. Intelligence context loader

Added:

`lib/intelligence/system-intelligence-context.ts`

The loader resolves the authenticated user and active tenant through the existing workspace resolver. It accepts no client organization ID.

Tenant-scoped evidence sources currently include:

- `v_admissions_owner_lead_signals`
- `v_lead_journey_intelligence`
- `v_system_activity_24h`
- `messages` for the latest 48 hours
- `leads` for the latest 48 hours

The derived context includes:

- active workspace role
- admissions/lead attention signals
- journey/re-engagement evidence
- system activity/failure/backlog evidence
- inbound message volume: current 24h vs previous 24h
- outbound message volume: current 24h vs previous 24h
- new lead volume: current 24h vs previous 24h
- degraded-source markers when an optional intelligence query fails

This keeps the system useful under partial degradation instead of silently treating missing evidence as healthy evidence.

---

## 2. Correlated Intelligence Core v2

Added:

`lib/intelligence/system-intelligence-v2.ts`

V2 builds on the v1 deterministic engine and adds the following.

### A. Reply-pressure correlation

The v1 signals for:

- needs reply
- waiting over one hour

are no longer shown as independent duplicate symptoms when the same leads underlie both. V2 creates one correlated operating situation with:

- active conversations needing replies
- count beyond one-hour threshold
- high-intent overlap
- current priority evidence

This makes the brief less noisy and more operational.

### B. Behavioral re-engagement

Uses `v_lead_journey_intelligence` to detect known active-pipeline leads that have re-engaged.

The signal can incorporate:

- number of re-engaged leads
- sessions in the last 24h
- high-intent events in the last 7d
- strongest current engagement signal

The result is a warm reactivation opportunity rather than a generic cold follow-up list.

### C. 24-hour velocity / acceleration

Compares current 24-hour activity with the immediately preceding 24-hour window.

Implemented directional signals include:

- inbound message acceleration
- new-lead acceleration

Thresholds require minimum volume and meaningful change so small/noisy changes do not automatically become recommendations.

### D. System-health confidence

Uses `v_system_activity_24h` plus query-degradation markers.

The system can elevate a health/data-quality signal when:

- processor failures exist
- pending work is materially accumulating
- an intelligence evidence source could not be loaded

This supports a core product rule: stale/degraded evidence must not be presented with the same confidence as healthy evidence.

### E. Role-aware ranking

The same underlying facts are reweighted for the authenticated workspace role.

Examples:

- admissions: conversation, follow-up and pipeline work receives more weight
- manager: pipeline, conversation, follow-up and revenue pressure receive more weight
- owner/admin: revenue, acquisition, pipeline and data-quality signals receive more weight

Tenant truth remains the same; only operational priority weighting changes.

---

## 3. Intelligence API / workspace upgrade

Updated:

- `app/intelligence/page.tsx`
- `app/api/intelligence/v1/route.ts`

`GET /api/intelligence/v1` now returns `version: 2` and uses the correlated context-aware engine.

The `/intelligence` workspace now explains that priorities are:

- correlated
- freshness-aware
- role-aware
- tenant-scoped
- human-controlled

---

## 4. Claude unified operating synthesis

Added:

`lib/intelligence/claude-operating-brief.ts`

Claude receives only a bounded deterministic contract containing:

- operating state
- attention score
- counters
- signal IDs
- categories
- tones
- scores
- titles
- deterministic reasons
- recommended actions
- metric label/value

It does **not** receive unrestricted CRM records through this pathway.

The Claude system contract explicitly forbids inventing:

- counts
- customers
- revenue
- rankings
- conversions
- causes
- URLs
- campaign performance
- system failures
- outcomes

It also forbids recommending silent autonomous customer, financial, website-publishing or automation-activation actions.

Expected structured output:

- `executive_summary`
- up to four `top_priorities`
- `watch`
- `confidence_note`

Returned signal IDs are validated against the deterministic signal set. Invalid/ungrounded priority output fails closed.

---

## 5. Claude synthesis API and UI

Added:

- `POST /api/intelligence/v1/synthesis`
- `components/claude-operating-brief.tsx`

Behavior:

- Claude is invoked **on demand**, not automatically on every page load
- current deterministic evidence is recomputed before the model call
- API is authenticated through the existing application auth/tenant path
- response is `private, no-store`
- deterministic intelligence remains available even if Claude is unavailable
- UI displays executive synthesis, ranked actions, watch items and confidence note
- no action execution endpoint is exposed

This keeps cost and control bounded while making the product feel materially more intelligent than a static dashboard.

---

## 6. Anthropic configuration verification

Vercel environment metadata was inspected without decrypting secret values.

Confirmed for Preview:

- `ANTHROPIC_API_KEY` exists as a Sensitive variable
- `ANTHROPIC_SONNET_MODEL` exists

No credential values were read or written into source/docs.

---

## 7. Build / deployment verification

### Deterministic v2 build

Deployment:

`dpl_GvA8m1YxYsvnHNyon9rNMLQyXJTb`

Commit:

`f79521e99443587f7955ece93009cd72af67e137`

Verified:

- Next.js 15.5.26
- compiled successfully in 22.1s
- lint/type validation passed in the build pipeline
- 38/38 static pages generated
- deployment reached `READY`

### Claude-integrated v2 build

Deployment:

`dpl_HCxBjSYrkrf12Vg9vbPrHwp6P9pj`

Commit:

`f0f6775b929457ac5c0a01fdc6757158e068fc0e`

Verified:

- build completed successfully
- serverless functions were created
- deployment reached `READY`

The protected synthesis route was also checked without an application session. An unauthenticated request was routed to the SalsysOS login flow with `next=/api/intelligence/v1/synthesis`, confirming it is not publicly callable.

### Runtime limitation

The actual authenticated Anthropic synthesis call has **not yet been executed through a valid SalsysOS user session in this checkpoint**. Therefore:

- code/build/deployment/configuration: verified
- route authentication protection: verified
- real authenticated Claude response: still pending runtime proof

Do not claim Claude operating synthesis is E2E runtime-verified until that final call is observed.

---

## 8. Safety posture

Unchanged and intentional:

- autonomous customer messaging: OFF
- automatic website publishing: OFF
- semantic/vector production indexing: OFF
- live paid ranking provider: OFF / deferred
- production-wide OpenSearch indexing: OFF after controlled lexical pilot
- customer/financial/automation/website high-impact actions remain human-controlled
- PostgreSQL remains source of truth
- Claude is a synthesis/reasoning layer, not evidence authority

---

## 9. Directional progress after this checkpoint

Planning estimates only:

- System Intelligence full vision: ~60–65% (up from ~45% at v1)
- Claude unified reasoning layer: ~65–70% architecture/build, with authenticated runtime synthesis still pending
- Overall defined SalsysOS scope: approximately ~84–86%

These are planning indicators, not formal production sign-off.

---

## 10. Next checkpoint

The next intelligence milestone should close the loop from recommendation to learning:

`signal/recommendation → shown → accepted/dismissed → action taken → outcome → calibration`

Planned work:

1. recommendation/impression ledger
2. accept/dismiss feedback
3. link recommendation to user action where possible
4. outcome classification
5. per-tenant effectiveness metrics
6. bounded calibration of deterministic priority weights
7. preserve explainability and minimum evidence floors

Before broad rollout, W8 final security closeout remains a separate required workstream.
