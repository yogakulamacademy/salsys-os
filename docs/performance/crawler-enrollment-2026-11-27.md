# Crawler batching and on-demand enrollment choices

## Result

The crawler records unique destination pages and crawl-queue targets in batches of 200 instead of writing them separately for every anchor. Distinct link evidence (anchor, rel, external links and image/link attributes) remains intact.

The enrollment summary no longer loads the full recording catalog on every conversation refresh. With no existing enrollment it performs zero course/batch reads. Existing enrollments fetch only their referenced course and batch IDs, including historical records. The full form choices load once when the operator opens Mark enrolled, and reload on the next open. Loading/error/Retry states keep saving disabled until choices are available.

## Evidence and limits

- A counting fixture with 400 link records to 200 distinct internal destinations performs **2 discovery writes instead of up to 800**. This measures the target/frontier portion, not all crawler writes or production-wide traffic.
- A 451-destination fixture uses 6 bounded writes; retries preserve existing page identity and queue state. Missing IDs and partial write failures fail explicitly.
- The actual crawler entrypoint fixture retains distinct anchors/nofollow/external evidence and marks the current page failed when target persistence fails. Membership denial returns 403 without writes.
- The summary fixture reads no catalog for a lead without enrollments. The existing-record fixture requests only referenced IDs and preserves old course/batch labels and exact paid/pending amounts.
- Catalog endpoint fixtures verify invalid ID, unauthenticated, unauthorized and unavailable results (400/401/403/503), private no-store responses, tenant filters and owner/admin access. No service client is used for enrollment reads.
- Browser checks of the actual enrollment component with local simulated reads confirmed zero requests on mount, one on opening, loading/disabled save, existing error toast, keyboard Retry, successful retry, and cancellation. At 390px viewport, document width was 380px with no horizontal overflow. No enrollment/payment submit was performed.
- Fourteen new behavior tests pass; all 632 readiness tests pass. Deno 2.5.6 checks the actual crawler entrypoint with a frozen dependency lock. The Next production build result is recorded in the PR when complete.

No new production latency or cost percentage is claimed. The previous 1.4s figure was a cumulative mean for the broad batch query; this change removes that query from ordinary refreshes and runs it only when form choices are needed. It does not prove the query itself became faster.

## Source provenance and runtime checks

Production project: `doaozrkrtgeslddwhclj`, function `seo-crawler`. Baseline read on 27 November 2026: deployment version 4, bundle SHA-256 `756aed995413261c694b2332bf60e550691c1fd3fee234dcf7e1949b4241ef98`, response version 1.3. Commit `ab00d82` tracks that exact deployed source before optimization, so its follow-up commit is reviewable against the live implementation.

The optimized entrypoint returns response version 1.4. JSR imports are pinned and transitive dependencies locked. Next's tsconfig excludes `supabase/functions` because these files use the Deno runtime; CI checks them separately with:

```text
npm exec --yes --package=deno@2.5.6 -- deno check --frozen --config supabase/functions/seo-crawler/deno.json supabase/functions/seo-crawler/index.ts
```

Production unique-index metadata confirmed the existing `(organization_id,site_id,normalized_url)` page conflict key and `(crawl_run_id,normalized_url)` frontier conflict key. No schema change or new index is required. The shared discovery timestamp and stable destination ordering apply within one page's discovered targets; no global data/permission cache was added.

## Review and rollout

This branch is based directly on CRM main `9b644ab`, independently of PR #913. It has not been merged or deployed. Production data, provider sends, registration gates, schedules and function settings are unchanged. The temporary local sample page and shell exception were removed before the production build.

After production approval, release the Next application for the enrollment endpoint/UI and deploy **only** the `seo-crawler` Edge Function with `index.ts`, `target-writes.ts`, `deno.json` and `deno.lock`. Preserve `verify_jwt: true` and the existing function secrets/settings. Neither release depends on a database migration or the other release. Re-read the current function version/hash before replacing it to detect intervening changes.

Verify the enrollment flow with a consenting test operator and compare database requests per opened conversation/form. Verify the crawler using an approved test site/run, comparing distinct destination counts, link evidence, per-page writes and failures. Do not start a customer crawl or submit an enrollment/payment merely for a release smoke test without authorization.

Rollback the Next application to its prior healthy deployment if needed. The original Edge Function source is available in baseline commit `ab00d82`; redeploy it with the same JWT setting for a crawler rollback.

## Remaining boundaries

The crawler's existing per-page count queries, claim concurrency and delete/insert link replacement are unchanged. This is not a transaction covering the entire crawl. Successful target chunks may exist after a later chunk fails; replaying the helper is idempotent under the existing conflict keys. Existing failed-page retry behavior is unchanged. A separate queue/transaction redesign would need its own concurrency tests.

The enrollment summary's referenced-label reads still use RLS. Form catalog access reauthenticates and checks the lead's owner/admin permission. Mutation actions and authoritative enrollment/payment RPCs remain unchanged; hiding or enabling a client control does not grant permission.
