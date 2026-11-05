# Inbox: recent incoming messages are easier to find

## Production investigation — 2026-11-05
A user reported that a message was not synchronizing or visible.

Read-only investigation established two distinct behaviors:

1. **Instagram native-app outbound echo:** Signed outgoing-shaped echo
   webhooks continue reaching production with exactly one connected Instagram
   account and one existing CRM thread matched. The outgoing echo processing
   feature flag `INSTAGRAM_OUTBOUND_ECHO_ENABLED` is OFF, so those native-app
   outgoing replies are **not inserted into CRM**. That remains a separately
   gated provider-acceptance workflow, not a UI defect.
2. **Instagram inbound:** Over the preceding two hours, 26 incoming Instagram
   CRM messages were stored in 10 conversations with matching Leads, provider
   message IDs and current conversation activity timestamps. Recent raw
   webhook receipts were processed with no failures. The database's
   `supabase_realtime` publication includes `messages` and `leads`.
   This demonstrates backend ingestion, but does not prove that every
   authorized browser is displaying the correct workspace and filter.

## UI visibility issues found and fixed
- The paged Inbox previously defaulted to `created_desc` (newest *lead
  created* first), so a new incoming reply on an older Lead could be buried
  on later pages despite being stored. Default is now `activity_desc`:
  the latest conversation activity appears first. Explicit "Newest created
  first" remains selectable. Existing tenant/owner/channel/unread filters
  and 50-row pagination are unchanged.
- The realtime listener deliberately does not refresh when the browser is
  hidden, but previously did not refresh when the operator returned.
  Now `visibilitychange`, `focus`, and `online` trigger the existing
  five-second-coalesced `router.refresh()`, with full listener cleanup.
  No polling loop or additional continuous database traffic was added.
- The existing Supabase Postgres-change subscription on incoming/outgoing
  message inserts remains unchanged.
- No new permission, exposed endpoint, database migration, background job,
  webhook replay, provider send, or history import.

## Verification
- Synthetic tests confirm the Inbox RPC receives `activity_desc` by
  default while retaining explicit `created_desc` and safe invalid-sort
  fallback.
- Tests verify source-level visibility/focus/network listeners, cleanup,
  no background polling, and the retained Instagram outbound bridge.
- All existing Inbox pagination, navigation, account/tenant, full browser,
  financial and security CI gates must pass before merge.

## Remaining operator checks
If a recent **incoming** Instagram DM is still absent after a page refresh:
1. Check the active organization is the one with the connected Instagram
   account. In production, recent incoming receipts were concentrated in
   one organization; other workspaces cannot show that tenant's messages.
2. Go to `/conversations`, clear search and filters, choose **Instagram**,
   choose the authorized owner scope (typically **All owners** for admins),
   and sort by **Latest conversation activity**. Refresh the tab.
3. Open the relevant thread. If still missing, inspect the authorized lead
   and exact provider event timestamp using private tenant-safe diagnostics;
   do not copy customer message content into logs.

If the missing item is a **reply sent from the native Instagram app**,
the known blocker is the disabled outgoing echo projector. Do not enable it
or import history without separate owner-approved live acceptance and Meta
subscription verification. This UI fix cannot synchronize outbound replies.
