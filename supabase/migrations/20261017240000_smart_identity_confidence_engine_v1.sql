begin;

create table if not exists public.identity_resolution_policies (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  auto_link_threshold numeric(5,4) not null default 0.9000,
  ambiguity_margin numeric(5,4) not null default 0.0800,
  policy_enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint identity_resolution_policy_threshold_ck check (auto_link_threshold >= 0 and auto_link_threshold <= 1),
  constraint identity_resolution_policy_margin_ck check (ambiguity_margin >= 0 and ambiguity_margin <= 1)
);

create table if not exists public.identity_resolution_evaluations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null,
  source_system text not null default 'crm',
  decision text not null,
  selected_person_id uuid null,
  selected_score numeric(5,4) null,
  second_best_score numeric(5,4) null,
  candidate_count integer not null default 0,
  policy_snapshot jsonb not null default '{}'::jsonb,
  candidate_scores jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint identity_resolution_evaluations_decision_ck check (decision in ('existing_link','auto_link','new_person','ambiguous_isolate')),
  constraint identity_resolution_evaluations_lead_fk foreign key (organization_id,lead_id)
    references public.leads(organization_id,id) on delete cascade,
  constraint identity_resolution_evaluations_person_fk foreign key (organization_id,selected_person_id)
    references public.persons(organization_id,id) on delete set null
);

create index if not exists idx_identity_resolution_evaluations_lead
  on public.identity_resolution_evaluations(organization_id,lead_id,created_at desc);

create index if not exists idx_identity_resolution_evaluations_decision
  on public.identity_resolution_evaluations(organization_id,decision,created_at desc);

alter table public.identity_resolution_policies enable row level security;
alter table public.identity_resolution_evaluations enable row level security;

revoke all on public.identity_resolution_policies from anon, authenticated;
revoke all on public.identity_resolution_evaluations from anon, authenticated;

grant select on public.identity_resolution_policies to service_role;
grant select, insert on public.identity_resolution_evaluations to service_role;

create or replace function public.evaluate_identity_for_lead_v1(
  p_lead_id uuid,
  p_source_system text default 'crm'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_lead public.leads%rowtype;
  v_existing_person uuid;
  v_threshold numeric := 0.9000;
  v_margin numeric := 0.0800;
  v_enabled boolean := true;
  v_candidates jsonb := '[]'::jsonb;
  v_top_person uuid;
  v_top_score numeric;
  v_second_score numeric;
  v_count integer := 0;
  v_decision text;
begin
  select l.* into v_lead
  from public.leads l
  where l.id=p_lead_id
  for update;

  if v_lead.id is null then
    raise exception 'Lead not found';
  end if;

  select pl.person_id into v_existing_person
  from public.person_leads pl
  where pl.organization_id=v_lead.organization_id
    and pl.lead_id=v_lead.id
  limit 1;

  if v_existing_person is not null then
    return jsonb_build_object(
      'ok',true,
      'organization_id',v_lead.organization_id,
      'lead_id',v_lead.id,
      'decision','existing_link',
      'selected_person_id',v_existing_person,
      'selected_score',1.0000,
      'second_best_score',null,
      'candidate_count',1,
      'candidate_scores',jsonb_build_array(jsonb_build_object('person_id',v_existing_person,'score',1.0000,'signals',jsonb_build_array('existing_person_link'))),
      'policy',jsonb_build_object('auto_link_threshold',1.0000,'ambiguity_margin',0.0000,'policy_enabled',true)
    );
  end if;

  select p.auto_link_threshold,p.ambiguity_margin,p.policy_enabled
  into v_threshold,v_margin,v_enabled
  from public.identity_resolution_policies p
  where p.organization_id=v_lead.organization_id;

  v_threshold := coalesce(v_threshold,0.9000);
  v_margin := coalesce(v_margin,0.0800);
  v_enabled := coalesce(v_enabled,true);

  with contact_signals as (
    select
      pi.person_id,
      case
        when lc.contact_type::text='instagram_user_id' and (lc.verified or pi.verified) then 0.9950
        when lc.contact_type::text in ('phone','whatsapp') and (lc.verified or pi.verified) then 0.9900
        when lc.contact_type::text='email' and (lc.verified or pi.verified) then 0.9800
        when lc.contact_type::text='instagram_user_id' then 0.9600
        when lc.contact_type::text in ('phone','whatsapp') then 0.9400
        when lc.contact_type::text='email' then 0.9200
        else 0.0000
      end::numeric as weight,
      case
        when lc.contact_type::text='instagram_user_id' and (lc.verified or pi.verified) then true
        when lc.contact_type::text in ('phone','whatsapp') and (lc.verified or pi.verified) then true
        else false
      end as hard_signal,
      jsonb_build_object(
        'kind','identifier',
        'identifier_type',lc.contact_type::text,
        'verified',coalesce(lc.verified,false) or coalesce(pi.verified,false),
        'source_system',pi.source_system,
        'weight',case
          when lc.contact_type::text='instagram_user_id' and (lc.verified or pi.verified) then 0.9950
          when lc.contact_type::text in ('phone','whatsapp') and (lc.verified or pi.verified) then 0.9900
          when lc.contact_type::text='email' and (lc.verified or pi.verified) then 0.9800
          when lc.contact_type::text='instagram_user_id' then 0.9600
          when lc.contact_type::text in ('phone','whatsapp') then 0.9400
          when lc.contact_type::text='email' then 0.9200
          else 0.0000 end
      ) as signal
    from public.lead_contacts lc
    join public.person_identifiers pi
      on pi.organization_id=lc.organization_id
     and (
       (lc.contact_type::text='email' and pi.identifier_type='email' and pi.normalized_value=lc.normalized_value)
       or
       (lc.contact_type::text in ('phone','whatsapp') and pi.identifier_type in ('phone','whatsapp') and pi.normalized_value=lc.normalized_value)
       or
       (lc.contact_type::text='instagram_user_id' and pi.identifier_type='instagram_user_id' and pi.normalized_value=lc.normalized_value)
     )
    where lc.organization_id=v_lead.organization_id
      and lc.lead_id=v_lead.id
      and lc.contact_type::text in ('email','phone','whatsapp','instagram_user_id')
  ),
  session_signals as (
    select
      ps.person_id,
      1.0000::numeric as weight,
      true as hard_signal,
      jsonb_build_object(
        'kind','exact_session',
        'web_session_id',ws.id,
        'resolution_method',ps.resolution_method,
        'weight',1.0000
      ) as signal
    from public.web_sessions ws
    join public.person_sessions ps
      on ps.organization_id=ws.organization_id
     and ps.web_session_id=ws.id
    where ws.organization_id=v_lead.organization_id
      and ws.lead_id=v_lead.id
  ),
  all_signals as (
    select * from contact_signals where weight>0
    union all
    select * from session_signals
  ),
  ranked as (
    select
      s.person_id,
      least(1.0000,max(s.weight) + greatest(count(*)-1,0)*0.0250)::numeric(5,4) score,
      bool_or(s.hard_signal) hard_signal,
      count(*) signal_count,
      jsonb_agg(s.signal order by s.weight desc) signals
    from all_signals s
    group by s.person_id
  ),
  ordered as (
    select r.*,row_number() over(order by r.score desc,r.hard_signal desc,r.person_id) rn
    from ranked r
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'person_id',person_id,
      'score',score,
      'hard_signal',hard_signal,
      'signal_count',signal_count,
      'signals',signals
    ) order by rn),'[]'::jsonb),
    max(person_id) filter(where rn=1),
    max(score) filter(where rn=1),
    max(score) filter(where rn=2),
    count(*)
  into v_candidates,v_top_person,v_top_score,v_second_score,v_count
  from ordered;

  if not v_enabled then
    v_decision := 'new_person';
  elsif v_count=0 then
    v_decision := 'new_person';
  elsif v_top_score < v_threshold then
    v_decision := 'new_person';
  elsif v_count>1 and (v_top_score-coalesce(v_second_score,0)) < v_margin then
    v_decision := 'ambiguous_isolate';
  else
    v_decision := 'auto_link';
  end if;

  return jsonb_build_object(
    'ok',true,
    'organization_id',v_lead.organization_id,
    'lead_id',v_lead.id,
    'decision',v_decision,
    'selected_person_id',case when v_decision='auto_link' then v_top_person else null end,
    'selected_score',v_top_score,
    'second_best_score',v_second_score,
    'candidate_count',v_count,
    'candidate_scores',v_candidates,
    'policy',jsonb_build_object(
      'auto_link_threshold',v_threshold,
      'ambiguity_margin',v_margin,
      'policy_enabled',v_enabled
    )
  );
end;
$$;

create or replace function public.resolve_person_for_lead(
  p_lead_id uuid,
  p_source_system text default 'crm'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_lead public.leads%rowtype;
  v_eval jsonb;
  v_decision text;
  v_person_id uuid;
  v_score numeric;
  v_person_created boolean := false;
  v_conflict_id uuid;
  v_contact record;
  v_owner uuid;
  v_sessions_linked integer := 0;
  v_eval_id uuid;
begin
  if p_lead_id is null then
    raise exception 'Lead ID is required';
  end if;

  select l.* into v_lead
  from public.leads l
  where l.id=p_lead_id
  for update;

  if v_lead.id is null then
    raise exception 'Lead not found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('smart-person-resolution:'||v_lead.organization_id::text||':'||v_lead.id::text,0));

  v_eval := public.evaluate_identity_for_lead_v1(p_lead_id,p_source_system);
  v_decision := v_eval->>'decision';
  v_score := nullif(v_eval->>'selected_score','')::numeric;

  if v_decision='existing_link' then
    v_person_id := (v_eval->>'selected_person_id')::uuid;
  elsif v_decision='auto_link' then
    v_person_id := (v_eval->>'selected_person_id')::uuid;
  else
    insert into public.persons(organization_id,status,metadata)
    values(
      v_lead.organization_id,
      'active',
      jsonb_build_object(
        'created_by',case when v_decision='ambiguous_isolate' then 'smart_identity_ambiguous_isolation' else 'smart_identity_new_person' end,
        'source_system',coalesce(nullif(btrim(p_source_system),''),'crm'),
        'lead_id',v_lead.id,
        'identity_engine','confidence-v1'
      )
    ) returning id into v_person_id;
    v_person_created := true;
  end if;

  if v_decision<>'existing_link' then
    insert into public.person_leads(
      organization_id,person_id,lead_id,resolution_method,confidence,evidence
    ) values(
      v_lead.organization_id,
      v_person_id,
      v_lead.id,
      case
        when v_decision='auto_link' then 'smart_confidence_auto_link'
        when v_decision='ambiguous_isolate' then 'smart_confidence_ambiguous_isolate'
        else 'smart_confidence_new_person'
      end,
      case when v_decision='auto_link' then coalesce(v_score,0.9000) else 1.0000 end,
      jsonb_build_object(
        'source_system',coalesce(nullif(btrim(p_source_system),''),'crm'),
        'identity_engine','confidence-v1',
        'decision',v_decision,
        'candidate_scores',coalesce(v_eval->'candidate_scores','[]'::jsonb)
      )
    )
    on conflict (organization_id,lead_id) do nothing;

    select pl.person_id into v_person_id
    from public.person_leads pl
    where pl.organization_id=v_lead.organization_id and pl.lead_id=v_lead.id;
  end if;

  if v_decision='ambiguous_isolate' then
    insert into public.identity_resolution_conflicts(
      organization_id,lead_id,person_id,conflict_type,candidate_person_ids,evidence,status,metadata
    ) values(
      v_lead.organization_id,
      v_lead.id,
      v_person_id,
      'smart_identity_ambiguous_candidates',
      coalesce((select array_agg((x->>'person_id')::uuid) from jsonb_array_elements(coalesce(v_eval->'candidate_scores','[]'::jsonb)) x),array[]::uuid[]),
      jsonb_build_object(
        'selected_score',v_eval->'selected_score',
        'second_best_score',v_eval->'second_best_score',
        'candidate_scores',v_eval->'candidate_scores',
        'policy',v_eval->'policy'
      ),
      'open',
      jsonb_build_object('resolution_version','confidence-v1','autonomous_action','isolated_without_merge')
    ) returning id into v_conflict_id;
  end if;

  insert into public.identity_resolution_evaluations(
    organization_id,lead_id,source_system,decision,selected_person_id,selected_score,second_best_score,candidate_count,policy_snapshot,candidate_scores,evidence
  ) values(
    v_lead.organization_id,
    v_lead.id,
    coalesce(nullif(btrim(p_source_system),''),'crm'),
    v_decision,
    v_person_id,
    case when v_decision in ('existing_link','auto_link') then coalesce(v_score,1.0000) else null end,
    nullif(v_eval->>'second_best_score','')::numeric,
    coalesce((v_eval->>'candidate_count')::integer,0),
    coalesce(v_eval->'policy','{}'::jsonb),
    coalesce(v_eval->'candidate_scores','[]'::jsonb),
    jsonb_build_object('conflict_id',v_conflict_id,'person_created',v_person_created)
  ) returning id into v_eval_id;

  for v_contact in
    select lc.id,lc.contact_type::text identifier_type,lc.normalized_value,lc.verified,lc.created_at
    from public.lead_contacts lc
    where lc.organization_id=v_lead.organization_id
      and lc.lead_id=v_lead.id
      and lc.contact_type::text in ('email','phone','whatsapp','instagram_user_id')
      and nullif(btrim(lc.normalized_value),'') is not null
    order by lc.contact_type::text,lc.normalized_value
  loop
    perform pg_advisory_xact_lock(hashtextextended(
      'person-identifier:'||v_lead.organization_id::text||':'||
      case when v_contact.identifier_type in ('phone','whatsapp') then 'telephone' else v_contact.identifier_type end||':'||v_contact.normalized_value,0));

    select pi.person_id into v_owner
    from public.person_identifiers pi
    where pi.organization_id=v_lead.organization_id
      and (
        (v_contact.identifier_type='email' and pi.identifier_type='email' and pi.normalized_value=v_contact.normalized_value)
        or
        (v_contact.identifier_type in ('phone','whatsapp') and pi.identifier_type in ('phone','whatsapp') and pi.normalized_value=v_contact.normalized_value)
        or
        (v_contact.identifier_type='instagram_user_id' and pi.identifier_type='instagram_user_id' and pi.normalized_value=v_contact.normalized_value)
      )
    order by case when pi.person_id=v_person_id then 0 else 1 end
    limit 1;

    if v_owner is null then
      insert into public.person_identifiers(
        organization_id,person_id,identifier_type,normalized_value,verified,source_system,confidence,first_seen_at,last_seen_at,metadata
      ) values(
        v_lead.organization_id,v_person_id,v_contact.identifier_type,v_contact.normalized_value,v_contact.verified,
        coalesce(nullif(btrim(p_source_system),''),'crm'),
        case when v_contact.verified then 1.0000 when v_contact.identifier_type='email' then 0.9200 else 0.9400 end,
        v_contact.created_at,now(),
        jsonb_build_object('lead_contact_id',v_contact.id,'lead_id',v_lead.id,'identity_engine','confidence-v1')
      )
      on conflict (organization_id,identifier_type,normalized_value) do nothing;
    elsif v_owner=v_person_id then
      update public.person_identifiers pi
      set verified=pi.verified or v_contact.verified,
          last_seen_at=greatest(pi.last_seen_at,now()),
          metadata=coalesce(pi.metadata,'{}'::jsonb)||jsonb_build_object('latest_lead_contact_id',v_contact.id,'latest_lead_id',v_lead.id,'identity_engine','confidence-v1'),
          updated_at=now()
      where pi.organization_id=v_lead.organization_id
        and pi.person_id=v_person_id
        and pi.identifier_type=v_contact.identifier_type
        and pi.normalized_value=v_contact.normalized_value;
    else
      if not exists(
        select 1 from public.identity_resolution_conflicts c
        where c.organization_id=v_lead.organization_id
          and c.lead_id=v_lead.id
          and c.status='open'
          and c.conflict_type='identifier_owned_by_other_person'
          and c.evidence->>'identifier_type'=v_contact.identifier_type
          and c.evidence->>'normalized_value'=v_contact.normalized_value
      ) then
        insert into public.identity_resolution_conflicts(
          organization_id,lead_id,person_id,conflict_type,candidate_person_ids,evidence,status,metadata
        ) values(
          v_lead.organization_id,v_lead.id,v_person_id,'identifier_owned_by_other_person',array[v_owner]::uuid[],
          jsonb_build_object('identifier_type',v_contact.identifier_type,'normalized_value',v_contact.normalized_value,'existing_person_id',v_owner,'source_system',p_source_system),
          'open',jsonb_build_object('resolution_version','confidence-v1','autonomous_action','preserved_existing_owner')
        );
      end if;
    end if;

    v_owner := null;
  end loop;

  insert into public.person_sessions(
    organization_id,person_id,web_session_id,resolution_method,confidence,evidence
  )
  select
    ws.organization_id,v_person_id,ws.id,'lead_session_link',1.0000,
    jsonb_build_object('lead_id',v_lead.id,'anonymous_visitor_id',ws.anonymous_visitor_id,'session_key',ws.session_key,'source_system',p_source_system,'identity_engine','confidence-v1')
  from public.web_sessions ws
  where ws.organization_id=v_lead.organization_id and ws.lead_id=v_lead.id
  on conflict (organization_id,web_session_id)
  do update set
    person_id=excluded.person_id,
    resolution_method=excluded.resolution_method,
    confidence=excluded.confidence,
    evidence=coalesce(public.person_sessions.evidence,'{}'::jsonb)||excluded.evidence,
    linked_at=now(),
    updated_at=now();

  get diagnostics v_sessions_linked=row_count;

  return jsonb_build_object(
    'ok',true,
    'organization_id',v_lead.organization_id,
    'lead_id',v_lead.id,
    'person_id',v_person_id,
    'person_created',v_person_created,
    'resolution_method',case when v_decision='existing_link' then 'existing_person_link' else v_decision end,
    'decision',v_decision,
    'confidence',case when v_decision='auto_link' then v_score when v_decision='existing_link' then 1.0000 else 1.0000 end,
    'candidate_person_count',coalesce((v_eval->>'candidate_count')::integer,0),
    'conflict_id',v_conflict_id,
    'sessions_linked',v_sessions_linked,
    'evaluation_id',v_eval_id
  );
end;
$$;

create or replace view public.v_identity_resolution_health
with (security_invoker=true)
as
select
  o.id organization_id,
  count(pl.id) total_person_links,
  count(pl.id) filter(where pl.resolution_method='smart_confidence_auto_link') smart_auto_links,
  count(pl.id) filter(where pl.resolution_method='smart_confidence_new_person') smart_new_persons,
  count(pl.id) filter(where pl.resolution_method='smart_confidence_ambiguous_isolate') smart_ambiguous_isolations,
  count(c.id) filter(where c.status='open') open_identity_conflicts,
  count(e.id) filter(where e.created_at>=now()-interval '24 hours') evaluations_24h,
  count(e.id) filter(where e.created_at>=now()-interval '24 hours' and e.decision='auto_link') auto_links_24h,
  count(e.id) filter(where e.created_at>=now()-interval '24 hours' and e.decision='ambiguous_isolate') ambiguous_24h,
  now() checked_at
from public.organizations o
left join public.person_leads pl on pl.organization_id=o.id
left join public.identity_resolution_conflicts c on c.organization_id=o.id
left join public.identity_resolution_evaluations e on e.organization_id=o.id
group by o.id;

revoke all on public.v_identity_resolution_health from anon, authenticated;
grant select on public.v_identity_resolution_health to service_role;

commit;