# Marketing & Attribution final closeout

This closeout preserves canonical attribution semantics while hardening exact investigation scope and paid-media evidence freshness.

## Attribution scope correctness

A selected First Touch, Current Channel, Lead Creation, or Last Marketing Touch row is explicit evidence. `DecisionMetricLink` now removes any fuzzy Marketing finder `q` when one of those concrete attribution dimensions is handed downstream, preventing exact cohorts from being silently narrowed by unrelated search text.

Existing exact destination infrastructure remains canonical:
- First Touch → native source scope.
- Lead Creation → native creation-channel scope.
- Last Marketing Touch → native last-touch-source scope.
- Current Channel → native current-channel scope.
- Unknown remains unknown and is never converted into a filter.

## Paid-media evidence health

The public `get_campaigns_workspace` RPC now gates relevant paid-media evidence before delegating to the optimized internal read model.

- Google Ads and Meta Ads sync-health rows are checked independently.
- A non-successful relevant provider sync fails the primary evidence path.
- A successful provider sync older than 72 hours is treated as stale.
- The existing application fallback can still show cached evidence, but only with its directional-warning state.
- The optimized implementation is internal-only; anonymous and normal authenticated users cannot call it directly.

## Live production audit at closeout

- GA4: fresh; latest analytics date 2026-10-30 and successful sync on 2026-10-31.
- Attribution coverage across 563 Yogakulam leads: First Touch 100%, Lead Creation 100%, Current Channel 100%, Last Marketing Touch 95.9%.
- Google Ads: provider sync currently blocked by Google Cloud production-access approval; the system now refuses to treat cached paid-media evidence as current.
- Meta Ads: last successful sync is stale; the system now refuses to treat it as current.

Provider recovery is operational work outside this closeout. No provider data is fabricated, no attribution model is substituted for another, and no ad-activation transport is changed.
