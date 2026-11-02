# Journey evidence — first controlled checkpoint

Baseline: Master Context v1.2 and the accepted direction in the growth/journey plan. This extends the existing R2/R4 foundations; it does not restart R9/R10, replace the existing SEO modules, or change the two master roadmaps. The user confirmed Journey/growth before R13 commercial implementation.

## Implemented scope

- A shared enquiry-scoped Journey panel in the lead inspector and full lead profile.
- A pure, bounded projection of canonical records through the existing authorized Person Journey loader. No new collector, identity matcher, database schema, database seed or production write.
- Before/after website observations, duplicate handling, cross-boundary sessions, explicit coverage limits and allowlisted browser-facing fields.
- Distinct restricted, unavailable and not-linked states. Legacy journey read failures no longer masquerade as a successful empty history.
- Inspector responses omit raw journey metadata and matching identifiers, URL parameters, and events assigned to other opportunities. Person summary fields are allowlisted to what the Inspector displays.
- Shared empty-state/stat rules in Customer 360, Admissions and Course Management; persistent Admissions payment-table headers; existing navigation retained. Restrained indigo/blue interaction/focus tokens preserve the SalsysOS product mark.
- Fixes for two existing style defects: invisible Conversation button text and undefined legacy Course Management color variables.

## Counting contract

Only rows matching the authenticated loader's organization, linked person and **selected lead** enter the projection. Unassigned person-session events are withheld, not automatically attributed to the selected enquiry. This may reduce displayed history until a supported opportunity link is available. No new identity link is created.

The window begins 30 days before the authoritative enquiry creation instant and ends at the server's retrieval cutoff. Before means occurrence time strictly earlier than enquiry creation; after includes the boundary instant. Display times are explicitly UTC. Receipt time is not used to move an event across this boundary.

Session counts mean distinct session IDs with observed website activity on each side. They are **not session-start counts**, because the current canonical timeline does not supply authoritative session starts. A spanning session can appear on both sides; the combined total is a union and counts it once. The panel explains this difference.

Page views count only canonical digital `page_view` rows. Form submits, lead creation, business records and aggregate discovery observations are not extra page views. Canonical table/record IDs provide presentation deduplication; contradictory versions of the same record are excluded. This does not prove ingestion-level idempotency or deduplication of different provider transaction IDs.

The upstream Inspector read is capped at 120 records; other callers remain capped by the existing loader. A reported total beyond the loaded rows produces Partial history. The projection caps processing at 500 rows. Counts are observations within that loaded window, not complete lifetime totals. Invalid/future clocks are excluded; source freshness is explicitly unconfirmed.

## Evidence, privacy and money boundaries

Website records are Observed. Business rows are Recorded, not automatically reconciled or verified. A payment-page click cannot create money, enrollment, a financial status or a probability. Actual Payments remains the financial authority.

The current production read model does not supply purpose-level permission evidence. Its default in this projection is Unknown, and the UI keeps behavioural recommendations unavailable. The restricted-policy branch is tested, but no claim is made that collectors, identity linking, queues, exports, retention or downstream revocation are now enforced by this component. Those are separate integration gates.

Search query/citation reports are never projected as named-person events. Raw URL query strings, fragments, userinfo, matching tokens and arbitrary metadata are not forwarded. This is data minimization at the new presentation boundary, not a compliance certification.

## Test evidence and the GT-01 boundary

`tests/growth/fixtures/gt01.json` preserves the supplied synthetic scenario. The test adapter constructs canonical-read rows under the fixture's explicit policy and trusted identity assumptions. It does **not** prove that live collectors or identity resolution establish those assumptions.

The production projection is exercised against four observed sessions, seven page views, three views before enquiry and four after. Tests cover replay/reordering, conflicting records, spanning sessions, unrelated tenant/person/opportunity rows, unassigned history, denial/failure, invalid/future timestamps, URL/metadata minimization, aggregate exclusions and the Inspector authorization/projection boundary.

The full GT-01 workflow is still **not run**. Its expected ₹80,000 net cash, refund, contractual adjustment, enrollment reservation, acquisition credit and provider delivery remain an oracle until tested through the actual financial/identity adapters in a disposable isolated environment. Passing the Journey projection is not a full GT-01 pass. The GT-02–GT-30 scenarios likewise remain integration cases except for the explicitly tested presentation/loader subcases.

Run `npm run test:journey`, `npm run test:ui:unit`, `npm run test:ui`, `npm run typecheck` and the existing repository checks. Local UI ports can be isolated with `UI_TEST_PORT`, `UI_FIXTURE_PORT` and `UI_TEST_BUILD_DIR`; default CI settings remain unchanged.

## Next gates

**Critical workflow dependency:** `docs/AI-KNOWLEDGE-AGENT-WORKFLOW.md` is part of the upcoming work, covering approved knowledge, sales materials, routine autonomy and risk-based commercial approvals for both WhatsApp and Instagram. Preserve it when implementing the following gates.

1. Validate the deployed read/PII policy with normal production roles using disposable staging records.
2. Map and replay trusted intake, identity, payments/refunds and enrollment commands. Reconcile the ₹80,000 fixture without inserting expected end states.
3. Supply current purpose-level permission and data freshness evidence from an authoritative adapter before enabling behavioural suggestions.
4. Extend the existing attention and page-opportunity modules with explainable evidence, ownership and acceptance measures. Keep person observations separate from aggregate search/AI visibility.
5. Continue R13 only after this user-prioritized Journey/growth work; reuse the shared UI primitives for its future screens. Never reuse lead/student payments for SaaS billing.

No merge or production deployment is part of this checkpoint.
