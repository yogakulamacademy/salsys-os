# Phase C5 — Controlled AI Lead Intelligence pilot: operational release gates

## Scope shipped here

This milestone provides a **read-only** tenant-scoped owner/admin operations
view at `/settings/ai-insights` and a link from Settings → Security &
Governance. It shows:

- Server configuration readiness without exposing key values.
- Whether the active tenant has opted into the existing AI quota policy.
- Organization-level daily reserved attempts and configured limits.
- Seven-day receipt and review counts.
- Cohort-matched review coverage, or unavailable when counts are zero or
  the maximum 500-record read cannot represent the full sample.
- Qualitative staff review counts and uncertainty warnings.
- A dry-run 90-day record-age indicator for receipts and quota counters.

No environment variable is changed by the UI. No tenant is opted in. No
customer messages, prompt text, model prose, evidence hashes, keys, reviewer
IDs, or lead identifiers are returned to this page.

## Access and data handling

Both workspace role and live organization membership must authorize an
owner/admin before the server creates a service-role database client. All
privileged reads repeat `organization_id = activeOrganizationId`.
Non-admins and unauthenticated users get no data or navigation link. A
failed privileged read raises a safe generic error instead of displaying
false zero activity.

The quality indicator is **not model accuracy**: it is voluntary staff
assessment. Review coverage counts distinct generated run IDs in the
recent seven-day cohort that also received review. Samples above the
500-row bounded query become "not measurable," not a guessed percentage.

## Before any live pilot (human release checklist)

1. Agree on the CRM organization's data-processing purpose, provider
   disclosure/consent terms, country handling, and policies for private
   notes. The existing `AI_LEAD_INSIGHTS_INCLUDE_PRIVATE_NOTES` switch
   must remain absent unless that separate processing is approved.
2. Decide a documented, lawful retention schedule for insight receipt
   metadata, review records, and quota counters. The operations page
   proposes **90 days for review only**, not a deletion policy.
   Implement approved cleanup and verify deletion propagation before
   scale-up. No automated cleanup is enabled by this milestone.
3. Verify a production account owner/administrator can view the operations
   page; an admissions/viewer account cannot open it.
4. Validate at least one consent-compatible synthetic or separately
   authorized real test conversation. The C2 validator checks that references
   exist and belong to the lead — **it does not verify whether the cited
   message semantically proves a claim**.
5. Confirm feedback labels and issue codes with staff. Evaluate confidence
   and unsupported-claim rates using an agreed reviewer rubric; do not infer
   payment likelihood, conversion improvement, or uplift from review votes.
6. Set concrete Anthropic usage budgets/alerts with provider-side
   observability. Per-user and daily quotas count attempts, not model tokens,
   real costs, or billing events. Do not equate quotas to a spending cap.
7. Configure a 32+ character server-only
   `AI_LEAD_INSIGHTS_CONTEXT_HMAC_KEY` for C3 receipt signing.
8. Only after explicit sign-off: populate the tenant's
   `ai_lead_insight_tenant_policies` row and enable the relevant
   server-only Vercel flags. Choose pilot limits below the schema maximums
   rather than assuming defaults fit every tenant.
9. Perform owner/admin plus admissions-user smoke tests and review the
   operations page for real quota usage, receipt generation, and staff
   feedback. Test an unauthorized account, empty lead, and model failure.
10. Provide an immediate rollback procedure: turn off
   `AI_LEAD_INSIGHTS_ENABLED` and `AI_LEAD_INSIGHTS_UI_ENABLED`, then
   disable the tenant policy. Avoid deleting historical ledgers during
   rollback.

## Acceptance gates for this pull request

- [ ] Tenant-bound owner/admin-only read authorization.
- [ ] Live membership checked before service-role reads.
- [ ] No raw CRM messages, notes, model output or secrets in operations UI.
- [ ] Cohort coverage is not inflated by duplicate staff reviews.
- [ ] Missing data and database errors never turn into a misleading green.
- [ ] No SQL migrations, production flags, pilot opt-ins, model calls or
  record deletion added by this milestone.
- [ ] TypeScript, readiness suite, build, browser QA and CodeQL pass.

## Remaining to activate Phase C5

The operations view is a prerequisite, **not release approval**.
Production pilot activation remains pending consent/privacy sign-off,
retention governance, cost alerts, live response quality checks,
role-based smoke tests and explicit operator approval.

OpenSearch is intentionally out of scope; the current source of truth
remains Supabase with Claude as the interpretation layer.
