# SalsysOS — Eligibility-Based Pricing & AI Quote Safety

**Version:** 0.2 · Owner-refined, passive evidence-first enhancement · 2026-11-11  
**Status:** Planning-only; not a deployed or approved pricing policy  
**Related roadmap:** [#696](https://github.com/yogakulamacademy/salsys-os/issues/696) (Kraya-inspired sales AI), [#518](https://github.com/yogakulamacademy/salsys-os/issues/518) (canonical R0–R14). Maps to SX-01 qualification, SX-02 follow-ups, SX-03 staff Co-Pilot, R3/R6/R7/R11 and trusted commerce/R5. No new phase.

## 1. Problem

Some education/wellness businesses (initial proving case: Yogakulam Academy) maintain distinct Indian and international fees for the same course or package. The AI cannot guess pricing eligibility based on name, accent, country code, IP/geolocation, inferred nationality, previous conversation or INR/USD preference. A false price can produce customer disputes, inconsistent discounts or payment mismatches.

**Business policy decision required before implementation:** Define *what actually determines eligibility* for each fee category. Possibilities include India residency, verified citizenship, another publicly disclosed eligibility policy or a more general market-based pricing scheme. These are **not equivalent**. Do not implement citizenship-, ethnicity- or nationality-based assignment merely because staff call a rate “Indian”; check the relevant legal and non-discrimination requirements for offered markets. Prefer a transparent, objective and justifiable eligibility policy. Customer self-report may be sufficient for initial quote only if policy allows; verify before payment if required.

## 2. Customer-facing rule

**Owner preference, 2026-11-11: never ask a customer about their nationality or citizenship for initial fee selection. Default to evidence-assisted, low-friction price presentation without intrusive questions.**

When a lead requests price:
1. Read selected course, batch/date, mode and package preference.
2. Before asking anything, evaluate permitted, already-collected evidence: the matching form's expressly defined country-of-residence or application-country field, current customer-authored CRM message, verified previously linked customer information, website session country as an approximate supporting observation, and phone country code as a weaker hint. Keep each piece's source and date.
3. Resolve **location evidence** separately from **eligibility**. States: no location evidence / approximate location / customer-declared country / verified eligibility / disputed / exception requested. Strong contextual signals may allow a tentative *region-oriented preview*, but no phone/IP/name combination proves residency, citizenship or payment eligibility.
4. If the declared country is sufficiently current and business policy explicitly permits provisional rate presentation, prepare the corresponding published rate **clearly labelled as an applicable-category quote subject to verification**. If not, show transparent published category options or route to staff instead of a hidden automatic price decision.
5. **Do not ask about nationality.** If a real booking/payment decision cannot be made without a missing objective detail, use a respectful minimum clarification about booking/applicant location only if necessary and only when no reliable pre-existing evidence exists; never silently assume the cheaper or more expensive tier.
6. Keep **pricing eligibility**, **country of a specific website visit**, **currency preference** and **payment method** separate. INR/USD preference or country code never determines category.
7. Recheck rate, criteria, quote expiry, taxes/fees and discounts before sending a precise commercial quote or payment link. Lock a versioned snapshot including the evidence and staff approval when needed.

Never learn price policy from old conversations; old chat examples can teach the *question sequence*, not provide current prices or eligibility rules.

## 3. Source priority

1. **Canonical structured catalog/approved pricing rules:** source of current amount, currency, course, batch/date scope, package, valid_from/to, taxes, offer rules and approved applicability.
2. **Human-verified eligibility and exceptions:** signed-in authorized staff decision with evidence/reason, expiry and audit.
3. **CRM lead fields / conversation:** customer-provided qualification signal only; never upgrade inferred data into verified eligibility.
4. **Website session geolocation, phone country code and browser locale:** optional context for a tentative region preview only; never authoritative identity or price eligibility. Location from a visit is not proof of residence. Do not use advertising UTM as a geography or residency identity signal.
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
3. No definitive category-specific quote/payment link is sent when eligibility unknown and policy requires verification; show transparent published alternatives or refer to staff rather than routinely asking personal questions.
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
3. **PR-02 — Passive evidence + staff interface:** link permitted form and website observations by exact consent-compatible identifiers; keep nationality questions out of the AI script; provide auditable exceptions and staff-reviewed drafts.
4. **PR-03 — Quote and payment consistency:** versioned quote snapshot; revalidate at approved send, payment-link creation and payment verification.
5. **PR-04 — Controlled test/rollout:** negative cases, authorized signed-in acceptance, provider eligibility and privacy sign-off; only then consider low-risk AI automated pricing replies within owner-approved scope.

**Explicit hold:** This is a planning file and future scope linked to #696. Do not start code, SQL, data migration, price changes, model training, auto-replies, customer sends, staging/prod deployment, or user classification due to this document. Existing independent AI/R2/Knowledge Builder reviews and holds remain in force.

## 9. Passive location evidence, website-to-WhatsApp matching and Instagram limits — 2026-11-11 refinement

**Scope of this section:** implementation guidance only. The user wants low-friction country context without making prospects disclose nationality and without silently profiling them into legally consequential prices.

### What the signals actually support

| Signal | Legitimate interpretation | Cannot establish |
|---|---|---|
| Form country field explicitly labelled current residence or application country | Self-declared country at the form timestamp, if data can be linked to this lead | Identity documents, permanent residence, nationality, continuing eligibility |
| Form generic “country” | Country chosen on form, semantics unspecified | Whether it means nationality, booking residence or travel destination |
| Server-observed website IP-country | Approximate location of network endpoint for this visit, subject to CDN, VPN and mobile routing | Actual residence, identity or WhatsApp sender network |
| WhatsApp `wa_id` / sender number where available | Account identifier, often phone number; telephone numbering region where meaningful | Current geographic location or residency |
| WhatsApp profile display name | Supporting label for UX/review | Unique identity match or pricing category |
| Prior CRM / trusted authorized onboarding facts | Potentially useful, versioned customer-declared context | Permanent accuracy if stale or contradictory |
| Instagram scoped sender ID/profile name/username | Instagram message-thread identity and permitted profile metadata | Home country, residence or the person's website session by itself |
| Public Instagram “About this account” country | May be shown for certain accounts in the Instagram app | Current user's residence; standard Meta messaging API access |

**Instagram:** Meta's official business messaging profile API provides sender ID and supported name/username/profile fields but **does not document another customer's “About this account” location as a standard accessible field**. Third-party profile services claim public about-country retrieval but are not a dependable official API contract; do not scrape nonpublic or hidden account data or adopt unsupported services for customer pricing. Instagram “account based in” may reflect platform activity, and can be absent or hidden.

**WhatsApp:** official inbound message webhooks expose sender/account identity and profile-name fields when available but not end-user handset IP. The webhook's HTTP source IP is Meta/provider infrastructure, not the customer. WhatsApp username/business-scoped identifiers can reduce availability of phone numbers; when no phone exists, linking requires separately verified evidence.

### Exact-match-first lead linkage

1. Website form submit captures permitted server-side `session_id`, `form_event_id`, tenant, normalized submitted contact number, country-field semantics/value, timestamp, and derived coarse network-country (not an unbounded tracking archive).
2. Associate the same `session_id`/form event to its browser journey **only through the legitimate first-party event chain**; do not derive a person from the IP alone.
3. If an inbound WhatsApp sender identifier includes a normalized valid number matching an authorized submitted number **within the same tenant**, create a candidate link. Recheck duplicates, reused phone numbers, consent, event timing and existing confirmed associations. Only make a deterministic merge after the existing approved identity policy passes; otherwise human review.
4. Display name and close timing merely support review and which enquiry is relevant. A name + same country + nearby time is never sufficient to claim a single person. Do not associate an Instagram sender with a website form by similar name or IP/time; require customer-supplied and verified contact information, explicit authenticated link, or another provider-authorized exact linkage.
5. Keep account identity, enquiry identity, session-country observation, customer-declared country, actual residency evidence and fee eligibility in **separate fields**. Every inference has evidence, source, observation time, expiry/conflict status and correction path.
6. On conflict (e.g., +91 number, UAE form country, UAE network) prefer *declared UAE for the location context*; phone prefix is not decisive. Do **not** infer that this individual must receive international prices unless the owner's published, compliant rule actually uses the declared location in this way.
7. When a website visitor clicks a tracked WhatsApp link, event/session/referral provenance may help correlate the interaction, but do not treat timestamps alone or a generic click-to-chat URL as proof that a particular WhatsApp account initiated the click.

### Decision and UX examples

- **Form: UAE residence; IP UAE; WhatsApp +91** → Lead country context “UAE (self-declared; website corroboration)”; pricing tier is **provisional only** under approved residence-based rules; staff verifies the final quote.
- **Form: India residence; IP UAE while travelling; +91** → Keep India as declared country; do not override it with the visit's network country; if relevant, flag conflict for polite review.
- **No form; WhatsApp +91 only** → Phone region observed, country of residence unknown. Do not assign Indian tier. Offer transparent rate categories or a neutral reply, with staff assistance if required.
- **Instagram DM, no linked form** → No documented verified account-country signal. Do not infer from username, language, followers, geotags or profile aesthetic. Share suitable general pricing information and permit a correction or optional clarification only if necessary.
- **Cross-channel matching** → Exact verified phone/email or explicitly linked account gives the identity association. Do not merge solely by name, country, IP or timing.

### Privacy/security requirements and acceptance

- Before using geo-country for a pricing-related profile, approve and disclose purposes in the relevant privacy notice, retention schedule, processing permissions and applicable local laws. Do not collect precise GPS or new persistent raw IP histories for this project. Existing optional behavior collector remains OFF until R2 consent acceptance.
- Ensure trusted-edge IP derivation; a reverse proxy/CDN IP or untrusted `X-Forwarded-For` must not be mistaken for the client's address. Retain only the minimal authorized country observation, provenance, time and allowed retention.
- Customer has a visible way to correct a region or pricing-category error, with no surprise check-out changes. Published rate eligibility criteria should be transparent and non-discriminatory.
- Negative tests: +91 living UAE; +44 living India; VPN; mobile carrier exits abroad; travelling; stale country declaration; shared family phone; reused phone number; same-name contacts; Instagram handle change; missing WhatsApp phone/BSUID; multi-tenant collision; deleted form; simultaneous form+WhatsApp events; unauthorized cross-channel join.
- No country inference may override a direct current customer correction or verified record. Separate three labels in the UI: **Identity linkage**, **Location evidence**, **Pricing eligibility**.

**Source verification used for planning:** Meta Instagram documentation and current integration discussions; the public account-country display is not a reliable official CRM API. Meta WhatsApp sender webhook schema; MaxMind IP accuracy and proxy/VPN limitations. Reverify current provider APIs before implementation. No runtime feature has been enabled.
