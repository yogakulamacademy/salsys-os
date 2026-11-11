# KB-09R — Transient HTML5 text extraction inside manual Knowledge draft review

**Status:** DRAFT / DO NOT MERGE / NO DEPLOY / NO HOSTED SQL / NO PAID STAGING  
**Date:** 2026-11-08  
**Parent:** [KB-09Q draft PR #660](https://github.com/yogakulamacademy/salsys-os/pull/660), exact unmerged SHA `b11ac50fc0803ba3ace6ea685088fd99f9c0e851`.

## Avoid duplicating the existing extraction and simulated AI components

SalsysOS **already contains** a tested `lib/knowledge-extraction/html5-visible-text.ts` HTML5 extractor using `parse5`, `source-grounded-drafts.ts` exact-quote/FAQ candidate generator, AI proposal validation, grounding tests and a static synthetic evidence preview. None of these components currently acquires/stores approved live website content or publishes AI knowledge. Building a second parser or claiming to introduce a real AI crawler would be incorrect.

The actual missing link addressed by KB-09R is a limited, *real user-interface review tool* while independently approved website fetching, retention and storage are still unavailable: when a tenant owner/admin has selected a currently eligible discovered page (the KB-09Q handoff), they can optionally **paste HTML they copied manually from that webpage** and inspect normalized extracted text **before** typing or pasting any verified material into the **existing** draft-only form.

## Runtime boundaries and behavior

- At `/settings/knowledge?discoveryPage=<UUID>`, the existing KB-09Q signed tenant/proof/consent/source lookup must succeed before the new **Extract text from copied HTML** tool is shown.
- The client component `components/knowledge-discovery-pasted-html-review.tsx` posts a **page ID and manually supplied HTML** to a **separate server action**, `previewPastedHtmlForManualReviewAction`. The action ignores GET state and any caller-controlled source URL/organization fields, requires a signed owner/admin in the active organization and `can_manage_organization`, and repeats KB-09Q's current page/job/site/ownership/consent checks. It refuses both pilot OFF and emergency-paused conditions.
- Maximum pasted input is **150 KiB UTF-8**, checked before parsing. The existing **KB-02C parse5 HTML5 extractor** strips scripts, forms, nav, hidden/inert structures and other excluded elements. It keeps bounded conservative text blocks; the server returns **at most 24** excerpts of **up to 1,400 characters** with a SHA-256 fingerprint of the *pasted HTML bytes only*.
- The UI labels every excerpt **provisional/unverified** and presents an optional **Copy excerpt** action. The operator manually compares each quote against the actual public source and then pastes only substantiated content into the separate existing **Save as Draft** form. **No automatic insertion, new knowledge write, approval, LLM call, outbound network request, HTML storage or source-content attestation occurs in the preview action**.
- The SHA-256 digest identifies what the operator submitted, NOT that the text came from the live page, was visible after CSS/JavaScript processing, was accessible under robots rules or is current. The existing source-backed draft save still uses `p_approve=false`; existing separate admin approval is unchanged.
- No secrets, tenant names, raw HTML, fetched content or provider text are logged by this action. The pasted HTML is processed transiently on the Next.js server, sent back only as bounded text blocks and not intentionally written to the database or server files. A deployed HTTP/web server may maintain network/request logs outside this module; processor logging and retention must be reviewed independently under #613.
- Any instructions embedded in HTML are **untrusted page content**, never commands to execute, a model prompt, an approval decision or an instruction to modify policies. React text rendering escapes the excerpts. Browser clipboard failure is shown as an unavailable status rather than treated as a successful copy.

## Tests

`tests/knowledge-discovery/pasted-html-review.test.mjs` imports the **actual existing HTML5 parser** using the repository's already-established Node 22 strip-types test adapter, and exercises a mocked signed-admin action. It verifies: source metadata bound only to the current tenant, excluded hidden/script/nav/footer content, no previous-state authority, pilot OFF and pause, mock mode, cross-tenant/role/anonymous management failure, disallowed/expired proof or consent represented by a declined KB-09Q eligible-page check, oversize/malformed HTML, empty extracted text, 24-excerpt bounded result and no call to DML/approval/provider/network operations. A static UI contract checks that preview and draft forms are distinct.

This is **synthetic unit and application-level checking**, not actual DNS, SSRF, real independent browser-visible text reconciliation, serverless log retention verification or real RLS/tenant staging acceptance. No live website is accessed in tests.

## Next integration steps requiring separate authorization

**Not closed by this milestone:** automatic HTML collection through the crawler, durable per-tenant evidence snapshots and citation hashes, reviewer decisions/audit linkage to snapshots, proof/consent withdrawal and capture/commit races, robust browser-visible CSS/JS comparison, optional AI-generated FAQ drafts under the already built grounding gate, approved retention/processor budgets, a versioned protected migration and the 16 independent staging tests.

A future auto-extraction design should reuse `prepareHtml5WebsiteEvidence` (KB-02C), `prepareSourceGroundedDrafts` (KB-03A) and the existing review/grounding contracts; it must be bound transactionally to site ownership/consent and legal retention approval **before** saving excerpts. It must NOT silently relabel operator-pasted HTML as crawler-fetched evidence.

## Non-release status and explicit non-actions

[#601](https://github.com/yogakulamacademy/salsys-os/issues/601) remains **OPEN/BLOCKED 0/16 independently witnessed real isolated staging scenarios**; #612 independent security/protected approvals, #613 legal/privacy/DBA, #614 isolated staging/budget remain open. KB-09F–N SQL remains **disposable fixture ONLY, NOT a migration**. No protected staging can be provisioned using Production/Recovery; new paid staging requires revenue and a **fresh explicit** price approval. No hosted Supabase data or SQL, real page fetch, provider/model call, consent grant, automation, billing, GitHub ruleset change, `main` merge or deployment.
