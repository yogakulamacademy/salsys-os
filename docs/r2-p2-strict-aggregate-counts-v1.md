# R2-P2 — Null aggregate counts must fail closed

## Finding

The server-side parsers for Marketing → Behavior's ordered funnel, Event activity trends and Events by Page used `Number(value)` on untrusted RPC response fields. JavaScript converts `null`, `false` and empty strings to zero. A malformed but `status.available=true` database response could therefore be displayed as **measured zero activity** rather than the appropriate report-unavailable state. This is a robustness/data-quality defect, not evidence that such a response has been returned for a real tenant.

## Change and tests

- New `safeBehaviorCount` preserves genuinely observed nonnegative safe integers and decimal-string bigint values, but rejects missing, null, boolean, empty, decimal, exponent and unsafe integer forms.
- Funnel and path counts, including the path-session denominator, now fail closed on malformed values. Ordered funnel steps are checked against the requested names, count order, scope and bounded output; unexpected sensitive paths are still suppressed by the existing safe-path guard.
- Event trends and page breakdown reuse the same strict count boundary, leaving valid report/window semantics untouched.
- Three loopback-only synthetic RPC scenarios inject a null count into only one independent panel at a time. Playwright checks the affected panel shows its generic unavailable state, while the remaining two still show safe synthetic tenant-scoped data.
- A Node unit test evaluates the real TypeScript count parser and tests valid and invalid values, including 0, null, booleans and numbers beyond `Number.MAX_SAFE_INTEGER`.

## Release and acceptance limits

This release makes **no SQL, RLS, consent, source or collector changes**, needs no staging resources or billable services, and changes no original event records, customer data, lead routes or payments. It corrects presentation of **malformed response counts**, not authentic live role/tenant acceptance. Require exact-head full CI and CodeQL before merging; verify matching READY production deployment and runtime errors afterwards.

Issue #523 remains OPEN for real owner/admin authenticated UI checks and per-tenant report reconciliation. Issue #520 optional website collector stays OFF, and PRs #530 and #535 remain draft and unmerged pending real-site consent/privacy and retention evidence.
