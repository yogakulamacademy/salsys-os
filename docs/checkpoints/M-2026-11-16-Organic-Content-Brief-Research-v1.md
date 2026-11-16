# Organic Intelligence — Content Brief Research v1

Date: 2026-11-16
State: draft engineering change for independent review. No production merge.

## Intent

Advance the merged Organic Intelligence workspace from a navigation-only Content Brief
card to a useful **read-only research worksheet** using existing authenticated
SalsysOS content-gap and Search Console data. This is not Claude-generated copy.

## Surfaces

- `/seo/intelligence/content-brief`
- Existing Content Brief card in `/seo/intelligence` links to this route.
- Server-rendered, accessible topic selection through `?topic=<bounded id>`.
- Show content-gap type, observed GSC clicks/impressions, page coverage counts,
  top observed queries (max 8), source date and model-supplied recommendation
  when safe to display.
- Desktop/mobile SalsysOS theme; local-only copy action with explicit feedback.

## Safety / accuracy

- Require privileged active-workspace authentication **before** reading
  `getSeoWorkspace()`.
- Select topic **only** from currently loaded tenant-scoped data; no arbitrary
  `topic` parameter can force another tenant's query.
- Filter contact-like search query strings through the existing safeOrganicQuery
  helper; bound to 40 eligible topics and 8 displayed queries per topic.
- Missing metrics display '—' instead of fabricated zero.
- Do not infer SERP rankings, source completeness, date-window alignment, new
  competitive evidence, generated prose, or content publication.
- Clipboard action happens only on explicit user click and does not call a
  provider or write a record. No API endpoint, new table, scheduler, credentials
  or paid vendor calls.
- Both Organic Growth pilot and Claude bridge env flags remain OFF; no staging
  hold changes. The independent activation gates are tracked in issue #720.

## Verification/acceptance

- [ ] Current-head CI (incl. isolated DB fixtures, readiness suite, typecheck,
      app build, synthetic UI loopback).
- [ ] Current-head CodeQL.
- [ ] Independent review for tenant/role behavior, copy limits, UI accuracy.
- [ ] Authorized owner/admin/manager browser acceptance on mobile/desktop.
- [ ] Separate approval to merge into `main`; merge is not AI activation.

## Existing production issue outside scope

The existing R10 /api/intelligence/recommendations/present statement timeout
is tracked in #618. The observed 2026-11-16 runtime error entries are
unrelated to the Organic Intelligence page. No R10 query or DB timeout
setting was changed by this work.
