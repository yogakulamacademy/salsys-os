# KB-04D — Human Review Handoff Contract (DRAFT)

**Date:** 2026-11-06  
**Parent:** Draft PR #565 (KB-04C), stacked on KB-04B #563 and the preceding unmerged KB drafts.  
**Branch:** `feature/kb04d-human-review-handoff-contract`

## Delivery

`prepareSyntheticHumanReviewHandoff` builds a deterministic, read-only review packet from a KB-03E synthetic proposal acceptance packet, KB-04C change-impact report and explicitly supplied review annotations.

- Exactly matches proposed answer citations to changed source quotations by URL, fetched time, snapshot/block/quote hashes, block index and exact quotation. It does **not** infer a link based on similar wording.
- Rejects contradictory organization scopes, malformed UTC dates, invalid quotation hashes, duplicated or unknown annotations, ambiguous quote mappings, malformed review input, and any claim that a source or proposal is approved/published.
- Accepts three **untrusted simulated notes only**: hold for source verification, request manual correction and dismiss unverified proposal. No `approve` or `publish` annotation exists.
- Exposes unresolved changed quotations and proposals awaiting annotation without silently deciding current truth.
- Records `reviewerRoleClaim` and `reviewerIdentifierClaim` as unverified text, **not verified authentication or a real audit event**.
- The exact existing `createKnowledgeDocumentAction` and `approveKnowledgeDocumentAction` entry point names are documented for future design; both are `connected:false` and `invoked:false`.

Admin-only synthetic `/settings/knowledge/evidence-preview` now includes a non-interactive human-review handoff section. No server action, form submission, database write, new approval endpoint or UI action was added.

## CI coverage

`tests/knowledge-extraction/human-review-handoff.test.mjs` verifies denied escalation from annotation to approval; strict tenant boundaries; claimed owner/admin roles not granting permissions; malformed times; tampered source quotes/hashes; contradictory untrusted flags; unknown/duplicate annotations; deterministic no-mutation output.

The existing browser regression file checks the disabled handoff in the administrative preview, the original disabled Publish knowledge button, and the absence of browser-originated knowledge writes. The checkout's `npm run typecheck`, `npm run build`, synthetic browser regressions and isolated DB tests remain mandatory. **Do not claim validated until exact-head CI completes successfully.**

## Non-negotiable release barriers

All packets keep `annotationsStored=false`, `existingKnowledgeModified=false`, `canStore=false`, `canCreate=false`, `canApprove=false`, and `canPublish=false` irrespective of inputs.

**No real-world approved handoff is implemented.** A future production change requires independent authenticated owner/admin and tenant checks *inside the database transaction*, source truth and render verification, full consent/retention/deletion, RLS and audit rehearsal, full document version validation, independent conflict resolution, security and staging approval, then explicit human action via the **existing** knowledge workflows. A static report or client assertion cannot authorize these writes.

## Next: KB-04E acceptance

Validate real consent withdrawal, tenant isolation, cross-tenant rejection, deletion and audit procedures, current-source source verification, real provider behavior and release readiness in isolated staging. Keep all production integrations and source fetching disabled until those gates are demonstrated.

## Non-actions

No live crawl, model call, database or storage mutation, actual human approval, CRM content change, publication, deployment, `main` merge or release.
