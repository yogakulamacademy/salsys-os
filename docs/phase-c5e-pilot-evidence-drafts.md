# C5e — Owner-only AI pilot evidence draft packet

## Why this exists

C5d's database approval gate is intentionally default-deny and accepts
only real, attributable human signoffs. Before an owner can reasonably
sign off, they need a private place to gather the **identifiers** of the
underlying privacy, retention, spending and quality review documents.

C5e adds an owner-only preparation page at
`/settings/ai-insights/evidence`, reachable from the C5 monitoring page
only for a fresh, active organization owner.

## The form is a draft, NOT an approval

- Accepts only compact evidence reference IDs (8–100 characters,
  uppercase letters/digits/hyphens/underscores).
- Rejects emails, free-text content, URLs, pasted messages, secrets and
  full documents; reference documents must stay in an approved secure store.
- Any of the four fields may be empty. Saving an all-empty snapshot is
  an intentional reset of the *latest draft*, not deletion of history.
- Each save appends one immutable snapshot with organization and actor ID.
- No update/delete grants on the table; historical snapshots are preserved.
- No mutation to `ai_lead_insight_pilot_approvals`, tenant policy, quota
  counters, feature flags, CRM data, or provider requests.

Only the owner can read/write drafts. The server checks the authenticated
user, active workspace, fresh membership role and tenant before creating
a service-role database client. The client cannot choose a tenant.

This is an evidence *preparation* workflow, not a document verification or
approval workflow. A recorded reference ID does not prove that any
review actually passed.

## Release steps

1. Run TypeScript, readiness suite, build/browser CI and CodeQL.
2. Replay the new migration on a clean Supabase database.
3. Apply the migration before deploying code that reads/writes the table.
4. Verify forced RLS, no `anon`/`authenticated` privileges, and only
   `SELECT, INSERT` for the service role.
5. Confirm a signed-in owner sees the draft form and other roles cannot
   access it, including changing active organization.
6. Verify the first saved draft is append-only and no AI approval record
   appears as a side effect.
7. Keep all production `AI_LEAD_INSIGHTS_*` flags OFF.

## Remaining after this milestone

- Authorized people must independently review and approve the underlying
  privacy purpose/consent, retention/deletion rules, provider-side budget
  limits, and factual quality checks.
- Any eventual explicit approval-write workflow must be audited,
  confirm individual signoffs, handle revocation, and never auto-approve
  based on draft completeness.
- Live Claude testing on permitted data cannot begin until the relevant
  operational gates have legitimately passed.
- OpenSearch remains deferred.
