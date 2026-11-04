# Phase C / C3 — Human Insight Feedback and Quality Evaluation

## Delivery

C3 builds a private provenance ledger and voluntary human feedback for the
C2 staff-only Claude insights. It is NOT a new model, does NOT train a model,
and does NOT perform automated sales actions.

- `ai_lead_insight_runs` — one metadata-only receipt for a generated insight.
- `ai_lead_insight_reviews` — one append-only review per reviewer and run.
- `recordLeadInsightRun` — records a receipt only after C2 completes its
  model validation AND the second user/lead permission check.
- `submitLeadInsightFeedbackAction` — a server action that validates the
  current user's active tenant, verifies permission to the linked lead, and
  records only the rating and issue codes.
- `summarizeInsightReviews` — pure statistical summary for later admin UI;
  never presents voluntary staff ratings as validated accuracy or uplift.

## Ratings

Accurate, Partially accurate, Inaccurate, Unsure.

Issue codes: unsupported_claim, wrong_intent, wrong_objection,
wrong_next_action, missing_context, outdated_context, privacy_concern,
other. Accurate reviews cannot carry error codes; Inaccurate requires
at least one reason. Duplicate reviewer/run writes fail closed.

## Evidence and privacy

Receipts store only tenant/lead ID, model name, staff ID, observed
intent/next-action categories, evidence reference IDs and a keyed
SHA-256 digest. No AI-generated prose, prompt, conversation body, notes,
email address, phone, provider token or raw customer payment data is saved.
The digest is sensitive internal metadata and cannot be exposed publicly.

The database enforces tenant/lead/run composite foreign keys, RLS
and explicit revocation of anon/authenticated table access. All access
uses a server-only service-role client after independent workspace,
membership and lead authorization. There are no public read policies.
Reviews are immutable; a corrected evaluation needs a new generated run.

Deleting the underlying lead cascades to the receipts and reviews.
Define an approved retention period and deletion/export policy before
production activation, including the treatment of staff reviewer IDs.

## Flags (both default OFF)

- `AI_LEAD_INSIGHTS_ENABLED=true` — existing C2 generation flag.
- `AI_LEAD_INSIGHTS_FEEDBACK_ENABLED=true` — C3 receipt + feedback gate.
- `AI_LEAD_INSIGHTS_CONTEXT_HMAC_KEY` — a unique strong server-side
  secret (minimum 32 characters) to protect source digests when feedback
  capture is enabled. Never place it in source control or NEXT_PUBLIC_*.

When the C3 flag is OFF, C2 remains read-only and no ledger rows are
created. When ON, a receipt failure prevents an orphaned result from being
returned. Do not enable either flag until the migration is deployed, privacy
review is complete, rate limiting and budget controls exist, and the C4
staff-only UI is tested.

## Review acceptance gates

1. Tenant and lead access verified before every privileged read/write.
2. Foreign-tenant or revoked-access reviews fail with uniform errors.
3. Invalid/duplicate ratings and reason codes fail before database use.
4. Receipt metadata contains zero raw source/model prose.
5. Unique reviewer/run prevents overwrites and race duplicates.
6. Migrations replay cleanly with RLS, service-role-only grants and
   composite tenant-safe foreign keys.
7. Synthetic tests cover permitted, denied, stale and duplicate behavior.
8. No automatic message send, enrollment, payment, lead-stage update or
   automated model retraining is wired.

## Next: C4

Design and implement a compact Lead Intelligence panel in Customer 360
and Inbox, with an explicit Generate control and staff rating buttons.
Build per-user generation limits, tenant opt-in, evidence navigation,
minimal output retention, safe error states, monitoring and admin quality
report before enabling production flags.
