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
- `retry_instagram_outbound_echoes_v1` (new migration) retries raw echoes
  deferred because the conversation was not ready. It is separate from the
  inbound DM retry worker; it never creates leads. It retries at least five
  minutes apart, processes at most ten per two-minute cron run, and dead-letters
  unmatched events after 30 days for manual investigation.
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
   database, and deploy the recovery migration via the normal migration
   promotion and review workflow.
4. Confirm no cross-tenant provider message IDs or unresolved historical
   echoes are being silently attached to the wrong lead.
5. Turn on the `INSTAGRAM_OUTBOUND_ECHO_ENABLED=true` production environment
   setting **only after** a controlled live signed-event test and redeploy.

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
  `instagram-dm-retry-v1`. Disable the former if an unexpected reconciliation
  issue is detected.
- Do not claim full historical sync: Meta does not automatically replay older
  Instagram-app outbound messages when the webhook field is enabled.
