# Home Command Center reference update

This is an additive Home/UI update. Preserve the product positioning, existing information architecture and the established Journey/growth-before-R13 roadmap. Approved AI Knowledge, business-content governance, Sales Assets and controlled WhatsApp/Instagram assistance remain critical work; this update does not enable autonomous outreach.

## Implemented

- Reference-inspired light/violet dashboard, five KPI cards, cohort funnel, conversation/reply area chart, current task queue, source donut, course-interest bars, CRM insights and honest system-status links.
- Existing section navigation stays intact. Home expands the existing navigation; other pages keep their current behavior. Mobile navigation and the shared dark theme remain supported.
- Shared period presets: 7D, 30D, 90D, YTD, today, yesterday, this month, last month and custom UTC ranges capped at 366 days. Invalid, inverted and wholly future ranges safely fall back.
- Session-bound reporting with organization filters, RLS and exact-count pagination. A capped, duplicate, inconsistent, failed or incomplete read becomes unavailable rather than a partial-looking total. The ceiling is 10,000 records per evidence stream and 20 read pages.
- Cohort progression uses recorded stage history before each period cutoff. Higher reached stages imply preceding steps. Closed-won is included in the funnel's won group, while the Enrolled leads KPI counts only unique recorded enrolled-stage transitions. Operational Enrollment records remain separate.
- Unique active conversations and outbound human reply messages have separate definitions. Failed/queued sends are excluded. Legends toggle series, hover shows daily values, and the accessible daily table supports keyboard drill-downs.
- KPI, source, course and daily activity drill-downs open a paginated Home evidence inspector preserving dates and currency. The inspector shows the actual supporting records, rather than passing ignored date parameters to existing workspace routes. Individual records link to their existing lead or inbox destination.
- Net collected is paid receipts less recorded refunds by paid_at, with separate currencies. No conversion or cross-currency sum is inferred.
- Current tasks retain their existing completion command and lead links. Completion follows the existing Tasks & Follow-ups flow. Aggregate attention links are not fake completion checkboxes. The current queue is explicitly independent of reporting dates.
- Manual refresh keeps the current reporting window. Recommended actions and workspace setup remain available in expandable sections beneath the main dashboard.
- The shared command palette now searches permitted lead names, linked active contacts, related conversations/tasks, course names and campaign names. Results are bounded, session/organization scoped and not publicly cached. Admissions users do not query privileged contact/course/campaign streams. This is name search, not full-text, email/telephone or message-body search.
- The New menu exposes supported lead creation and links to the existing conversation/task workflows. It does not invent independent contact creation or provider-owned campaign creation.

## Deliberate limits and next work

| Brief area | Current state | Remaining work |
| --- | --- | --- |
| Campaign performance on Home | One relevant CTA to the existing verified campaign workspace | Add a reviewed period-aware campaign adapter; only show metrics actually supported by each provider. Email opens/clicks are not fabricated. |
| Notification bell | Existing attention-workspace links retained | Persisted unread alerts, assignment events, counts and read state require a separate alert feature. |
| Account menu | Existing Settings, appearance and logout controls retained | Dedicated profile and expanded team/account flows are separate product work. |
| Role-specific Home | Existing owner/admin/manager access guard preserved | Admissions users retain their existing personal dashboard. This change does not broaden Home/finance access. |
| Catalog adaptation | Current education course-interest presentation retained | Capability-aware product/service labels and generic catalog adapters belong to the subsequent SaaS work. |
| Course interest over time | Current recorded choice among leads created in period | Historical interest changes require their own event history. |
| Insights | Explainable rules based on displayed evidence | Predictive or LLM-backed recommendations require separate validation and governance. |
| Health | Reporting availability plus explicit review links | Provider/runtime health needs canonical service checks; no unsupported green operational status. |
| Search | Bounded name matches and related records | Search ranking, email/telephone handling, larger-result pagination and indexed search are future work. |
| Historical consistency | Period-cutoff stage evidence and equal-length comparison | Multiple reporting reads are not one atomic database snapshot; equal-count concurrent edits can still change coverage. |
| Scale | Capped exact reads, graceful unavailable state | A dedicated aggregate read model is preferable for tenants exceeding the bounded read ceiling. |

## Validation boundary

Local synthetic tests validate projection arithmetic, date selection, count/record consistency, read failure behavior, search authorization/scoping and browser interactions. They do not establish deployed schema compatibility, production RLS behavior, live provider health, operational enrollment truth or end-to-end financial ingestion. A passing release build and a representative live-data review remain release gates.

The visual preview uses explicitly labelled synthetic evidence. Demo activity, course choices and receipts are not customer records and are not the complete GT-01 acceptance replay.
