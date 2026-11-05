# Inbox reliability: queue navigation + persisted unread state

## Live read-only evidence (5 Nov 2026)

- The production database has 882 lead records across two tenant organizations.
  The larger organization has 874; the other has 8.
- The full-dataset Inbox RPC `get_current_conversations_page_v1`
  is installed, delegates to the tenant-checked private engine, and accepts
  50-row pagination, search, created/activity sorting, owner/scope, channel,
  priority and reply/unread/snooze filters.
- Current inventory is NOT proof that every staff role can see every record.
  The RPC applies `can_access_lead`; final session-specific acceptance
  still requires a properly authorized staff smoke test.
- An RPC timeout can trigger a deliberately disclosed, limited compatibility
  queue; that limitation has not been removed by this change.

## Bugs addressed

1. On changing a server-side search, page, filter, sorting or ownership
   scope, the sidebar previously retained `lead` and transient notice
   parameters. This could display a thread not present in the new filtered
   results. Queue navigation now clears selected-thread and stale send-status
   parameters; opening a lead from a result explicitly adds its ID back.
2. The legacy/canonical workspace reader previously forced `unread=false`
   merely because a lead ID was selected, even when no read marker had
   persisted. Both readers now preserve the actual unread evidence until the
   separate authorized `markConversationReadAction` succeeds.

## Validation

- Synthetic readiness tests cover search, page, sort, scope, filter and
  reset navigation; unrelated queue context is preserved.
- A canonical synthetic RPC fixture proves an automatically selected lead
  remains unread when the source reports unread.
- No provider calls, message sends, mark-read writes, SQL migration, feature
  flags or activation changes are introduced.

## Remaining acceptance

- Exercise an actual authenticated, authorized workspace with 874 potential
  records: page past page 6 (the old 300-row boundary), search a known
  older record, verify page totals and owner restrictions.
- Verify Instagram outgoing echoes and WhatsApp coexistence with approved
  provider accounts and a human-operated test; no outbound messages were
  sent for this patch.
- Validate historical import diagnostics, media and duplicates under
  tenant/account permissions. Live sync completeness is not established
  by this navigation bug fix.
