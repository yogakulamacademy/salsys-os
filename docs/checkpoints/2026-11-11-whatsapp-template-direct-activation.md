# WhatsApp Template Studio — Direct Draft Creator rollout

## Root cause
The CRM displayed **Preview creator** because `WA_TEMPLATE_STUDIO_ENABLED` was unset. An admin-only full editor and draft API were already in production source, but were intentionally gated off. Meta submission is controlled separately by `WA_TEMPLATE_AUTHORING_ENABLED`.

## Database preflight
The existing migration created a draft-name check using PostgreSQL regex `{1,512}`, which raised "invalid repetition count(s)" on real inserts. Clean migration replay did not exercise that check. This change applies a forward-only SQL migration replacing the repetition with a separate `length(template_name) between 1 and 512` check and `^[a-z0-9_]+$` regex.

## Verified evidence
- On November 11, 2026, SalsysOS temporary staging and production both received the additive WhatsApp draft table migration. Both databases had RLS enabled; anonymous and authenticated clients have no direct table read/write grants; only the server service role has access.
- Name constraint correction was applied to staging and production via separate recorded migrations.
- A real production database transaction inserted and read a synthetic draft, checked that a cross-tenant organization reassignment was rejected by the trigger, and rolled back. No draft row was committed.
- Existing connected WhatsApp default accounts have matching tenant-bound integration connections; no duplicate active defaults per organization.
- Meta submission remains OFF; no customer messages were sent.

## Rollout
1. Merge this forward migration checkpoint after CI and migration replay.
2. Enable `WA_TEMPLATE_STUDIO_ENABLED=true` in Vercel production after schema preflight.
3. Keep `WA_TEMPLATE_AUTHORING_ENABLED` absent/OFF. This enables only local draft saving, not Meta submission or customer sends.
4. Redeploy the current reviewed `main` SHA and verify readiness and new Template Studio route.
5. Independently verify a real signed-in admin can create/edit a draft before calling the full workflow accepted.
6. Leave R2/AI staging and messaging pilot holds unchanged.

## Remaining
- Signed-in user acceptance, active Meta template submission approval, and staging E2E with a test WhatsApp connection are not established by synthetic SQL tests.
