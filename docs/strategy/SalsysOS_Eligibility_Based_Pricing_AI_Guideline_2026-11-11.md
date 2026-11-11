# SalsysOS — Eligibility-Based Pricing & AI Quote Safety

**Version:** 0.1 · Proposed enhancement · 2026-11-11  
**Status:** Planning-only; not a deployed or approved pricing policy  
**Related roadmap:** [#696](https://github.com/yogakulamacademy/salsys-os/issues/696) (Kraya-inspired sales AI), [#518](https://github.com/yogakulamacademy/salsys-os/issues/518) (canonical R0–R14). Maps to SX-01 qualification, SX-02 follow-ups, SX-03 staff Co-Pilot, R3/R6/R7/R11 and trusted commerce/R5. No new phase.

## 1. Problem

Some education/wellness businesses (initial proving case: Yogakulam Academy) maintain distinct Indian and international fees for the same course or package. The AI cannot guess pricing eligibility based on name, accent, country code, IP/geolocation, inferred nationality, previous conversation or INR/USD preference. A false price can produce customer disputes, inconsistent discounts or payment mismatches.

**Business policy decision required before implementation:** Define *what actually determines eligibility* for each fee category. Possibilities include India residency, verified citizenship, another publicly disclosed eligibility policy or a more general market-based pricing scheme. These are **not equivalent**. Do not implement citizenship-, ethnicity- or nationality-based assignment merely because staff call a rate “Indian”; check the relevant legal and non-discrimination requirements for offered markets. Prefer a transparent, objective and justifiable eligibility policy. Customer self-report may be sufficient for initial quote only if policy allows; verify before payment if required.

## 2. Customer-facing rule

When a lead requests price:
1. Read selected course, batch/date, mode and package preference.
2. Resolve tenant-approved pricing eligibility independently of country/currency. States: unknown, customer_claimed, staff_verified, policy_verified, disputed, exception_requested.
3. A verified/current eligible category selects one approved rate. If unknown, ask one minimal neutral question that matches the approved policy (e.g. for an **India-resident** policy: “May I know your country of residence so I can share the applicable fees?”). Do not assume residency from phone or IP.
4. If the customer asks for both rates, provide both eligible published options only if the business's disclosure policy permits, with factual criteria and no misleading restrictions. If uncertain, show a neutral response and offer staff review.
5. Separate chosen **pricing category** from **currency preference** and **payment method**. Paying in INR does not imply Indian eligibility, or USD imply foreign eligibility.
6. Verify rate, policy, quote expiry, taxes/fees and discounts again before issuing payment link or sending any contractual quote.
7. Lock a versioned quote snapshot to tenant, lead/authorized opportunity, course/batch, package, eligibility determination, amount, currency, tax/fee policy, expiration and approver. Existing human approval rules apply to deposits, discounts and commercial commitments.

Never learn price policy from old conversations; old chat examples can teach the *question sequence*, not provide current prices or eligibility rules.

## 3. Source priority

1. **Canonical structured catalog/approved pricing rules:** source of current amount, currency, course, batch/date scope, package, valid_from/to, taxes, offer rules and approved applicability.
2. **Human-verified eligibility and exceptions:** signed-in authorized staff decision with evidence/reason, expiry and audit.
3. **CRM lead fields / conversation:** customer-provided qualification signal only; never upgrade inferred data into verified eligibility.
4. **Website geolocation, phone country code, UTM, browser locale:** optional *unverified* hints for asking a question; never automatic nationality/citizenship classification, price discrimination, or determining contractual price.
5. **Historical RAG examples:** approved language patterns, not authority for rate or eligibility.

## 4. Canonical model (conceptual; review existing structures before any migrations)

### Pricing policy per tenant
- tenant_id, policy_id, version, effective dates, owner approver, category code and exact eligibility criteria, permitted proof level, visibility and exception rules, review/retirement states.
- Store a **code** for eligibility (e.g. IN_RESIDENT_ELIGIBLE / INTERNATIONAL_STANDARD / UNDETERMINED) only once the business has formally defined what it means. Do not create immutable labels that presume nationality.

### Price rate per course / package
- organization_id, catalog_source, course_id, optional batch_id/location/mode, package code, price_category, amount (decimal or minor units), ISO currency, published fee/tax inclusions, applicable dates, effective interval, priority/offer stacking, status and approver/version.
- Constraints: single unambiguous active winning rate for a given tenant+course+date+package+eligibility context; no wrong-currency mixing; reject overlapping conflicting rates; expiry prevents use.
- Website may remain the approved source of truth if supported by a verified read-only feed; **avoid duplicate price maintenance** when existing website/catalog already supports separate tiers.

### Lead pricing eligibility
- organization_id, lead_id, price_category_code, determination_status (unknown/customer_claimed/staff_verified), eligible_as_of, source message/reference, last_confirmed_at, expiry, reviewer, override_reason; only business-necessary data, not unnecessary sensitive documents.
- A pricing category is not a protected identity. Avoid storing unneeded nationality or ID scans.

### Quote snapshot
- organization_id, lead_id/opportunity_id, course/batch/package, pricing_rule_id/version, price_rate_id/version, category determination reference, amount/currency/fees/taxes/total, valid_until, review status, approved_by, customer-disclosure message ID and subsequent payment-request reference.
- A payment initiated under a quote must validate the same currency/amount and current eligibility; historical quote remains in the audit trail even after later price changes.

## 5. UX and AI interaction

Admin:
- Pricing Rules / approved catalog surface with two or more configured categories (not hard-coded Yogakulam logic), date-aware fees, exclusions, course/package applicability, effective dates and quote preview.
- Conflict/staleness warning; approval and audit trail. Do not allow AI to mutate price policy.

Staff:
- Lead detail displays Pricing category: Unknown / Claimed / Verified, source, verifier and last checked.
- Contextual “Confirm eligible rate” before sending precise quote/payment link.
- One-click reviewed reply with current approved rate and eligibility explanation; exception handoff.

AI:
- Use server-side function like resolve_applicable_quote(tenant, lead, product, batch, package, as_of) under canonical permission checks. Proposed tool name only, not existing deployed RPC.
- If ambiguity => clarification or staff approval, *not* guessing between INR and USD.
- Include price version/source freshness; model must not convert amounts, apply marketing offers or invent discounts.
- Channel permissions/WhatsApp template service windows and Instagram send restrictions still enforced by existing dispatch policies.

Illustrative interactions:
- “I am from India but now living in Dubai” → no automatic rate; ask approved eligibility question if residency-based and refer exception as necessary.
- “I live in India but have a foreign number” → number is not used to override confirmed residence/eligibility.
- “Can I pay the international rate in rupees?” → pricing eligibility and settlement currency handled separately, approved exchange/fees only.
- “What is your cheapest price?” → request course/package/eligibility as needed; don't promise unpublished scholarship.
- “I booked last month with old fee” → preserve booked quote record; do not retroactively rewrite payment terms.

## 6. Existing code observation and integration checkpoint

Repository read on 2026-11-11: `lib/course-management-data.ts` exposes CourseManagementBatchRow with `currency`, `price_private`, `price_shared`, `price_course_only` as single batch-level fields. This **does not establish that other catalog or website price tiers do not exist**; audit the website pricing feed, Supabase schema, quote/payment approval flow and all price consumers before designing any additive schema or UI. The canonical AI Knowledge and Sales Asset plan already states **live structured CRM/catalog/financial records outrank historical/unapproved FAQ data**.

A correct design must preserve R11's **exclusion of physical accommodation/room/bed inventory**. Private/shared are commercial package preferences only.

## 7. Required negative / acceptance tests

1. +91 foreign resident is not automatically assigned Indian fee; Indian resident using +44 is not automatically assigned international fee.
2. Currency preference never changes eligibility code; changing payment channel never changes the approved rate.
3. No price is sent when eligibility unknown and policy requires verified selection; correct minimal clarification instead.
4. Stale/expired/withdrawn discounts, scholarships and batch offers cannot be applied; old chat prices cannot override live policy.
5. Duplicate or conflicting active price records fail closed with a staff-visible alert.
6. Cross-tenant rate isolation and employee-role restrictions pass; RAG cannot leak another organization's rate/eligibility.
7. Manual exception has authorized approver, reason, expiry, audit and exact amount/currency.
8. Quote, payment link and actual checkout use the same approved price/currency/eligible package; mismatch blocks dispatch.
9. Inbound correction (residence changed, category disputed) triggers recheck and invalidates unapproved pending quote.
10. Quote disclosure, tax/processing-fee notices and refund terms are accurate; no surprise fees or hidden currency conversion.
11. No classification by surname, language, skin tone or inferred ethnicity; no arbitrary discriminatory use of identity proxies.
12. Staff-reviewed draft default; real Meta/Instagram/customer sends and staged acceptance remain separately gated.

## 8. Work plan after currently open review gates

1. **PR-00 — Policy decision & read-only source audit:** owner decides exact eligibility criterion and acceptable proof, price category names, visibility and exceptions. Legal/privacy review. Trace existing website and CRM price feeds; detect single-currency read-model limitations; do not run migrations.
2. **PR-01 — Approved catalog pricing + safe quote resolver proposal:** reuse existing tenant-safe catalog adapter, no duplicate source; propose minimal schema/contract, deterministic policy and conflict checks.
3. **PR-02 — Lead qualification + staff interface:** eligibility source/status with minimal customer questions, manual verification and audited exception controls; staff-reviewed drafts only.
4. **PR-03 — Quote and payment consistency:** versioned quote snapshot; revalidate at approved send, payment-link creation and payment verification.
5. **PR-04 — Controlled test/rollout:** negative cases, authorized signed-in acceptance, provider eligibility and privacy sign-off; only then consider low-risk AI automated pricing replies within owner-approved scope.

**Explicit hold:** This is a planning file and future scope linked to #696. Do not start code, SQL, data migration, price changes, model training, auto-replies, customer sends, staging/prod deployment, or user classification due to this document. Existing independent AI/R2/Knowledge Builder reviews and holds remain in force.
