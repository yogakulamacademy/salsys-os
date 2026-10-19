# R9 — AEO / GEO / AI Visibility Closeout

Date: 2026-10-19
Branch: `feature/system-intelligence-v2`
Status: COMPLETE for the defined R9 software baseline

## Scope closed

R9 establishes the tenant-safe AEO / GEO / AI Visibility baseline from answer-engine demand and deterministic generative-readiness signals through observed AI-referral traffic and direct model-probe evidence.

Canonical chain:

`Search Console answer demand → AEO readiness → GEO readiness → observed AI referral traffic → AI-linked Lead evidence → authenticated model probe → deterministic brand matching → measured mention/recommendation observation → probe history → R9 health → closeout readiness`

## Verified platform capabilities

- AEO page-readiness and answer-demand intelligence
- High-opportunity answer-query identification
- Deterministic GEO / generative-readiness scoring
- Observed AI-referral provider classification from GA4 evidence
- Page-level AI-referral association
- AI-referral → Lead association
- Direct model-probe run ledger
- Direct model observations for brand mention and recommendation
- Recommendation-position evidence when present
- Citation evidence schema reserved for provider-supported citation observations
- Claude non-browsing visibility probe runner
- Authenticated tenant-safe visibility-probe API
- Operator AI Visibility Probe control
- Probe history and descriptive trend surface
- Canonical `v_seo_r9_health_v1` operational health model
- Canonical `v_seo_r9_closeout_readiness_v1` closeout audit
- R9 health, probe execution and probe history surfaced in the SEO Intelligence workspace

## Security / integrity verification

Production audit at closeout:

- probe runs: 1
- completed probe runs: 1
- failed probe runs: 0
- measured model observations: 1
- orphan observations: 0
- orphan citations: 0
- observation tenant mismatches: 0
- citation tenant mismatches: 0
- completed runs missing `completed_at`: 0
- failed runs missing error evidence: 0
- technical integrity clean: true
- canonical closeout status: `ready_for_r9_closeout`

The probe/evidence tables have RLS enabled. R9 read models use `security_invoker=true` and inherit caller permissions.

## First genuine production probe validation

The first authenticated Yogakulam production probe completed successfully through the operator UI.

Probe:

- provider: Anthropic
- model: `claude-sonnet-5-5`
- probe kind: `recommendation_visibility`
- prompt: `Recommend a few reputable residential yoga teacher training schools in Mysore, India.`
- locale: `en-IN`
- country: `IN`
- run status: `completed`
- measured observation stored: yes
- Yogakulam brand mentioned: false
- Yogakulam brand recommended: false
- mention count: 0
- recommendation position: none
- measured result: `not_observed`

This is a valid negative visibility observation. R9 completion means the measurement system is working; it does **not** mean Yogakulam currently has strong visibility in the probed model.

## Current Yogakulam production evidence at closeout

- AEO page rows: 195
- crawled AEO/GEO pages: 19
- pages with answer demand: 22
- high-opportunity answer queries: 3
- answer-query impressions: 5,969
- answer-query clicks: 52
- strong GEO-readiness pages: 5
- pages with observed AI referrals: 18
- page-level AI-referral sessions: 89
- provider-level GA4 AI-referral sessions: 130
- observed AI providers: 2
- AI-linked Leads: 1
- completed direct model probes: 1
- measured model observations: 1
- measured mention observations: 0
- measured recommendation observations: 0
- citation evidence available: false
- R9 operational status: `healthy`
- measured model visibility available: true

Provider-level GA4 referral sessions and page-level associated referral sessions are different scopes and must not be mechanically compared as if they are the same metric.

## Guardrails / interpretation

- AI-referral traffic is first-party observed traffic evidence; it is not citation proof.
- AEO/GEO readiness is deterministic content-readiness evidence; it is not direct model visibility.
- Direct probe responses are provider-response evidence for that prompt/model/time; they are not universal AI-market-share claims.
- The operator prompt is not injected with Yogakulam's brand identity before model execution.
- Brand detection is performed deterministically after the provider response.
- The current Anthropic probe is non-browsing and does not measure citations.
- `0` citation observations from this provider must not be presented as proof that no citations exist elsewhere; citation measurement is unsupported for the current probe path.
- Mention/recommendation rates from small probe samples are descriptive only and must not be presented as stable rankings or causal outcomes.
- No causal claim should be made between content changes, AI referrals, Leads, mentions or recommendations without an appropriate experimental design.

## Deferred operational / expansion work

The following are future expansion or recurring operations, not blockers to the R9 software baseline:

- run a larger, repeated neutral-prompt probe sample to build stable descriptive trends
- add additional AI providers where direct provider-response evidence can be collected safely
- add a citation-capable provider path before claiming citation visibility
- continue improving answer sections and GEO-ready content based on measured demand
- monitor AI-referral → Lead/business-value evidence over time
- continue production crawl population inherited from R8

## Phase boundary

R9 is closed for the defined software baseline.

The first real production probe validated the complete evidence path:

`operator UI → authenticated API → Anthropic response → deterministic brand matching → observation ledger → probe history → R9 health → closeout audit`

The next major phase is R10 — Predictive Intelligence + Owner Command Center. A short R7 conversion-feedback closure pass may also be scheduled before or alongside R10 because R7 still has provider-level validation blockers unrelated to R9.
