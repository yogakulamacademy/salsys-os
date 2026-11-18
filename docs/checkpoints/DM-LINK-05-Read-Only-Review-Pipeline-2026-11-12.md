# DM-LINK-05 — Read-only CRM-to-staff-review pipeline checkpoint

**Date:** 2026-11-12  
**Branch:** `feature/dm-link-evidence-policy-v1-20261111`  
**Status:** Implemented only in isolated offline feature code; no PR, merge, deployment, tracking, database write or customer send.  
**Scope:** Integrate the *existing pure functions* DM-LINK-01–04 into one bounded, read-only, fail-closed decision path. Not AI model training and not live CRM integration.

## Delivered code

- `lib/ai/dm-link-review-pipeline.ts` exports `evaluateDmLinkReviewPipeline`.
- Imports `bindDmLinkToCrmMessage`, `projectDmLinkStaffEvidence`, `buildDmLinkHumanReviewCandidate` and their shared type contracts.
- Enforces exact source linkage **before** projecting visit information. The same tenant, selected lead, Instagram conversation, CRM outbound message, Meta provider message ID, and internal link registry identifier feed every stage. A name, phone prefix or IP never forms an identity match.
- Treats Meta API acceptance/sent state as **not delivered**. A `delivered` state requires separately observed delivery timestamp with noncontradictory ordering (not before CRM send, not after evaluation time); other states cannot claim a delivery timestamp.
- Unknown/partial customer inbound coverage is passed as suppressing potential no-reply assumptions. A read-only staff candidate can appear only if prior DM-LINK-04 checks permit it: fresh source reads, complete task coverage, permitted purpose, correct elapsed wait, no opted-out/replied/handled/enrolled lead and no duplicate/open task.
- Returns a **server-internal task proposal** with `automaticSendAllowed: false` always. The `taskCandidate` may contain an internal link ID for idempotency, so never expose the whole result to public browser responses. The future UI requires a separate tightly allowlisted staff projection.
- A network observation from an opened link is coarse country-of-visit only. `countryOfResidenceVerified: false` and `pricingEligibility: 'undetermined'` are immutable output fields.

## Tests performed (scoped, synthetic)

- `tests/readiness/dm-link-review-pipeline-v1.test.cjs`: 17 targeted local Node tests passed, 0 failed. Tests cover source matching, spoofed tenant/recipient/MID, incomplete input, observed visits, reply/opt-out/takeover/stage suppression, existing tasks, stale reads, disallowed delivery, and private-field minimization.
- TypeScript strict `tsc --noEmit` passed against **mirrored upstream interface declarations** in a temporary local test directory. This is not a typecheck against the full repository dependency graph.
- Upstream project modules are **mocked at the import boundary** in these tests. The assertions validate orchestration and policy sequencing, **not a production end-to-end path**.
- Source/test were created on the GitHub feature branch and read back by exact file path, with lengths matching the local tested copies (source 6,996 bytes; tests 9,553 bytes).
- Previous DM-LINK-01–04 local tests were recorded in their checkpoints. They were **not re-run together as a full combined GitHub suite** this turn.
- Full Next.js build, GitHub Actions CI, CodeQL, production Meta delivery events, signed-in staging, Postgres schema compatibility and DBA/security review remain **unverified**.

## Real integration prerequisites (still outstanding)

1. **Privacy and R2 gate:** Issue #518 still reports 2026-11-12 NO-GO, R2 optional collector OFF, isolated staging 0/16 witnessed tests and recovery-security approvals pending. Issue #531 remains authoritative. Do not lift these holds merely because offline unit tests pass.
2. **Verified source adapters:** Only an authenticated server-side user/tenant/lead read can set `staffCanWorkLead` or `linkPurposePermitted`. No client boolean, path ID or browser event can become authorization.
3. **Opaque-link registry + first-party redirect:** Requires separately approved design for tenant/RLS, token digest, expiration/revocation, exact message ID linkage, allowlisted destinations, consent and trusted country extraction; no implementation this checkpoint.
4. **Evidence reliability:** Prove that provider delivery events are exposed for each Instagram integration. Where delivery cannot be verified, do not create a "did not click" task; allow non-specific staff review instead if separately approved.
5. **Atomic task writer:** Requires a fresh, transactionally consistent read of lead, inbound messages, suppression state, all open tasks and enrollment, plus database-enforced unique idempotency. This offline `taskCandidate` is not safe to write without that boundary. Continue using existing Tasks & Follow-ups instead of adding a duplicate scheduler.
6. **Testing/release:** Approved data-use policy, independent security/DBA review, CI/CodeQL, two-tenant signed-in isolated staging scenarios, actual Meta/website tests with bot/prefetch forwarding, deletion and rollback, then separate owner-authorized merge/deploy. No automatic messages.

## Handoff

Next safe work: read-only investigation of **independent Instagram delivery evidence** and a **DB schema/RLS review-only contract** against the actual repository/migration conventions. Until owner/legal/R2 approvals, there is no authorization to collect visitor IP-country, create links, write a task, start paid staging, merge or deploy.

**No customer data, production keys, Supabase/Meta mutations, actual traffic, tracking switch, AI model training or runtime feature flag was used or changed.**
