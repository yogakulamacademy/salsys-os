# DM-LINK-06 — Instagram send provenance & link registry review contract

**Date:** 2026-11-12  
**Repository:** `yogakulamacademy/salsys-os`  
**Isolated branch:** `feature/dm-link-evidence-policy-v1-20261111`  
**Status:** Offline code + regression tests + read-only repository/schema/provider audit. **Not independently reviewed, merged, deployed, staged, or activated.**  
**Roadmap:** #696; R2 go/no-go and consent security gates: #518, #531.

## 1. Material discovery — Instagram acceptance is not recipient delivery

**Verified from current source code (read-only):**
- `app/conversations/instagram-actions.ts` authorizes a manual Instagram response via `can_work_lead` and `evaluate_instagram_dm_send_policy_v1`, calls the Instagram Send API, and stores `messages.external_message_id`, `status = 'sent'`, `sent_at`, `metadata.provider='instagram'`, `send_mode='human_manual'`, `policy_checked=true`.
- `app/api/instagram/webhook/route.ts` accepts signed inbound messages, optional outbound echoes (`INSTAGRAM_OUTBOUND_ECHO_ENABLED` currently gated), and **conversation-level** read watermarks (`INSTAGRAM_READ_RECEIPT_ACTIVITY_ENABLED` gated OFF by default).
- `lib/integrations/message-read-activity.ts` intentionally records Instagram `conversation_read_observed` as **conversation-level watermark only**, not a specific outbound Meta MID delivery or individual course-link view. WhatsApp read activities have a separate exact-MID path; do not confuse them.
- `supabase/migrations/20261104170000_instagram_outbound_echo_v1.sql` records `status='sent'` for a signed Instagram echo and metadata `source='signed_outbound_echo'`, `raw_event_id`. That is not proof the handset received the message.
- `supabase/migrations/20261105090000_instagram_receipt_reconciliation_v1.sql` explicitly states its reconciled receipts are not delivery proof.
- `supabase/migrations/001_initial_crm.sql` defines `public.messages` (external_message_id, status, sent_at, delivered_at, read_at, metadata), `public.tasks` (`human_review` task_type, due_at, assigned_to, metadata), `public.leads`, `public.conversations`. Later tenant additions require re-verification of actual deployed schema, not assumptions from the initial migration.
- Public provider documentation reviewed this turn distinguishes Meta Send API acceptance and Instagram conversation `messaging_seen` from independent **per-message delivered** confirmation. Do not assume a provider status exists from a generic integration interface.

**Consequence:** The prior DM-LINK-04/05 requirement `providerDelivery='delivered'` made the no-link-open human attention flow impractical for the currently evidenced Instagram channel. We should instead support a separate, explicitly labelled **Meta accepted / recipient delivery unconfirmed / no verified link open observed** *staff review candidate*. This is not an automatic customer message, a certain non-click, or a delivered notification.

## 2. Implemented branch-only changes

1. `lib/ai/dm-link-instagram-send-evidence.ts` — pure `classifyInstagramAcceptedSend` validates exact organization/lead/conversation/message IDs, CRM outbound `sent` row, exact Meta external MID, parseable timestamp and recognized send provenance:
   - `metadata.provider='instagram'`, `send_mode='human_manual'`, `policy_checked=true`; OR
   - `metadata.provider='instagram'`, `source='signed_outbound_echo'`, `raw_event_id` shaped like UUID.
   Returns `provider_accepted` with `recipientDeliveryVerified=false` and `canAutoSend=false`, or unverified. **Metadata is NOT a cryptographic proof**; the future server adapter must verify authentic signed-event lineage and protect permissions. Unknown/ambiguous source fails closed.
2. `lib/ai/dm-link-followup-candidate.ts` — accepts two distinct staff review reasons:
   - `no_verified_visit` for independent verified delivery; OR
   - `delivery_unconfirmed` for exact provider-accepted source with known send timestamp but **no per-message delivery evidence**.
   The second task title is *Review Instagram course-link status*. Its description explicitly says delivery has **not been verified**. Both require purpose permission, link coverage, 1–168-hour threshold, fresh complete inbound and task reads, no reply/opt-out/closed/deferred lead, and no duplicate existing work. Neither can send an Instagram DM.
3. `lib/ai/dm-link-review-pipeline.ts` — derives accepted-send provenance from the **same exactly bound CRM message**, rather than trusting a plain `provider_accepted` flag. Unverified source is restricted. It propagates the accepted timestamp as a send-time anchor (not a delivery timestamp).
4. `lib/ai/dm-link-crm-evidence.ts` — adds optional message status/metadata types for server-side provenance reads without altering previous offline callers.
5. Test updates/new files in `tests/readiness/`:
   - `dm-link-instagram-send-evidence-v1.test.cjs`: 10 written tests.
   - `dm-link-followup-candidate-v1.test.cjs`: 3 new tests added (18 total).
   - `dm-link-review-pipeline-v1.test.cjs`: 5 new/changed scenarios and a real candidate/provenance loader (22 total).

## 3. Verification scope — do not exaggerate

- GitHub source/provenance was inspected read-only and branch files were committed.
- The **exact committed JavaScript function bodies**, with TypeScript type annotations removed for in-process evaluation, passed:
  - 17/17 staff follow-up edge cases,
  - 14/14 Instagram source provenance edge cases,
  - 16/16 composed-pipeline cases with **mocked CRM binding/visit observations**.
- These checks run in isolated JS evaluation, **not** `npm run test:readiness`, Node's repository test runner, a full TypeScript checker, GitHub CI/CodeQL, or a live Supabase/Meta environment. GitHub test files were added but no complete checkout/CI has run against the final revision.
- Tests explicitly cover accepted-vs-delivered wording, wrong provider MID, wrong tenant, malformed metadata, read watermark not representing delivery, signed echo classification, opt-out, reply, existing task, stale/partial evidence, approved tracking and pricing separation.
- A real customer cannot be concluded to have skipped the course page solely from absent events. Crawlers, forwarding, private networking, technical failures and missing collection remain possible.

## 4. Draft registry contract for independent DBA/privacy review — **no SQL created or applied**

A future **server-private tenant-safe link issuance registry**, not a new publicly queryable lead-tracking table, would minimally need:

| Proposed field | Semantics |
|---|---|
| `organization_id` | Tenant scope; forced by authenticated server, never inferred from token |
| `lead_id`, `conversation_id`, `crm_message_id` | Exactly bound existing CRM source identities |
| `instagram_account_id`, `instagram_recipient_id`, `provider_message_id` | Exact provider association, not public or client-readable; require source-verified send lineage |
| `link_id` | Internal bounded UUID/string registry ID; must not equal the public bearer token |
| `token_digest` | HMAC-SHA-256 of CSPRNG random 256-bit opaque token using server-only key, no plaintext token storage |
| `destination_id` / allowlisted target | Approved HTTPS website course destination; no open redirect, arbitrary query, arbitrary host or SSRF |
| `issued_at`, `expires_at`, `revoked_at`, `created_at` | Lifetime, replay and deletion support |
| `purpose_policy_version`, `processing_permission_ref` | Purpose and permitted retention/attribution proof; **unapproved until owner/privacy review** |

A future **minimal link-observation event** would need a tenant+link+canonical event key, observed timestamp, status (preview/bot/ambiguous/likely browser), optional coarse country-of-network, trusted derivation provenance and retention/deletion policy. Raw customer IP/device fingerprint and a persistent cross-platform identity graph are not prerequisites. A forwarded link never guarantees the original Instagram person clicked.

A future **task-writer extension** must rely on a reviewed atomic tenant-bound operation, one unique key for `dm-link-review-v1` per intended message+policy interval, lead owner selection, full open-task and fresh inbound/suppression checks at commit time, and staff-only `human_review` task type. UI/backend must not equate `sent`, `delivered`, `read`, `link_observed`, `no_click_observed`, and `enrolled`.

### Required structural/permission gates before schema approval

- Independently inspect the **current** tenancy FKs, RLS and privilege grants across public `leads`, `conversations`, `messages`, `tasks`, event tables and installed vs pending migrations, not just the 2026 initial schema.
- Any future new public table must have RLS and explicit grants; service-role bypass code must be strictly scoped. Prefer private schema + minimal invoker-reviewed access where possible.
- Deny anonymous/personally identifiable link detail reads; restrict public redirect to a token-to-allowlisted-destination operation with rate limits, no raw IDs, no unsafe referrer leakage and no arbitrary request metadata persistence.
- Approve purpose-specific privacy notices/consent/retention/withdrawal/deletion controls for per-contact link attribution and **observed network country**, including no link-country field overwriting declared residence or eligibility for Indian/international prices.
- Supabase Nov 2026 CLI v3 changed default local/remote semantics; any future command must use explicit target and the latest reviewed CLI workflow. **No CLI/migration or Supabase hosted operation occurred in this checkpoint.**

## 5. Release gate and next step

As of 2026-11-12, #518 remains **R2 NO-GO**, optional behavioral collector OFF, zero Vercel staging CRM deployments and signed-in staging acceptance 0/16 ON HOLD; #531 recovery/privileged-RPC/private-data approvals remain unresolved. The code intentionally leaves all of this unchanged.

**Next safe task:** a source-backed, read-only audit of the current installed/target migration contracts and existing website redirect/consent infrastructure. Once independent DBA/privacy approval is obtained, define a separately reviewed minimal link registry and redirect/visitor-evidence adapter. Real task insertion and actual Instagram message dispatch are NOT authorized by this source-only work.

No production/staging SQL, new migration, user data, Meta API call, training run, AI autonomy, collector activation, merge, deployment, background monitoring or resource spending was performed.
