# Instagram outgoing message synchronization — release gate

## Purpose

Capture Meta-signed Instagram business-account outgoing message echoes in the
same existing CRM conversation as the inbound messages. This also covers
messages typed directly in the Instagram app, **if** the connected account
actually receives the `message_echoes` webhook field. It is not a historical
Instagram Inbox import.

## Current components

- `app/api/instagram/webhook/route.ts` validates the raw Meta signature,
  validates direction and provider IDs, and requires
  `INSTAGRAM_OUTBOUND_ECHO_ENABLED=true` before parsing outbound echoes.
- `ingest_instagram_outbound_echo_v1` requires a connected Instagram account,
  matches an **existing** tenant-scoped conversation, deduplicates on Meta
  message ID, and stores original sent time and attachment metadata.
- `retry_instagram_outbound_echoes_v1` (new migration) can retry raw echoes
  deferred because the conversation was not ready. It is separate from the
  inbound DM retry worker; it never creates leads. It throttles retries at
  least five minutes apart, caps batches, and dead-letters unmatched events
  after 30 days for manual investigation. **The migration installs the
  two-minute cron job INACTIVE.** No retries are run by the migration.
- Human sends already look for an existing matching provider echo before
  inserting a separate outbound CRM message.

## Release preconditions — do not enable on configuration evidence alone

1. Confirm the `instagram_business_manage_messages` permission and
   non-expired token for each intended connected professional account.
2. **Verify live from Meta**, not from a local database flag, that the app and
   intended Instagram account are subscribed to the `message_echoes` webhook
   field. Check app mode, review/permissions and webhook callback reachability.
   Instagram account OAuth scopes do not prove webhook subscription.
3. Verify `ingest_instagram_outbound_echo_v1(uuid)` exists in the target
   database, and deploy the reviewed recovery migration via the normal
   migration promotion workflow. **Immediately read back** the job in
   `cron.job`: it must exist with `active = false`. Refuse release if active.
4. Confirm no cross-tenant provider message IDs or unresolved historical
   echoes are being silently attached to the wrong lead.
5. Carry out an approved, signed live Meta echo test with the correct
   professional account, existing thread and safe staging/test path.
6. Only after provider, permission, identity and privacy sign-off, enable
   `INSTAGRAM_OUTBOUND_ECHO_ENABLED=true` and redeploy under change control.
7. Activate the database retry job **separately** using the Supabase Cron
   dashboard (change Inactive to Active) or an approved `cron.alter_job`
   operation; confirm the correct job name, owner, command and schedule first.
   The job must remain inactive if any gate fails.

## Live QA matrix

Use a permitted test conversation already established by an Instagram user.

| Case | Pass condition |
| --- | --- |
| Instagram-app text reply | Exactly one outbound CRM message in correct thread |
| Salsys Instagram reply | Echo and Send API log reconcile to one provider message ID |
| Duplicate Meta echo | No duplicate CRM message |
| Image/video/voice note echo | No invented text; safe placeholder plus attachment metadata |
| Echo before conversation exists | Raw event deferred; later retried; no new lead created |
| Echo from unknown Instagram account | Ignored; no cross-tenant attribution |
| Invalid signature or wrong direction | Rejected/ignored; no CRM write |
| Read receipts | Do not produce an inbound message |
| Source timestamps | Sent time reflects provider event, not delayed retry |
| Disabled feature | Inbound Instagram synchronization continues unchanged |

Verify with read-only operational queries on `raw_events`,
`raw_event_processing`, `conversations`, and `messages`. Do not print
message bodies, API tokens, or customer IDs in shared logs.

## Recovery and rollback

- To stop processing new outbound echoes, set
  `INSTAGRAM_OUTBOUND_ECHO_ENABLED=false` and redeploy.
- Do not remove recorded raw events. Review failed/dead-letter processing
  metadata and restore via the approved replay workflow after fixing account
  linkage.
- The retry cron job `instagram-outbound-echo-retry-v1` is separate from
  `instagram-dm-retry-v1` and defaults **inactive**. Disable it immediately
  if reconciliation behaves unexpectedly, even if the application flag is
  already disabled. Verify `cron.job.active = false` after rollback.
- Do not claim full historical sync: Meta does not automatically replay older
  Instagram-app outbound messages when the webhook field is enabled.
