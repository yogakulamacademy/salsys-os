# SalsysOS database request audit — 27 November 2026

## Scope and evidence

Read-only production inspection plus source review of CRM main `9b644ab7c235d1f2df209fb8c39f22fb36a2c62c`. Collected around 12:06–12:12 IST. Traffic figures are separate rolling 24-hour log snapshots, so their exact endpoints differ slightly. Query timing statistics are cumulative since **25 November 2026, 11:32:12 UTC**, not 24-hour figures. No customer rows, tokens, message bodies or credentials were exported. Production data, cron schedules and permissions were not changed.

The machine-readable companion contains normalized query patterns, request counts and cron names. Request counts are HTTP calls to Supabase, not unique business events or proof that every call is unnecessary. Logs do not establish exact duplicate request counts without caller correlation.

## Findings in priority order

| Priority | Process | Evidence | Reduction approach | Current decision |
|---|---|---|---|---|
| 1 | SEO crawler link discovery | 36,625 `seo_pages` POSTs and 25,385 `seo_crawl_frontier` POSTs in the traffic snapshot. Client grouping identifies Supabase's Deno Edge runtime. Live `seo-crawler` v4 source confirms two awaited writes per internal link. | Deduplicate destination URLs separately from anchor/rel link records, then batch page upserts and frontier upserts. Preserve all link evidence and existing same-host/depth/asset checks. | Largest confirmed request amplification. Batch work needs isolated crawl fixtures and failure/partial-write checks before release. |
| 2 | Repeated commercial eligibility checks in workers | 29,462 `signup_advanced_operation_allowed_v1` calls in 24h; 29,421 were from Node in a later client-grouped snapshot. | Select due/eligible work first; eliminate repeated preflight lookups within one work unit. Preserve fresh checks immediately before provider sends and paid operations. | High volume is confirmed; not all calls are duplicates. No global eligibility cache or removed access checks. |
| 3 | Worker tenant status checks | 27,390 organization GETs; later client grouping attributes 27,374 to Node and 16 to SSR. | Trace worker call chains and batch candidate reads by organization where safe. Keep current tenant-active checks at write/send boundaries. | Main volume is worker-side, not website navigation. Do not remove tenant isolation to save requests. |
| 4 | Three concurrent shell workspace GETs | `AppShell`, `DesktopHoverSidebarV3`, and `ProductCapabilityNavigationGate` each fetch `/api/workspace` on mount. All mount in `RootShell`. Each endpoint invocation authenticates and reads workspace/capabilities. | Share one in-flight request per mounted shell. Give each caller its own response body; discard the request after settlement. | Implemented in this branch. Three overlapping calls become one; later reads remain fresh. No shared server or cross-session cache. |
| 5 | Hidden-tab alert polling and overlapping slow reads | AI handover polls every 60s; enabled WhatsApp handoff polls every 25s, previously without visibility or in-flight guards. Alert table reads appeared 1,145 times in 24h. | Pause when hidden/offline, avoid overlap, resume when due on visibility/online/focus, stop disabled feeds. | Implemented in this branch. Existing error presentation and acknowledgement writes preserved. |
| 6 | Expensive enrollment batch lookup | 332 calls averaging **1,416ms**, totaling **470,125ms** since stats reset. Query maps to `lib/enrollment-panel-data.ts:31`, loading up to 300 batches for the payment/enrollment panel. | Load the recording catalog when needed; inspect RLS and the organization/start-date access plan, then justify an index if required. Avoid loading all form options on every inbox refresh. | Measured slow path. No index or payment behavior changed without plan evidence. |
| 7 | Inbox full-route refresh | Conversation list RPC: 478 calls averaging **827ms**, cumulative **395,289ms**. `ConversationsRealtime` already limits full refreshes to once per 15s and ignores old imported messages. | Keep local message updates; narrow refreshes to data that changed and load enrollment/intelligence panels on demand. | Existing refresh limits are useful; do not remove incoming-message delivery or assume every focus refresh is redundant. |
| 8 | Scheduler per-workflow queries | `lib/automation/runtime-scheduler.ts` fetches due jobs once for every active workflow on a minutely sweep, including idle workflows. Database has 12 active cron jobs; Vercel has 22 configured jobs. | Start with a bounded due-job query and retain fair ordering, workflow/tenant validation and atomic job claims. Correlate scheduler runs before removing jobs. | A future batching candidate. No proven duplicate scheduler execution; job counts alone do not establish overlap. |

## What the first change saves

- Three overlapping shell GETs become one: **2 of 3 requests removed in that specific concurrent load**, verified by a counting test. This is not a claim of 67% less total database traffic.
- An enabled, idle hidden tab previously scheduled up to **60 AI + 144 WhatsApp alert reads per hour**. The new controller schedules zero while hidden; an already-running request may finish. WhatsApp's disabled feature already stopped polling, so its 144/hour only applies when enabled.
- Slow alert reads cannot stack. Returning to a tab makes at most one due request, even when focus, visibility and online events arrive together.
- All reads remain `no-store`; workspace error status and existing UI fail-closed behavior remain. Writes, permissions, delivery gates, real-time message subscriptions and production cron schedules are unchanged.

## Crawler batching example and safeguards

Live code first deduplicates links by normalized URL **plus anchor plus rel**, then upserts `seo_pages` and frontier individually for every resulting internal link. Distinct anchors pointing to the same page therefore repeat target writes. Link records should retain those distinct anchors, while target page/frontier writes should deduplicate only by their respective existing conflict keys.

For 400 internal link records leading to 200 destinations, the current discovery loop can issue 800 writes. One page batch and one frontier batch could reduce that portion to 2 writes. This is a worked example, **not a measured production saving**. Chunk large sets, preserve tenant/site/run keys, map returned IDs by normalized URL, surface upsert failures and test retries. Crawl queue claims also need separate concurrency review; batching must not introduce double processing.

## Database advisory review

Health advisor returned no findings. Performance advisor reported 309 foreign-key index findings, 297 unused-index findings, 3 RLS init-plan warnings and 2 multiple-permissive-policy warnings. These are diagnostic leads, not an instruction to create/drop hundreds of indexes. A recently reset statistics window is insufficient evidence that an index is unnecessary. No indexes were removed or added.

References: [Supabase performance tuning](https://supabase.com/docs/guides/platform/performance), [foreign-key index findings](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys), [RLS init-plan guidance](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan).

## Validation and rollout

Six new behavior tests cover concurrent shell reads, readable response copies, fresh reads after settlement, isolated shell scopes, network/401 failures, hidden/offline tabs, event bursts, slow requests, disabled feeds, retry cadence and cleanup. Typecheck passed. Full build result and PR checks are recorded in the release handoff after completion.

The first reduction is prepared for review; production traffic has not yet been reduced by this branch. No percentage cost/latency improvement is claimed without comparable post-release measurements. Rollout should compare request counts per active session and worker run, not raw daily totals, because customer/crawl volume changes.
