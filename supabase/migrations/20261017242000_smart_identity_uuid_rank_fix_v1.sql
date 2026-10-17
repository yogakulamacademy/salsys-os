begin;

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
    (array_agg(person_id order by rn))[1],
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

commit;