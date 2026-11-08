# KB-09Q — Discovery page → manually reviewed Knowledge draft

**Status:** DRAFT / DO NOT MERGE / NO DEPLOYMENT / NO HOSTED MIGRATIONS  
**Date:** 2026-11-08  
**Parent:** [KB-09P PR #658](https://github.com/yogakulamacademy/salsys-os/pull/658) exact unmerged SHA `d1cb03c18543dbd138675786d1b579b5255e82e3`.

## Actual product gap

The permanent post-onboarding Knowledge Library already supports creating and reviewing source-backed documents. The separate controlled discovery workspace, however, only stores page **metadata** (URL, page title, fetch status). It does **not** store or validate extracted text, generate FAQ documents, or initiate human Knowledge review. Previously a discovered page had no tenant-checked handoff to create a draft. Existing `createKnowledgeDocumentAction` has a manual `Save & Approve` capability and therefore must **not** be reused unmodified to imply that unreviewed discovered metadata is a verified content source.

## Implemented in this draft stack

1. For a fetched **HTTP 200** page on an exact safe HTTPS configured hostname, when the latest discovery job is `completed` or `partial` and discovery is enabled, `/settings/knowledge/discovery` displays **Prepare manual draft**. It transmits only a UUID page ID; it cannot smuggle an attacker-controlled URL, source title, source name or organization ID as authoritative form data.
2. On `/settings/knowledge?discoveryPage=<UUID>`, the existing signed-in organization client and existing `can_manage_organization` permission must authorize the source. `eligibleDiscoveredPageForManualDraft` re-reads the tenant's configured HTTPS website, fetched HTTP-200 page, terminal job on that exact site, **current** domain ownership proof and **current purpose-limited** consent. Invalid UUID, wrong tenant, new hostname, revoked consent, expired proof, unfinished job, unavailable draft SQL/schema and unallowed pilot all fail closed. RLS remains a required additional guard.
3. The review form displays a verified *metadata reference*, not claimed text; the owner/admin must **manually open the page and type content they personally verify**. Nothing is imported from HTML, read as instructions, paraphrased by a model or published automatically. The ordinary one-click `Save & Approve` form is replaced by a separate draft-only editor when the page is selected.
4. `createManualDraftFromDiscoveredPageAction` repeats all tenant membership/role and page/proof/consent validations at server **mutation time**, explicitly ignoring forged form `organization_id`, `source_uri`, `source_name`, `intent`, `p_approve`; it calls existing tenant-guarded `create_source_backed_knowledge_document_v2` with **`p_approve=false`** and `p_source_type='website'`. The current Knowledge Library remains the only place to perform an independent admin approval later. No separate shadow approval workflow is created.
5. The new manual draft appears only after a normal database read; no GET query parameter is accepted as proof of draft creation. The existing library's source-backed status, review, retrieval eligibility and archival behavior are unchanged.
6. New synthetic negative tests cover tenant and role isolation, wrong-host URL, manipulated page ID, invalid input, expired ownership, withdrawn consent, locked/paused pilot, cancelled scan, read failures, no auto-approval, forged source/intent fields and the UI's draft-only button.

**Bounded scope:** This provides the safe *human* source-to-draft transition, **not automatic website-text extraction, FAQ generation or trust in unverified quotations**. The latter needs separately reviewed content provenance, privacy/legal approval, processor inventories, and real staging acceptance. This draft does not treat the fetcher's stored page title as verified article content.

## Release HOLD continues

- [#601](https://github.com/yogakulamacademy/salsys-os/issues/601) is still **BLOCKED 0/16 independently witnessed real staging scenarios**; this manual-draft flow adds a case for post-onboarding/tenant/consent checks, **not a synthetic witness**.
- [#612](https://github.com/yogakulamacademy/salsys-os/issues/612) independently reviewed security, role grants, code owners, approvals, protected GitHub rulesets and rollback still pending.
- [#613](https://github.com/yogakulamacademy/salsys-os/issues/613) legal processing purpose, consent, 12-table retention and external processor obligations not approved.
- [#614](https://github.com/yogakulamacademy/salsys-os/issues/614) truly isolated staging and fresh paid budget after revenue remain unapproved.
- The KB-09F–N SQL is **local auto-dropped rehearsal only** and not an installable migration. Database roles, security definer ownership, real Supabase sessions, proof validity at physical external COMMIT, in-flight withdrawal races, manual document draft versioning and existing approval integration require qualified independent review.

**Non-actions:** no production/recovery/hosted Supabase SQL, real website access or crawling, model/provider call, consent grant, synthetic “approval” presented as legal signoff, new paid project, GitHub protections, main merge or deployment.
