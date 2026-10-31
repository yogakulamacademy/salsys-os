begin;

-- Phase 7B.2: atomically reconcile CRM-derived audience membership and queue
-- provider-neutral delivery work. This function never contacts Meta or Google.
create or replace function public.reconcile_ad_activation_memberships_v1(
  p_organization_id uuid,
  p_person_id uuid,
  p_lead_id uuid default null,
  p_desired_audience_keys text[] default '{}'::text[],
  p_safe_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_privacy jsonb;
  v_privacy_eligible boolean := false;
  v_effective_keys text[] := '{}'::text[];
  v_safe_metadata jsonb := '{}'::jsonb;
  v_now timestamptz := clock_timestamp();
  v_added integer := 0;
  v_removed integer := 0;
  v_queued integer := 0;
  v_row record;
begin
  if p_organization_id is null or p_person_id is null then
    raise exception 'organization_id and person_id are required';
  end if;

  -- Serialize all membership changes for one canonical person so repeated CRM
  -- updates cannot create contradictory add/remove states or duplicate queue work.
  perform 1
  from public.persons p
  where p.organization_id = p_organization_id
    and p.id = p_person_id
  for update;

  if not found then
    raise exception 'person does not belong to organization';
  end if;

  if p_lead_id is not null and not exists (
    select 1
    from public.person_leads pl
    where pl.organization_id = p_organization_id
      and pl.person_id = p_person_id
      and pl.lead_id = p_lead_id
  ) then
    raise exception 'lead is not linked to person in organization';
  end if;

  if jsonb_typeof(coalesce(p_safe_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'safe_metadata must be a JSON object';
  end if;

  -- Database-level metadata minimization. Keep only explicitly approved string
  -- keys and reject sensitive terms in either the key or the value.
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
  into v_safe_metadata
  from jsonb_each(coalesce(p_safe_metadata, '{}'::jsonb)) e
  where e.key = any(array[
      'courseId','courseName','location','stage','intent','source','medium',
      'campaign','campaignId','adsetId','adId'
    ]::text[])
    and jsonb_typeof(e.value) = 'string'
    and e.key !~* '(note|summary|message|transcript|medical|health|diagnos|condition|pregnan|prenatal|postnatal|medication|financial|payment|card|cvv|bank|document|attachment|password|secret|token|disease|symptom|therapy|treatment)'
    and trim(both '"' from e.value::text) !~* '(medical|health|diagnos|condition|pregnan|prenatal|postnatal|medication|financial|payment|card|cvv|bank|document|attachment|password|secret|token|disease|symptom|therapy|treatment)';

  v_privacy := public.resolve_ad_activation_privacy_v1(
    p_organization_id,
    p_person_id,
    p_lead_id
  );
  v_privacy_eligible := coalesce((v_privacy ->> 'eligible')::boolean, false);

  if v_privacy_eligible then
    select coalesce(array_agg(distinct k order by k), '{}'::text[])
    into v_effective_keys
    from unnest(coalesce(p_desired_audience_keys, '{}'::text[])) k
    where k = any(array[
      'active_prospects',
      'qualified_prospects',
      'high_intent_prospects',
      'enrolled_students'
    ]::text[]);
  end if;

  -- Built-in definitions are created lazily per tenant. Existing tenant edits
  -- (including pause/archive) are preserved because conflicts are not overwritten.
  insert into public.ad_audience_definitions (
    organization_id,
    audience_key,
    name,
    description,
    status,
    rules
  )
  values
    (p_organization_id, 'active_prospects', 'Active Prospects', 'CRM leads still eligible for prospect retargeting.', 'active', '{"system":"crm_stage_intent_v1"}'::jsonb),
    (p_organization_id, 'qualified_prospects', 'Qualified Prospects', 'CRM leads in qualified or high-intent stages.', 'active', '{"system":"crm_stage_intent_v1"}'::jsonb),
    (p_organization_id, 'high_intent_prospects', 'High Intent Prospects', 'CRM leads with high-intent stage or signal.', 'active', '{"system":"crm_stage_intent_v1"}'::jsonb),
    (p_organization_id, 'enrolled_students', 'Enrolled Students', 'CRM leads whose authoritative stage is enrolled.', 'active', '{"system":"crm_stage_intent_v1"}'::jsonb)
  on conflict (organization_id, audience_key) do nothing;

  -- Add/reactivate desired memberships only when the definition is active.
  for v_row in
    select a.id as audience_id, a.audience_key
    from public.ad_audience_definitions a
    where a.organization_id = p_organization_id
      and a.status = 'active'
      and a.audience_key = any(v_effective_keys)
  loop
    insert into public.ad_audience_memberships (
      organization_id,
      audience_id,
      person_id,
      lead_id,
      status,
      qualified_at,
      removed_at,
      qualification_reason,
      safe_snapshot
    )
    values (
      p_organization_id,
      v_row.audience_id,
      p_person_id,
      p_lead_id,
      'active',
      v_now,
      null,
      'crm_stage_intent_v1:' || v_row.audience_key,
      v_safe_metadata
    )
    on conflict (audience_id, person_id) do update
      set lead_id = excluded.lead_id,
          status = 'active',
          qualified_at = case
            when public.ad_audience_memberships.status = 'removed'
              then excluded.qualified_at
            else public.ad_audience_memberships.qualified_at
          end,
          removed_at = null,
          qualification_reason = excluded.qualification_reason,
          safe_snapshot = excluded.safe_snapshot
      where public.ad_audience_memberships.status = 'removed'
         or public.ad_audience_memberships.lead_id is distinct from excluded.lead_id
         or public.ad_audience_memberships.safe_snapshot is distinct from excluded.safe_snapshot;

    if found then
      v_added := v_added + 1;
    end if;
  end loop;

  -- Anything active but no longer desired (including paused/archived definitions
  -- or privacy ineligibility) becomes removed. We preserve the row as audit truth.
  with removed as (
    update public.ad_audience_memberships m
    set status = 'removed',
        removed_at = v_now,
        lead_id = coalesce(p_lead_id, m.lead_id),
        qualification_reason = case
          when not v_privacy_eligible then 'privacy_ineligible'
          else 'crm_stage_intent_v1:no_longer_eligible'
        end,
        safe_snapshot = v_safe_metadata
    from public.ad_audience_definitions a
    where m.organization_id = p_organization_id
      and m.person_id = p_person_id
      and m.status = 'active'
      and a.id = m.audience_id
      and (
        a.status <> 'active'
        or not (a.audience_key = any(v_effective_keys))
      )
    returning m.id
  )
  select count(*)::integer into v_removed from removed;

  -- Supersede stale undelivered work before queuing the new canonical state.
  -- A delivery already being processed is not mutated here; the sender must
  -- re-check current membership/privacy immediately before any provider call.
  update public.ad_activation_outbox q
  set status = 'skipped',
      skipped_at = v_now,
      last_error_code = 'superseded_membership_state',
      last_error_message = 'A newer audience membership state replaced this queued delivery.'
  from public.ad_audience_memberships m
  where q.organization_id = p_organization_id
    and q.person_id = p_person_id
    and q.membership_id = m.id
    and m.organization_id = p_organization_id
    and m.person_id = p_person_id
    and q.status in ('queued','retry')
    and q.action <> case when m.status = 'active' then 'add' else 'remove' end;

  -- Queue the current state for every active destination. Because the dedupe key
  -- contains the membership state timestamp, reruns are idempotent, while a later
  -- remove/re-add cycle produces a new legitimate delivery identity.
  with candidates as (
    select
      m.id as membership_id,
      m.organization_id,
      m.audience_id,
      m.person_id,
      m.lead_id,
      m.status,
      m.qualified_at,
      m.removed_at,
      m.safe_snapshot,
      d.id as destination_id,
      case when m.status = 'active' then 'add' else 'remove' end as action,
      case when m.status = 'active' then m.qualified_at else m.removed_at end as state_at
    from public.ad_audience_memberships m
    join public.ad_audience_destinations d
      on d.organization_id = m.organization_id
     and d.audience_id = m.audience_id
     and d.status = 'active'
    where m.organization_id = p_organization_id
      and m.person_id = p_person_id
      and (
        m.status = 'active'
        or (m.status = 'removed' and m.removed_at is not null)
      )
  ), queued as (
    insert into public.ad_activation_outbox (
      organization_id,
      destination_id,
      audience_id,
      person_id,
      lead_id,
      membership_id,
      action,
      dedupe_key,
      status,
      safe_metadata
    )
    select
      c.organization_id,
      c.destination_id,
      c.audience_id,
      c.person_id,
      c.lead_id,
      c.membership_id,
      c.action,
      'audience:' || c.audience_id::text ||
        ':destination:' || c.destination_id::text ||
        ':person:' || c.person_id::text ||
        ':action:' || c.action ||
        ':state:' || extract(epoch from c.state_at)::numeric::text,
      'queued',
      c.safe_snapshot
    from candidates c
    where c.state_at is not null
    on conflict (organization_id, dedupe_key) do nothing
    returning id
  )
  select count(*)::integer into v_queued from queued;

  return jsonb_build_object(
    'organization_id', p_organization_id,
    'person_id', p_person_id,
    'lead_id', p_lead_id,
    'privacy', v_privacy,
    'privacy_eligible', v_privacy_eligible,
    'desired_audience_keys', to_jsonb(v_effective_keys),
    'memberships_upserted', v_added,
    'memberships_removed', v_removed,
    'deliveries_queued', v_queued
  );
end;
$function$;

revoke all on function public.reconcile_ad_activation_memberships_v1(uuid, uuid, uuid, text[], jsonb)
  from public, anon, authenticated;
grant execute on function public.reconcile_ad_activation_memberships_v1(uuid, uuid, uuid, text[], jsonb)
  to service_role;

comment on function public.reconcile_ad_activation_memberships_v1(uuid, uuid, uuid, text[], jsonb) is
'Atomically reconciles consent-safe CRM audience membership and queues provider-neutral add/remove work. Service role only; performs no external provider calls.';

commit;
