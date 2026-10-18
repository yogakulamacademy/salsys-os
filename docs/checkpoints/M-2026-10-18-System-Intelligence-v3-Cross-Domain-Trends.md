# SalsysOS — System Intelligence v3 Cross-Domain Trends

**Date:** 2026-10-18  
**Branch:** `feature/system-intelligence-v3`  
**Base checkpoint:** W8 tenant-security implementation sign-off at `b929d6b73c307c4b52da7969fdae8560d79b594e`

## Goal

Move the operating intelligence layer beyond isolated live snapshots by adding bounded historical comparison and cross-domain correlation while preserving the existing evidence-first, tenant-scoped, human-controlled architecture.

Target reasoning loop:

`live operating pressure + recent history + team capacity + acquisition/SEO evidence + system health → correlated operating situations → role-aware priority → Claude synthesis → human action → outcome learning`

No autonomous customer, financial, campaign, automation, or website action is introduced.

## Implemented

### 1. Broader tenant-scoped context

`lib/intelligence/system-intelligence-context.ts` now loads additional server-resolved evidence for the current authenticated tenant:

- active admissions team members from `v_admissions_team_members`
- owner assignment and next-24-hour follow-up fields from `v_admissions_owner_lead_signals`
- 14-day lead creation history
- 14-day Google Search Console daily history from `gsc_daily`
- Meta campaign + CRM 30-day evidence from `v_meta_ads_campaign_crm_30d`
- Google Ads campaign + CRM 30-day evidence from `v_google_ads_campaign_crm_30d`

Optional-source failures are appended to `degradedSources`; failed evidence is not silently treated as healthy data.

### 2. Historical windows

The context now derives:

- latest 7d new leads vs preceding 7d
- latest 7d organic clicks vs preceding 7d
- latest 7d organic impressions vs preceding 7d

The existing 24-hour / preceding-24-hour message and lead velocity remains available.

These comparisons are descriptive. They do not infer cause.

### 3. System Intelligence v3

Added:

`lib/intelligence/system-intelligence-v3.ts`

V3 builds on v2 and adds the following evidence-grounded situations.

#### Team response-capacity pressure

When reply/overdue-follow-up work is materially concentrated relative to the active admissions team, the system can surface a workload-pressure signal. It explicitly avoids treating the signal as individual performance scoring.

#### Demand acceleration × response capacity

When inbound messages accelerate while an existing reply queue is already materially loaded, v3 merges the overlapping symptoms into a single cross-domain operating situation instead of showing duplicate velocity/reply cards.

#### Weekly lead creation trend

A bounded 7-day vs preceding-7-day comparison can surface material acquisition growth or decline when minimum-volume and minimum-change floors are met.

#### Organic search trend

Search Console clicks and impressions are compared across the same bounded weekly windows. The signal reports observed click/impression movement without inventing ranking causes.

#### Paid-media spend with zero CRM-attributed leads

Campaign evidence can flag paid campaigns that report spend while CRM-attributed lead count is zero. The signal deliberately treats the condition as either conversion weakness, attribution loss, or both until stronger evidence resolves the cause.

#### Cross-domain acquisition softness

When both lead creation and organic clicks decline materially in the same comparison window, v3 can merge them into a higher-priority acquisition-softness situation while explicitly stating that correlation does not establish that organic search caused the lead decline.

### 4. API, Claude synthesis and UI moved to v3

Updated:

- `GET /api/intelligence/v1` → returns `version: 3`
- `POST /api/intelligence/v1/synthesis` → Claude is grounded on the v3 deterministic brief
- `/intelligence` → renders v3
- recommendation impression/feedback route → resolves current v3 signals and records `source_version: v3`

Existing outcome-learning and bounded calibration plumbing remains intact.

### 5. Safety posture

Unchanged:

- PostgreSQL remains source of truth
- client organization IDs are not authoritative
- tenant context is server resolved
- Claude remains synthesis/reasoning, not evidence authority
- correlation is not presented as causation
- autonomous customer messaging remains OFF
- automatic campaign changes remain OFF
- automatic website publishing remains OFF
- paid ranking provider remains deferred
- production semantic/vector indexing remains OFF

## Production evidence sanity check

A read-only production query was used to confirm that real historical evidence exists for Yogakulam without inserting synthetic data.

Observed at checkpoint time:

- active admissions team members: `1`
- latest 7d GSC clicks: `149`
- preceding 7d GSC clicks: `192`
- latest 7d Meta spend: `0`
- preceding 7d Meta spend: `0`
- latest 7d Google Ads spend: `0`
- preceding 7d Google Ads spend: `17.42`

These values are only a checkpoint sanity check; they are not hard-coded into v3 and must not be treated as permanent business facts.

## Preview build verification

Vercel deployment:

- deployment: `dpl_5YoiqEKePfCHfAixXKKWSVQt2NN8`
- URL: `salsys-6nhqo8q7s-salsysos.vercel.app`
- branch: `feature/system-intelligence-v3`
- code commit tested: `f0ba5e92650189dd721b8c7d9c77bb16a41529e4`
- Next.js: `15.5.26`
- compile: `Compiled successfully in 10.3s`
- lint/type validation stage completed
- static generation: `38/38`
- deployment state: `READY`

Unauthenticated access to `/api/intelligence/v1` was routed to the SalsysOS sign-in boundary with `next=/api/intelligence/v1`, confirming that the v3 intelligence surface is not publicly exposed.

## Runtime limitation

The build and authentication boundary are verified. A full authenticated browser-session render of the v3 brief has not yet been directly observed in this checkpoint, so do not claim authenticated v3 E2E runtime verification yet.

## Next checkpoint

Recommended next milestone:

**Semantic / hybrid retrieval v1**

Reason: lexical OpenSearch has already passed real tenant-safe E2E verification, while semantic/vector production retrieval remains one of the largest unfinished intelligence foundations. The next controlled checkpoint should inspect the existing semantic outbox/index code, migrate the remaining semantic path to the verified signed OpenSearch transport, and run a bounded tenant-safe preview pilot before enabling anything broadly.
