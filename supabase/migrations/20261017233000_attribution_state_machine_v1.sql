begin;

alter table public.lead_attribution
  add column if not exists organization_id uuid,
  add column if not exists attribution_state text not null default 'open',
  add column if not exists acquisition_locked_at timestamptz,
  add column if not exists conversion_locked_at timestamptz,
  add column if not exists attribution_version text not null default 'state-v1';

update public.lead_attribution la
set organization_id = l.organization_id
from public.leads l
where l.id = la.lead_id
  and la.organization_id is null;

alter table public.lead_attribution
  alter column organization_id set not null;

alter table public.lead_attribution
  drop constraint if exists lead_attribution_state_check;

alter table public.lead_attribution
  add constraint lead_attribution_state_check
  check (attribution_state in ('open','acquisition_locked','converted'));

alter table public.lead_attribution
  drop constraint if exists lead_attribution_organization_id_fkey;

alter table public.lead_attribution
  add constraint lead_attribution_organization_id_fkey
  foreign key (organization_id)
  references public.organizations(id)
  on delete cascade
  not valid;

create index if not exists idx_lead_attribution_org_lead
  on public.lead_attribution(organization_id, lead_id);

create table if not exists public.lead_attribution_transitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  from_state text,
  to_state text not null,
  reason text not null,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint lead_attribution_transition_state_check
    check (to_state in ('acquisition_locked','converted')),
  constraint uq_lead_attribution_transition_once
    unique (lead_id, to_state)
);

create index if not exists idx_lead_attribution_transitions_org_lead
  on public.lead_attribution_transitions(organization_id, lead_id, created_at desc);

alter table public.lead_attribution_transitions enable row level security;

create or replace function public.refresh_lead_attribution_internal(p_lead_id uuid)
returns public.lead_attribution
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lead public.leads%rowtype;
  v_current public.lead_attribution%rowtype;
  v_first public.touchpoints%rowtype;
  v_last public.touchpoints%rowtype;
  v_first_marketing public.touchpoints%rowtype;
  v_last_marketing public.touchpoints%rowtype;
  v_creation public.touchpoints%rowtype;
  v_conversion public.touchpoints%rowtype;
  v_result public.lead_attribution%rowtype;
  v_first_touchpoint_id uuid;
  v_first_marketing_touchpoint_id uuid;
  v_lead_creation_touchpoint_id uuid;
  v_conversion_touchpoint_id uuid;
  v_first_source text;
  v_first_medium text;
  v_first_campaign text;
  v_creation_source text;
  v_creation_medium text;
  v_creation_campaign text;
  v_conversion_source text;
  v_conversion_medium text;
  v_conversion_campaign text;
  v_acquisition_locked_at timestamptz;
  v_conversion_locked_at timestamptz;
  v_state text;
  v_previous_state text;
begin
  if p_lead_id is null then
    raise exception 'lead_id is required';
  end if;

  select l.* into v_lead
  from public.leads l
  where l.id = p_lead_id;

  if v_lead.id is null then
    raise exception 'lead not found';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('lead-attribution:' || v_lead.organization_id::text || ':' || p_lead_id::text, 0)
  );

  select la.* into v_current
  from public.lead_attribution la
  where la.lead_id = p_lead_id
  for update;

  v_previous_state := coalesce(v_current.attribution_state, 'open');

  select tp.* into v_first
  from public.touchpoints tp
  where tp.lead_id = p_lead_id
    and tp.organization_id = v_lead.organization_id
  order by tp.occurred_at asc, tp.created_at asc, tp.id asc
  limit 1;

  select tp.* into v_last
  from public.touchpoints tp
  where tp.lead_id = p_lead_id
    and tp.organization_id = v_lead.organization_id
  order by tp.occurred_at desc, tp.created_at desc, tp.id desc
  limit 1;

  select tp.* into v_first_marketing
  from public.touchpoints tp
  where tp.lead_id = p_lead_id
    and tp.organization_id = v_lead.organization_id
    and (
      tp.gclid is not null
      or tp.gbraid is not null
      or tp.wbraid is not null
      or tp.fbclid is not null
      or coalesce(nullif(lower(tp.source), ''), 'direct') not in ('direct','unknown')
    )
    and coalesce(lower(tp.medium), '') <> 'internal'
  order by tp.occurred_at asc, tp.created_at asc, tp.id asc
  limit 1;

  select tp.* into v_last_marketing
  from public.touchpoints tp
  where tp.lead_id = p_lead_id
    and tp.organization_id = v_lead.organization_id
    and (
      tp.gclid is not null
      or tp.gbraid is not null
      or tp.wbraid is not null
      or tp.fbclid is not null
      or coalesce(nullif(lower(tp.source), ''), 'direct') not in ('direct','unknown')
    )
    and coalesce(lower(tp.medium), '') <> 'internal'
  order by tp.occurred_at desc, tp.created_at desc, tp.id desc
  limit 1;

  select tp.* into v_creation
  from public.touchpoints tp
  where tp.lead_id = p_lead_id
    and tp.organization_id = v_lead.organization_id
    and tp.event_type in (
      'lead_created','form_submit','lead_form_submit','instagram_dm_started',
      'whatsapp_started','meta_lead_created','lead.submitted','lead.form_submitted','lead.captured'
    )
  order by tp.occurred_at asc, tp.created_at asc, tp.id asc
  limit 1;

  select tp.* into v_conversion
  from public.touchpoints tp
  where tp.lead_id = p_lead_id
    and tp.organization_id = v_lead.organization_id
    and tp.event_type in (
      'deposit_paid','payment_completed','enrolled','conversion',
      'payment.completed','payment.paid','booking.confirmed','enrollment.completed'
    )
  order by tp.occurred_at asc, tp.created_at asc, tp.id asc
  limit 1;

  if v_current.acquisition_locked_at is not null then
    v_first_touchpoint_id := v_current.first_touchpoint_id;
    v_first_marketing_touchpoint_id := v_current.first_marketing_touchpoint_id;
    v_lead_creation_touchpoint_id := v_current.lead_creation_touchpoint_id;
    v_first_source := v_current.first_touch_source;
    v_first_medium := v_current.first_touch_medium;
    v_first_campaign := v_current.first_touch_campaign;
    v_creation_source := v_current.lead_creation_source;
    v_creation_medium := v_current.lead_creation_medium;
    v_creation_campaign := v_current.lead_creation_campaign;
    v_acquisition_locked_at := v_current.acquisition_locked_at;
  else
    v_first_touchpoint_id := v_first.id;
    v_first_marketing_touchpoint_id := v_first_marketing.id;
    v_lead_creation_touchpoint_id := v_creation.id;
    v_first_source := coalesce(v_first_marketing.source, v_first.source);
    v_first_medium := coalesce(v_first_marketing.medium, v_first.medium);
    v_first_campaign := coalesce(v_first_marketing.campaign_name, v_first.campaign_name);
    v_creation_source := v_creation.source;
    v_creation_medium := v_creation.medium;
    v_creation_campaign := v_creation.campaign_name;

    if v_creation.id is not null then
      v_acquisition_locked_at := now();
    end if;
  end if;

  if v_current.conversion_locked_at is not null then
    v_conversion_touchpoint_id := v_current.conversion_touchpoint_id;
    v_conversion_source := v_current.conversion_source;
    v_conversion_medium := v_current.conversion_medium;
    v_conversion_campaign := v_current.conversion_campaign;
    v_conversion_locked_at := v_current.conversion_locked_at;
  else
    v_conversion_touchpoint_id := v_conversion.id;
    v_conversion_source := v_conversion.source;
    v_conversion_medium := v_conversion.medium;
    v_conversion_campaign := v_conversion.campaign_name;

    if v_conversion.id is not null then
      v_conversion_locked_at := now();
    end if;
  end if;

  v_state := case
    when v_conversion_locked_at is not null then 'converted'
    when v_acquisition_locked_at is not null then 'acquisition_locked'
    else 'open'
  end;

  insert into public.lead_attribution(
    lead_id,
    organization_id,
    first_touchpoint_id,
    last_touchpoint_id,
    first_marketing_touchpoint_id,
    last_marketing_touchpoint_id,
    lead_creation_touchpoint_id,
    conversion_touchpoint_id,
    first_touch_source,
    first_touch_medium,
    first_touch_campaign,
    last_touch_source,
    last_touch_medium,
    last_touch_campaign,
    lead_creation_source,
    lead_creation_medium,
    lead_creation_campaign,
    conversion_source,
    conversion_medium,
    conversion_campaign,
    attribution_state,
    acquisition_locked_at,
    conversion_locked_at,
    attribution_version,
    updated_at
  ) values (
    p_lead_id,
    v_lead.organization_id,
    v_first_touchpoint_id,
    v_last.id,
    v_first_marketing_touchpoint_id,
    v_last_marketing.id,
    v_lead_creation_touchpoint_id,
    v_conversion_touchpoint_id,
    v_first_source,
    v_first_medium,
    v_first_campaign,
    coalesce(v_last_marketing.source, v_last.source),
    coalesce(v_last_marketing.medium, v_last.medium),
    coalesce(v_last_marketing.campaign_name, v_last.campaign_name),
    v_creation_source,
    v_creation_medium,
    v_creation_campaign,
    v_conversion_source,
    v_conversion_medium,
    v_conversion_campaign,
    v_state,
    v_acquisition_locked_at,
    v_conversion_locked_at,
    'state-v1',
    now()
  )
  on conflict (lead_id) do update set
    organization_id = excluded.organization_id,
    first_touchpoint_id = excluded.first_touchpoint_id,
    last_touchpoint_id = excluded.last_touchpoint_id,
    first_marketing_touchpoint_id = excluded.first_marketing_touchpoint_id,
    last_marketing_touchpoint_id = excluded.last_marketing_touchpoint_id,
    lead_creation_touchpoint_id = excluded.lead_creation_touchpoint_id,
    conversion_touchpoint_id = excluded.conversion_touchpoint_id,
    first_touch_source = excluded.first_touch_source,
    first_touch_medium = excluded.first_touch_medium,
    first_touch_campaign = excluded.first_touch_campaign,
    last_touch_source = excluded.last_touch_source,
    last_touch_medium = excluded.last_touch_medium,
    last_touch_campaign = excluded.last_touch_campaign,
    lead_creation_source = excluded.lead_creation_source,
    lead_creation_medium = excluded.lead_creation_medium,
    lead_creation_campaign = excluded.lead_creation_campaign,
    conversion_source = excluded.conversion_source,
    conversion_medium = excluded.conversion_medium,
    conversion_campaign = excluded.conversion_campaign,
    attribution_state = excluded.attribution_state,
    acquisition_locked_at = excluded.acquisition_locked_at,
    conversion_locked_at = excluded.conversion_locked_at,
    attribution_version = excluded.attribution_version,
    updated_at = excluded.updated_at
  returning * into v_result;

  if v_previous_state = 'open' and v_state in ('acquisition_locked','converted') then
    insert into public.lead_attribution_transitions(
      organization_id, lead_id, from_state, to_state, reason, snapshot
    ) values (
      v_lead.organization_id,
      p_lead_id,
      'open',
      'acquisition_locked',
      'lead_creation_touchpoint_observed',
      jsonb_build_object(
        'first_touchpoint_id', v_result.first_touchpoint_id,
        'first_marketing_touchpoint_id', v_result.first_marketing_touchpoint_id,
        'lead_creation_touchpoint_id', v_result.lead_creation_touchpoint_id,
        'first_touch_source', v_result.first_touch_source,
        'first_touch_medium', v_result.first_touch_medium,
        'first_touch_campaign', v_result.first_touch_campaign,
        'lead_creation_source', v_result.lead_creation_source,
        'lead_creation_medium', v_result.lead_creation_medium,
        'lead_creation_campaign', v_result.lead_creation_campaign
      )
    ) on conflict (lead_id, to_state) do nothing;
  end if;

  if v_previous_state <> 'converted' and v_state = 'converted' then
    insert into public.lead_attribution_transitions(
      organization_id, lead_id, from_state, to_state, reason, snapshot
    ) values (
      v_lead.organization_id,
      p_lead_id,
      case when v_acquisition_locked_at is not null then 'acquisition_locked' else 'open' end,
      'converted',
      'first_conversion_touchpoint_observed',
      jsonb_build_object(
        'conversion_touchpoint_id', v_result.conversion_touchpoint_id,
        'conversion_source', v_result.conversion_source,
        'conversion_medium', v_result.conversion_medium,
        'conversion_campaign', v_result.conversion_campaign
      )
    ) on conflict (lead_id, to_state) do nothing;
  end if;

  update public.leads l
  set
    first_touch_source = case
      when v_result.acquisition_locked_at is not null then v_result.first_touch_source
      else l.first_touch_source
    end,
    first_touch_medium = case
      when v_result.acquisition_locked_at is not null then v_result.first_touch_medium
      else l.first_touch_medium
    end,
    first_touch_campaign = case
      when v_result.acquisition_locked_at is not null then v_result.first_touch_campaign
      else l.first_touch_campaign
    end,
    last_touch_source = v_result.last_touch_source,
    last_touch_medium = v_result.last_touch_medium,
    last_touch_campaign = v_result.last_touch_campaign,
    updated_at = now()
  where l.id = p_lead_id
    and l.organization_id = v_lead.organization_id;

  return v_result;
end;
$$;

create or replace view public.v_lead_attribution_integrity
with (security_invoker = true)
as
select
  l.organization_id,
  count(*) filter (where la.lead_id is null) as leads_without_attribution,
  count(*) filter (
    where la.acquisition_locked_at is not null
      and la.lead_creation_touchpoint_id is null
  ) as acquisition_lock_without_creation_touch,
  count(*) filter (
    where la.conversion_locked_at is not null
      and la.conversion_touchpoint_id is null
  ) as conversion_lock_without_conversion_touch,
  count(*) filter (
    where la.organization_id is distinct from l.organization_id
  ) as tenant_mismatches,
  count(*) filter (
    where la.attribution_state = 'converted'
      and la.conversion_locked_at is null
  ) as converted_without_lock,
  count(*) filter (
    where la.attribution_state in ('acquisition_locked','converted')
      and la.acquisition_locked_at is null
  ) as acquisition_state_without_lock,
  now() as checked_at
from public.leads l
left join public.lead_attribution la
  on la.lead_id = l.id
where l.status::text <> 'archived'
group by l.organization_id;

revoke all on public.lead_attribution_transitions from anon, authenticated;
revoke all on public.v_lead_attribution_integrity from anon;
grant select on public.v_lead_attribution_integrity to authenticated;

commit;
