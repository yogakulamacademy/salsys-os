-- Phase B: metadata-only, tenant-scoped reconciliation summary.
-- No raw event payloads, message bodies, customer IDs, credentials or provider
-- messages are exposed by this function. No replay or outbound sends.
--
-- Service-role execution is permitted only after the application's fresh
-- owner/admin membership and active-tenant checks. The function uses invoker
-- rights and does not bypass RLS for ordinary application roles.
create or replace function public.get_message_sync_audit_v1(
  p_organization_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $function$
  select jsonb_build_object(
    'messages', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'channel', s.channel,
          'direction', s.direction,
          'storedCount', s.stored_count,
          'missingProviderId', s.missing_provider_id,
          'outboundMissingSentAt', s.outbound_missing_sent_at,
          'latestStoredAt', s.latest_stored_at
        ) order by s.channel, s.direction
      )
      from (
        select
          c.channel::text as channel,
          m.direction::text as direction,
          count(*)::bigint as stored_count,
          count(*) filter (where m.external_message_id is null)::bigint as missing_provider_id,
          count(*) filter (
            where m.direction::text = 'outbound' and m.sent_at is null
          )::bigint as outbound_missing_sent_at,
          max(m.created_at) as latest_stored_at
        from public.messages m
        join public.conversations c
          on c.id = m.conversation_id
          and c.organization_id = m.organization_id
        where m.organization_id = p_organization_id
          and c.channel::text in ('instagram', 'whatsapp', 'website')
        group by c.channel, m.direction
      ) s
    ), '[]'::jsonb),
    'providerEventLifecycle', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'channel', s.channel,
          'status', s.status,
          'eventCount', s.event_count,
          'lastUpdatedAt', s.last_updated_at
        ) order by s.channel, s.status
      )
      from (
        select
          re.source_system as channel,
          rep.status,
          count(*)::bigint as event_count,
          max(rep.updated_at) as last_updated_at
        from public.raw_event_processing rep
        join public.raw_events re
          on re.id = rep.raw_event_id
          and re.organization_id = rep.organization_id
        where rep.organization_id = p_organization_id
          and re.source_system in ('instagram', 'whatsapp')
        group by re.source_system, rep.status
      ) s
    ), '[]'::jsonb),
    'instagramHistory', (
      select jsonb_build_object(
        'accountCursors', count(*)::bigint,
        'completedCycles', coalesce(sum(completed_cycles), 0)::bigint,
        'conversationsScanned', coalesce(sum(conversations_scanned), 0)::bigint,
        'messagesImported', coalesce(sum(messages_imported), 0)::bigint,
        'messagesAlreadyPresent', coalesce(sum(messages_already_present), 0)::bigint,
        'lastScannedAt', max(last_scanned_at)
      )
      from public.instagram_history_sync_cursor_v1
      where organization_id = p_organization_id
    ),
    'checkedAt', now()
  );
$function$;

revoke all on function public.get_message_sync_audit_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.get_message_sync_audit_v1(uuid)
  to service_role;

comment on function public.get_message_sync_audit_v1(uuid) is
  'Read-only tenant-level reconciliation counts for authorized operations staff. Not a provider-side delivery or historical completeness guarantee.';
