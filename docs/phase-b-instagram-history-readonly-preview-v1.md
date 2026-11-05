# Phase B — On-demand Instagram history preview (read-only)

## Scope
Add an owner/admin-only **Preview history (read-only)** control to System Health → Message Sync, for each connected Instagram account. It reuses the existing `POST /api/instagram/history-sync` route with an explicit `mode: 'history_preview'` and `apply: false`. No new external API integration or data migration is introduced.

The server checks a bounded sample of **at most 1 provider conversation and 20 messages per account** from Meta's official Conversations API. It returns numeric counts only: provider conversations examined, matching existing CRM thread, provider messages examined, skipped/unmatched items, and whether more conversation pages are reported. A later Phase B extension also performs one exact tenant/conversation/direction/provider-ID CRM lookup for sampled outbound provider messages, returning outbound seen, matched and missing-match counts only. See `docs/phase-b-instagram-outbound-history-preview-v1.md`.

The preview **does not import**, alter CRM messages, store provider payloads, advance history cursors, send DMs, update Meta subscriptions, enable flags, or activate any scheduled worker. It is intentionally available even when the history-import flag is disabled.

## Authorization and correctness
- Enforce same-origin POST, authenticated active profile, owner/admin active workspace, matching active organization and membership role **before** creating a service-role client.
- Resolve the connection only inside that authorized organization with `provider=instagram`, `status=connected` and exact connection ID.
- Explicit `echo_status` and `history_preview` modes must include `apply:false`. Reject unknown modes and attempt to write from inspection mode even if the separate import flag is enabled.
- For read-only previews, the UI requires `ok:true`, `dryRun:true`, `customerMessageSent:false`, zero import counts, strictly bounded and internally consistent numeric counts and no unexpected response fields. Otherwise show **Unavailable**.
- No customer identifiers, message content or access tokens appear in the rendered preview; no preview results are retained beyond the open page session.

## Interpretation
- A successful preview shows that the connected Graph account returned the **sampled** data; it is not proof of complete historical coverage.
- Zero matched conversations may mean the provider returned a thread that is not present in this CRM; it is not proof that no other CRM threads can be matched.
- Zero provider messages or `hasMore:false` does not demonstrate complete history: Meta may omit inactive Requests, older messages and conversations not returned by the API.
- Provider errors or malformed response summaries are **unknown**, not zero.
- Outgoing-echo delivery requires the separate app-scoped Meta subscription evidence and permitted signed live event verification. Neither outgoing parser nor history import is enabled by this PR.

## Verification
`node --test tests/readiness/instagram-history-readonly-preview-v1.test.cjs`, full `npm run test:readiness`, TypeScript, build, CodeQL and existing database tests.

## Operator check after deployment
1. Sign in as an owner/admin and visit System Health → Message Sync.
2. For each connected Instagram account, click **Preview history (read-only)** and record *only the numeric summary* or provider-unavailable status.
3. Review **Check Meta subscription** separately; the preview does not validate webhook delivery.
4. Do **not** turn on `INSTAGRAM_HISTORY_SYNC_ENABLED`, `INSTAGRAM_OUTBOUND_ECHO_ENABLED` or the inactive retry job as part of these checks.
