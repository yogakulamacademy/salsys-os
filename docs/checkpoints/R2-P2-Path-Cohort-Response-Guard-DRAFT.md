# R2-P2 Behavior Explorer navigation cohort response guard (DRAFT)

**Status: draft, unmerged and not deployed.** No customer tracking, database, consent, payment or website behavior changes.

## Production baseline verified (2026-11-07)

A SELECT-only read of the currently deployed `public.get_native_behavior_workspace_v1(uuid, integer, text[])` function confirmed all of the following without retrieving organization, visitor or session IDs or actual paths:

- `having count(distinct (tracking_source_id, anonymous_visitor_id)) >= 3` for displayed navigation edges.
- Session totals independently aggregate source-scoped visitor-session identities.
- `path_min_visitors = 3`, maximum 12 navigation edges, and an organization-membership guard.

The older initial migration's three-*session* threshold was superseded by `20261105171000_r2_p2_public_page_paths_v2.sql`. **No current production visitor-threshold defect was found.**

## Narrow server-side defense in depth

The database continues to own the **actual distinct-visitor privacy threshold**. This draft strengthens `lib/native-behavior-data.ts` only, before a successful RPC body becomes user-visible:

1. Assert `status.path_min_sessions === 3` alongside the already-checked `path_min_visitors === 3`.
2. Reject the entire navigation/funnel RPC result as **unavailable** if any otherwise public-looking edge claims fewer than three distinct source-scoped sessions. An edge with three distinct visitors must necessarily have at least three distinct visitor-session keys, so a two-session edge is logically incompatible with the server's promised visitor threshold.
3. Continue filtering unsafe/private paths and preserving independent Event Activity and Events by Page results. Do not reinterpret inconsistent aggregates as genuine zero traffic.

**Important limitation:** three sessions do **not** prove three distinct visitors (one visitor can open multiple sessions). The actual distinct-visitor test remains in the deployed SQL; the additional server check can detect some impossible data but is not a substitute for the SQL authorization or privacy guard.

## Synthetic browser regression

`tests/ui/fixture-server.mjs` supplies two entirely synthetic, local-only inconsistent RPC cases:

- `malformed-path-low-session`: a syntactically safe edge claims two sessions against a three-visitor policy.
- `malformed-path-minimum`: the response metadata incorrectly claims that one session suffices.

`tests/ui/behavior-explorer.spec.ts` asserts that both cases show **Behavior analytics unavailable** (no leaked path and no fabricated empty-traffic summary), that independent trend/page-breakdown panels remain visible, and that all three requests remain scoped to the synthetic tenant. The fixture state is reset after testing.

## Release gates

Require exact-head CI and CodeQL success, review of this narrow code change, and explicit approval before merging. This draft alone does not pass Issue #523: real owner/admin authenticated tenant switch/denial, mobile/keyboard acceptance and actual displayed-route privacy review are still open. Do not enable the R2-P1 optional collector, alter production SQL/RLS or deploy any code on the basis of synthetic regression evidence.
