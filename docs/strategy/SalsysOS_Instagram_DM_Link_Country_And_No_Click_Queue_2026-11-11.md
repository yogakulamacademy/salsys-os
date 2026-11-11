# SalsysOS — Instagram DM Link Country Context + No-Verified-Click Staff Queue

**Version:** 0.1, proposed, documentation only — 2026-11-11  
**Parent:** [Kraya-informed SalsysOS workstreams #696](https://github.com/yogakulamacademy/salsys-os/issues/696)  
**Connected:** Eligibility Pricing v0.2; Historical Conversation Learning; R2/R3/R4/R6/R7/R10.  
**Status:** Not implemented; requires separate privacy, Meta API, identity and release approval. **R2 optional behavioral collector remains OFF**; other AI/staging/no-send holds remain unchanged.

## User goal and decision

When a prospect receives an **eligible Instagram DM containing a unique first-party course link**:
- If they open the link, obtain a **coarse, approximate country of the network used for that visit**, without demanding a form completion.
- Display the observation alongside the **originating Instagram conversation** with a clear source/time, when an authorized per-recipient token and policy allow linkage.
- Keep country of visit distinct from country of residence, declared country, currency preference and contractual **pricing eligibility**. Never quietly replace verified residence or issue an irreversible category-specific price based on visit-IP.
- If there is **no verified visit after an operator-configured interval**, put the conversation into a **staff attention queue**, rather than have AI assume lack of interest or send unauthorized reminder DMs.
- Always respect opt-out, data minimization, manual takeover, deleted identifiers, channel messaging windows and correction opportunities.

This is **not** permission to start personal tracking or send the first DM; prospective customers must already be contactable under the platform's permitted messaging rules.

## Two workflow branches

### Branch A — Link observed

1. Source: inbound Instagram message arrives through existing verified business integration; authorize tenant/selected lead and store platform-scoped sender identity.
2. An authorized staff action or later explicitly approved AI agent sends a course link within provider messaging eligibility. The **server** creates a cryptographically unpredictable opaque token with purpose `course_info_link`, specific tenant/conversation/lead/message/destination context, expiry, revocation, and share-risk policy. It is **not** a client-readable embedded Instagram ID, phone, email, or permanent identifier. Example URL is illustrative: `https://yogakulam.com/go/7qj3R...`.
3. Store provider message-id, outgoing attempt/acceptance and link-token issue record separately. Never classify a send as delivered merely because Meta accepted it.
4. Click opens the **business-controlled first-party URL/redirect**, not an Instagram analytics callback. Evaluate real-visitor evidence and known crawler/preview/prefetch/security-scanner request categories; avoid counting the preview as a human click. Browser-confirmed landing request may be stronger than raw redirect request but still cannot prove which person clicked.
5. When permitted for the disclosed purpose, derive **coarse ISO country at the trusted server edge**, timestamp, provider/source and risk flags, then record only the minimally necessary observation. The webhook does not contain customer IP. No precision GPS/location permission is needed; do not collect it.
6. Link the observation as **`recipient_link_visit_observed`** to the originating conversation via server-side token mapping only. Label as **token-linked visit** rather than proven person visit: the URL may be forwarded, copied or opened by a scanning proxy. Explicit identity assurance remains unchanged.
7. Update CRM **`latest_observed_visit_country`** *only if* policy, permissions and provenance permit; **never overwrite** `declared_residence_country`, `verified_residence`, `citizenship` or `pricing_eligibility`. Source/type and freshness clearly displayed.
8. AI/staff can use coarse location for contextual language or to offer rate categories provisionally; no hidden automatic Indian/international price enforcement. Final quote governed by the approved eligibility/quote resolver and human exception rule.
9. Destination page loads normally and remains accessible without accepting optional analytics; no tracking cookie or optional browser collection should be secretly switched on. If the approved purpose does not authorize persistent per-lead click association, display the course page without per-lead tracking and status remains unknown.

**Core distinction:** A visit from an UAE IP does NOT prove the visitor lives in UAE, that the original Instagram contact personally opened it, or that international fees must apply.

### Branch B — No verified click observed

1. Record outbound link status `drafted`, `queued`, `provider_accepted`, `failed`, `unknown`, `revoked`; keep `verified_visit_observed` and `eligible_for_staff_attention` as separate concepts. Unknown/unavailable tracking is NOT equal to “did not click”.
2. After a **configurable period** from a valid outbound/eligible event (example for testing: 12–24 hours; not a final product policy), check that no qualifying link visit is observed *within accessible, permitted evidence*.
3. Before enqueue, reject cases with inbound reply, already booked/closed status, customer opt-out, employee takeover already handled, expired/deleted link, unsupported tracking/consent, delivery failure/unknown, or task already present. If delivery cannot be verified, show **needs outreach review** separately rather than “no click”.
4. Create exactly **one** idempotent staff task per link message + configured waiting interval, with lead ownership, due timestamp, course interest, last inbound time, provider window eligibility, click coverage status and why this record needs attention.
5. Employee opens lead conversation and chooses manual response when allowed. **No automatic DM or template send** is triggered by the absence of a click. Follow-ups obey current Instagram policy and any business consent; outside an eligible message window, queue a task to decide an allowed alternative—not a prohibited DM.
6. Reconcile if a real click or reply arrives late; update/close obsolete task. Do not conclude disinterest. Separate human `no_click_observed` display from absolute `did_not_click` claim.
7. Staff queue should be minimal: `No verified link open`, `Link opened`, `Tracking unavailable`, `Click ambiguous`, `Link send failed`. These labels are not universal provider delivery statuses.

## Example

Instagram conversation: `IGSID_***` asks about 200-hour YTT; approved staff/agent sends unique course URL; a first-party browser request from France follows after 3 minutes. CRM:
- Source link: exact sent Instagram message.
- Link activity: `Likely website visit (not verified person)`, source first-party redirect+eligible browser event.
- Observed IP network country: `FR` (time-bound, approximate).
- Declared residence / pricing eligibility: unchanged/unknown.
- Staff next action: review available pricing options if needed.

Another lead with delivered/eligible link and no trustworthy visitor activity after configured time shows `No verified click — staff follow-up candidate`; absence of the click cannot prove a user ignored the message.

## Security, privacy and analytics

- Server-bound **random token** (not reversible or guessable); short TTL, HMAC/hash at rest, rate-limited redirect, tenant scope, allowlisted safe destination host, no arbitrary redirect/SSRF/open redirect, constant-time checks, revocation and replay policy.
- Remove sensitive token and matching details from public analytics, search/SEO indexing, browser referrers, client logs, email previews and downstream redirects. Prevent accidental leakage through URL/query logs where possible. Do not use persistent public lead identifiers.
- Validate the **trusted edge's client IP** only; do not parse untrusted spoofable `X-Forwarded-For` or Meta webhook IP as the prospect. Country can reflect VPN/proxy, link scanning, Apple Private Relay, mobile network egress or another person opening forwarded link.
- Prefer coarse country over raw long-lived IP; minimize, encrypt, expire and delete per privacy policy. Respect data subject requests and consent withdrawal. Data processing for cross-app per-conversation attribution is not automatically covered by a generic website analytics banner. Document purpose and lawful basis and provide appropriate notice/choice before activation. **Do not circumvent the existing R2 collector OFF state.**
- Avoid automatic discriminatory price assignment. Approved objective eligibility and transparent region-specific pricing disclosure plus correction/override prevail; link location is at most provisional context.
- Use same existing canonical event/identity/CRM systems rather than creating a duplicate parallel tracking warehouse. Keep server-only dispatch eligibility and exact link event identity; idempotent callbacks and replay-safe queue. No raw recipient IDs in general analytics or reports.

## Repository reuse checkpoint (read-only inspection 2026-11-11)

Existing:
- `app/api/instagram/webhook/route.ts`: incoming/outbound echo/read-receipt event processing with account/sender/message identity and automation routing.
- `components/instagram-outbound-bridge.tsx`: Instagram send integration into the conversation workspace.
- `lib/tracking/durable-events.ts`: durable server-side trusted event envelope and tracking infrastructure.
- `docs/JOURNEY-EVIDENCE-CHECKPOINT.md`: bounded, tenant/lead-scoped journey presentation and explicit limitations on absent consent evidence.

**Not verified:** an authorized first-party *per-DM-recipient signed redirect*, persistent privacy-reviewed link-click mapping to Instagram sender, country enrichment from that click, and a verified-no-click staff task workflow. Build nothing until exact existing models and all current feature flags are re-audited.

## Acceptance tests and counterexamples

1. One approved DM -> one opaque token -> permitted browser click -> source/time/country observation linked to correct tenant/conversation without a form.
2. Same link first fetched by Meta/social preview, scanner or prefetch -> **no fake human click**; suppression not absolute (ambiguous remains ambiguous).
3. Link forwarded to a third party/clicker from another country -> do not claim original person residence or update eligibility.
4. VPN, proxy, private relay, CDN/proxy misconfiguration -> country low confidence/unknown; customer declared current country remains authoritative for its own field.
5. Recipient no form -> no accidental lead merge; IG sender ID remains thread-scoped.
6. Country observation updates permitted observation field only; never citizenship, residence or fee eligibility.
7. Unknown consent or withdrawn purpose -> no unauthorized per-lead click association, visitor tracking or behavior-driven tasking.
8. Timed no-click queue only when link send is eligible and reliable click measurement is covered; no duplicate tasks/race conditions.
9. New inbound reply, human takeover, booking/closed, opted-out, failure/unknown delivery -> cancel/suppress inappropriate no-click follow-up.
10. Out-of-window Instagram DM -> no unauthorized automated reply; staff task labels allowed vs blocked next actions.
11. Cross-tenant token, expired/revoked token, rapid guesses, open redirect, cross-enquiry, deletion and raw token URL leakage tests all fail closed.
12. A truthful delivery/click funnel counts `eligible_link_sent`, `likely_human_open`, `ambiguous_link_request`, `not_observed` with explicit coverage; it must not equate clicks with application starts or sales.

## Planned work packages AFTER existing release reviews

- **DM-LINK-00:** Read-only inventory of website event routing, verified provider send message IDs, available marketing-purpose permissions, current Meta API restrictions, R2 consent and event-model gates. Owner/legal approval on tracking purpose and retention.
- **DM-LINK-01:** Minimal tenant-safe short-link issuance and protected redirect/click evidence model on a *controlled branch* with synthetic preview/bot/forward/VPN and destination-allowlist tests. No production writes.
- **DM-LINK-02:** CRM lead-side **country-of-visit observation panel** and exact conversation token provenance, with unresolved and limited-coverage states, not automatic pricing eligibility.
- **DM-LINK-03:** Staff attention queue for **no verified visit**, with idempotent task triggers, stop-on-reply, manual takeover, provider-window checks and user-adjustable wait.
- **DM-LINK-04:** Staged signed-in consent/provider acceptance; monitor false-positive click rate, absence-coverage, response SLA and verified eventual conversion. Explicit owner/provider/privacy release authorization before any production changes.

**Roadmap mapping:** R2 first-party event/consent; R3 Conversations/Follow-ups; R4 Journey provenance; R6 lead priority; R7 Instagram eligibility; R10 action recommendations; R11 education sales context. Existing V1 closeouts unchanged. This document grants **no permission** for new DM sends, click tracking, identity matching, collector activation, production changes or deployment.

**Public sources:** https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api ; https://support.maxmind.com/knowledge-base/articles/maxmind-geolocation-accuracy ; https://developer.mozilla.org/en-US/docs/Glossary/Prefetch ; https://www.postman.com/meta/messenger-platform-api/folder/22794852-255610cd-47f5-4f4d-b3fa-71aec360be9a .
