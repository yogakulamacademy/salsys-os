# Phase B — Count-only signed Instagram outbound echo observations

## Purpose

When `INSTAGRAM_OUTBOUND_ECHO_ENABLED` is absent or false, the SalsysOS
Instagram webhook previously skipped extraction of outbound echo envelopes
altogether. This safely prevented CRM projection, but made provider-delivery
acceptance tests invisible to operators unless Meta was separately inspected.

This change inspects strictly direction-valid `message.is_echo=true`
candidates **only after raw HMAC-SHA256 signature verification** and basic
payload validation. When CRM echo processing is disabled, and at least one
candidate is present, it emits one aggregate-only Vercel runtime log entry:

`Signed Instagram outbound echo candidates observed (CRM processing disabled).`

The sole structured field is `candidateCount` (a number). No sender,
recipient, account ID, tenant ID, MID, raw message, timestamp, body,
attachment, token, or webhook payload is logged.

## Non-mutation guarantees

- No change to incoming Instagram customer DM handling or comment processing.
- No change to the existing `INSTAGRAM_OUTBOUND_ECHO_ENABLED` gate.
- The disabled path still returns `no_supported_instagram_events` for
  echo-only signed webhooks, without instantiating a Supabase service client.
- No `ingest_raw_event`, `ingest_instagram_outbound_echo_v1`,
  historical import, profile fetch, automation, CRM message write,
  Meta API call, new environment flag, or database migration is introduced.
- Invalid signature, missing real MID, incorrect sender direction, deleted
  message, read receipt or non-echo payload never generates an echo observation.
- When outbound processing is explicitly enabled after separate acceptance,
  the existing projection path is unchanged and the disabled-mode log is absent.

## Operational interpretation

The log proves that a **signature-valid webhook was received** with an
outbound-shaped candidate (account is the declared sender, real MID present,
and `message.is_echo=true`). It does **not** independently prove the
connected account was mapped, the account was subscribed through the intended
OAuth app, that the native Instagram app originated it, that the event was
unique, or that any correct CRM message exists.

Raw webhook deliveries can be retried, so repeated log entries or a count
of two cannot establish two unique provider messages. The observation is
not an exactly-once message counter.

For an approved native-app test, have an authorized operator note a narrow
UTC time window, send one permitted message in an existing Instagram
conversation, and check the Vercel runtime logs for this exact marker.
A missing marker is unknown delivery (not proof of a broken subscription).
A present marker establishes only the signed candidate observation and
advances the investigation toward app/account attribution. Do not put
customer names, MIDs, tokens or message bodies into shared test evidence.

## Remaining gates

1. Read the account-scoped Meta subscription fields through the existing
   signed-in owner/admin Message Sync on-demand read-only control.
2. Verify connected-account identity, correct sender/recipient direction
   and provider MID in a private authorized test.
3. Verify exactly-one correctly scoped outbound CRM message under controlled
   rollout. A log observation alone does not clear this gate.
4. Keep outbound echo parser flag absent/false and
   `instagram-outbound-echo-retry-v1` inactive until the explicit live
   acceptance and change approval.
5. Never replay historical customer messages or infer complete Instagram
   history from the observation log.

## Automated verification

`tests/readiness/instagram-signed-outbound-webhook-v1.test.cjs` executes
synthetic signed webhook requests and asserts aggregate-only log shape, no
privileged database calls in the disabled path, valid signature gating,
non-echo suppression, and the unchanged enabled echo projection.
