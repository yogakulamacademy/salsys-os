# Phase B — Signed Instagram outbound webhook acceptance harness

This checkpoint adds executable, synthetic route-level tests for `POST /api/instagram/webhook`.

The test never calls Meta, accesses a production database, creates a lead, imports history, or sends a message. A fake CRM client records what the production route **would** call after validating a synthetic signed payload. No real provider secret, user handle, message ID, account, or lead is used.

## Test scenarios

- HMAC signature missing/invalid -> HTTP 401 without creating a privileged DB client.
- Echo feature disabled -> HTTP 200 ignored, no CRM calls.
- Read receipt, deleted echo, missing provider message ID, and reversed direction -> ignored.
- Unknown connected account -> no raw event or CRM writes.
- Correct signed echo -> one tenant-bound raw event with payload nested under `outbound_echo`, followed only by the existing outbound projector RPC.
- Duplicate delivery in the same webhook batch -> one new raw event and duplicate projection result.
- Existing-conversation-not-found -> deferred projection, no new lead or automation.
- Projector rejection -> HTTP 500 to permit a provider retry, without claiming success.

## Scope limitation

These are **in-memory route tests**. They verify application request/identity boundaries and expected RPC calls, not the SQL project's execution or Meta's actual delivery. SQL migration replay is already tested separately. A signed Meta event for a permitted real conversation, tenant-bound persistence verification, and provider-account subscription evidence are still required before the production flag or inactive cron can be enabled.

## Run

`node --test tests/readiness/instagram-signed-outbound-webhook-v1.test.cjs`

The existing `npm run test:readiness` command includes the file automatically.
