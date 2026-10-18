# SalsysOS — System Intelligence Core v1

**Date:** 2026-10-18  
**Branch:** `feature/system-intelligence-core-v1`  
**Base:** `0d0b17c15458f1223604aa1e365cd36be7033c42`

## Goal

Move SalsysOS from a collection of static dashboards toward an adaptive operating system that continuously answers:

> What deserves attention now, why, and what should the team do next?

This checkpoint implements the first shared, read-only intelligence contract. It follows the existing North Star and Behavioral Intelligence roadmap rather than creating a parallel AI system.

## Architecture

The v1 loop is:

`live tenant evidence → deterministic signals → priority score → ranked operating brief → recommended next move → human action`

This is intentionally evidence-first. Claude can later synthesize/explain these signals, but model output is not allowed to replace observed facts.

## Implemented

### Shared intelligence contract

`lib/intelligence/system-intelligence.ts`

Builds a tenant-scoped operating brief from the existing dashboard snapshot, including evidence from:

- conversation reply pressure
- response-time pressure
- first-touch backlog
- due follow-ups
- high-intent pipeline
- payment-pending pipeline
- outstanding revenue
- batch/capacity demand
- acquisition quality
- opportunity-value data quality

Each signal contains:

- stable ID
- category
- severity/tone
- bounded 0–100 priority score
- title
- reason
- recommended next move
- key metric
- deep link
- supporting evidence

Signals are sorted dynamically from current evidence rather than rendered in a fixed priority order.

### Intelligence workspace

`app/intelligence/page.tsx`

Adds a dedicated operating-intelligence workspace with:

- dynamic system state
- current top priority headline
- attention score
- ranked priority cards
- evidence chips
- recommended next move
- human-control messaging

### Reusable UI

`components/system-intelligence-brief.tsx`

Provides the visual operating brief for reuse in Dashboard, executive workspace, role-specific workspaces and future command-center surfaces.

### Tenant-safe API

`GET /api/intelligence/v1`

- derives the tenant through the existing authenticated dashboard path
- accepts no client organization ID
- returns `private, no-store`
- exposes no autonomous action endpoint

## Real Yogakulam evidence check

The production dashboard snapshot was read directly for `yogakulam-academy` after implementation. At that point it contained live signals including:

- 25 conversations needing replies
- 25 conversations waiting over one hour
- 1 lead needing first touch
- 3 high-intent leads
- 26 open leads without value data
- revenue evidence in INR and USD

This confirms the new intelligence contract has non-static evidence to rank. The snapshot itself remains PostgreSQL truth; the intelligence layer is derived.

## Build verification

Vercel Preview deployment:

- deployment: `dpl_GRGpQz5jYTgjDaT4ZoLKhN5kWwbn`
- branch: `feature/system-intelligence-core-v1`
- commit: `f31dce4107de6ef02d4cab09c9634b4c5ecbcdc7`
- Next.js: 15.5.26
- compile: passed (`Compiled successfully in 21.6s`)
- lint/type validation: reached and passed build pipeline
- deployment state: READY

## Safety posture

- read-only intelligence only
- no customer message send
- no website publish
- no payment action
- no workflow activation
- no client-supplied tenant authority
- deterministic facts remain separate from future Claude synthesis
- human action/approval remains the control boundary

## Next checkpoint

**System Intelligence Core v2 — multi-domain evidence + adaptive role briefs**

Planned additions:

1. behavioral acceleration / reactivation signals
2. SEO Decision Intelligence signals
3. team capacity / ownership pressure
4. system/integration health
5. signal freshness and decay
6. dedupe/correlation across overlapping signals
7. role-aware priority views (owner, manager, admissions)
8. Claude synthesis over the bounded signal contract
9. persistent recommendation/outcome feedback so ranking can learn from real results

Sensitive actions remain staged/human-approved; intelligence does not become silent autonomous execution.
