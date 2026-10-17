-- Verified privacy access/export engine v1
-- Service-role-only export generation with explicit identity verification and audit fingerprints.

alter table public.privacy_data_subject_requests
  add column if not exists verification_method text,
  add column if not exists verified_at timestamptz,
  add column if not exists export_generated_at timestamptz,
  add column if not exists export_hash text,
  add column if not exists export_manifest jsonb not null default '{}'::jsonb;

create table if not exists public.privacy_verification_challenges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_id uuid not null references public.privacy_data_subject_requests(id) on delete cascade,
  channel text not null,
  destination_hash text not null,
  token_hash text not null,
  expires_at timestamptz not null,
  max_attempts integer not null default 5,
  attempt_count integer not null default 0,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  check (channel in ('email','phone','whatsapp')),
  check (max_attempts between 1 and 20)
);

create index if not exists idx_privacy_verification_challenges_request
  on public.privacy_verification_challenges(organization_id,request_id,created_at desc);

create table if not exists public.privacy_export_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_id uuid not null references public.privacy_data_subject_requests(id) on delete cascade,
  person_id uuid references public.persons(id) on delete set null,
  generated_at timestamptz not null default now(),
  package_hash text not null,
  manifest jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.privacy_verification_challenges enable row level security;
alter table public.privacy_export_runs enable row level security;

drop policy if exists privacy_verification_challenges_member_read on public.privacy_verification_challenges;
create policy privacy_verification_challenges_member_read
on public.privacy_verification_challenges for select using (
  exists (
    select 1 from public.organization_members m
    where m.organization_id=privacy_verification_challenges.organization_id
      and m.user_id=auth.uid() and m.active
  )
);

drop policy if exists privacy_export_runs_member_read on public.privacy_export_runs;
create policy privacy_export_runs_member_read
on public.privacy_export_runs for select using (
  exists (
    select 1 from public.organization_members m
    where m.organization_id=privacy_export_runs.organization_id
      and m.user_id=auth.uid() and m.active
  )
);

-- Prevent self-service access/correction/deletion/portability requests from being
-- considered verified merely because the stored Person already has a verified identifier.
create or replace function public.privacy_request_verification_guard_v1()
returns trigger
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_source text := coalesce(new.metadata->>'source','');
begin
  if new.request_type in ('access','correction','deletion','restriction','portability')
     and v_source not in ('authenticated_account','admin_verified','verified_api') then
    new.status := 'verifying';
    new.verification_status := 'pending';
    new.verification_method := null;
    new.verified_at := null;
  elsif new.verification_status='verified' and new.verified_at is null then
    new.verified_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists privacy_request_verification_guard_v1 on public.privacy_data_subject_requests;
create trigger privacy_request_verification_guard_v1
before insert or update of request_type,status,verification_status,metadata
on public.privacy_data_subject_requests
for each row execute function public.privacy_request_verification_guard_v1();

create or replace function public.create_privacy_verification_challenge_v1(
  p_organization_id uuid,
  p_request_id uuid,
  p_channel text,
  p_token_hash text,
  p_ttl_minutes integer default 10
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,extensions,pg_temp
as $$
declare
  v_req public.privacy_data_subject_requests%rowtype;
  v_person uuid;
  v_candidate text;
  v_norm text;
  v_destination_hash text;
  v_id uuid;
begin
  if p_channel not in ('email','phone','whatsapp') then
    return jsonb_build_object('ok',false,'reason','invalid_channel');
  end if;
  if nullif(btrim(coalesce(p_token_hash,'')),'') is null then
    return jsonb_build_object('ok',false,'reason','token_hash_required');
  end if;

  select * into v_req
  from public.privacy_data_subject_requests
  where id=p_request_id and organization_id=p_organization_id
  for update;
  if not found then return jsonb_build_object('ok',false,'reason','request_not_found'); end if;
  if v_req.status in ('completed','denied','cancelled') then
    return jsonb_build_object('ok',false,'reason','request_closed');
  end if;

  v_person:=v_req.person_id;
  if v_person is null and v_req.lead_id is not null then
    select pl.person_id into v_person
    from public.person_leads pl
    where pl.organization_id=p_organization_id and pl.lead_id=v_req.lead_id;
  end if;
  if v_person is null then
    return jsonb_build_object('ok',false,'reason','subject_identity_unresolved');
  end if;

  if p_channel='email' then
    v_candidate:=lower(btrim(coalesce(v_req.requester_email,'')));
    v_norm:=v_candidate;
    if v_norm='' then return jsonb_build_object('ok',false,'reason','requester_email_required'); end if;
    if not exists(
      select 1 from public.person_identifiers pi
      where pi.organization_id=p_organization_id and pi.person_id=v_person
        and pi.identifier_type='email' and pi.verified
        and lower(pi.normalized_value)=v_norm
    ) then return jsonb_build_object('ok',false,'reason','requester_identifier_not_verified'); end if;
  else
    v_candidate:=regexp_replace(coalesce(v_req.requester_phone,''),'[^0-9]','','g');
    v_norm:=v_candidate;
    if length(v_norm)<8 then return jsonb_build_object('ok',false,'reason','requester_phone_required'); end if;
    if not exists(
      select 1 from public.person_identifiers pi
      where pi.organization_id=p_organization_id and pi.person_id=v_person
        and pi.identifier_type in ('phone','whatsapp') and pi.verified
        and regexp_replace(pi.normalized_value,'[^0-9]','','g')=v_norm
    ) then return jsonb_build_object('ok',false,'reason','requester_identifier_not_verified'); end if;
  end if;

  v_destination_hash:=encode(extensions.digest(v_norm,'sha256'),'hex');

  update public.privacy_verification_challenges
  set used_at=coalesce(used_at,now())
  where organization_id=p_organization_id and request_id=p_request_id
    and used_at is null and expires_at>now();

  insert into public.privacy_verification_challenges(
    organization_id,request_id,channel,destination_hash,token_hash,expires_at
  ) values (
    p_organization_id,p_request_id,p_channel,v_destination_hash,btrim(p_token_hash),
    now()+make_interval(mins=>greatest(2,least(coalesce(p_ttl_minutes,10),60)))
  ) returning id into v_id;

  return jsonb_build_object(
    'ok',true,
    'challenge_id',v_id,
    'channel',p_channel,
    'expires_at',(select expires_at from public.privacy_verification_challenges where id=v_id),
    'destination_last4',right(v_norm,4)
  );
end;
$$;

create or replace function public.verify_privacy_challenge_v1(
  p_organization_id uuid,
  p_request_id uuid,
  p_token_hash text
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_ch public.privacy_verification_challenges%rowtype;
  v_req public.privacy_data_subject_requests%rowtype;
begin
  select * into v_req from public.privacy_data_subject_requests
  where id=p_request_id and organization_id=p_organization_id for update;
  if not found then return jsonb_build_object('ok',false,'reason','request_not_found'); end if;

  select * into v_ch
  from public.privacy_verification_challenges
  where organization_id=p_organization_id and request_id=p_request_id
    and used_at is null
  order by created_at desc
  limit 1
  for update;

  if not found then return jsonb_build_object('ok',false,'reason','challenge_not_found'); end if;
  if v_ch.expires_at<=now() then
    update public.privacy_verification_challenges set used_at=now() where id=v_ch.id;
    return jsonb_build_object('ok',false,'reason','challenge_expired');
  end if;
  if v_ch.attempt_count>=v_ch.max_attempts then
    update public.privacy_verification_challenges set used_at=now() where id=v_ch.id;
    return jsonb_build_object('ok',false,'reason','challenge_attempts_exhausted');
  end if;

  update public.privacy_verification_challenges
  set attempt_count=attempt_count+1
  where id=v_ch.id;

  if btrim(coalesce(p_token_hash,''))<>v_ch.token_hash then
    return jsonb_build_object('ok',false,'reason','invalid_verification_token');
  end if;

  update public.privacy_verification_challenges set used_at=now() where id=v_ch.id;
  update public.privacy_data_subject_requests
  set verification_status='verified',verification_method='otp:'||v_ch.channel,
      verified_at=now(),status=case when status='verifying' then 'in_progress' else status end,
      updated_at=now()
  where id=p_request_id and organization_id=p_organization_id;

  return jsonb_build_object('ok',true,'verified',true,'verification_method','otp:'||v_ch.channel);
end;
$$;

create or replace function public.build_privacy_export_v1(
  p_organization_id uuid,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,extensions,pg_temp
as $$
declare
  v_req public.privacy_data_subject_requests%rowtype;
  v_person uuid;
  v_package jsonb;
  v_manifest jsonb;
  v_hash text;
  v_run uuid;
  v_person_json jsonb;
  v_identifiers jsonb;
  v_leads jsonb;
  v_contacts jsonb;
  v_attribution jsonb;
  v_conversations jsonb;
  v_messages jsonb;
  v_sessions jsonb;
  v_payments jsonb;
  v_enrollments jsonb;
  v_consents jsonb;
  v_requests jsonb;
  v_identity jsonb;
  v_automations jsonb;
  v_event_summary jsonb;
begin
  select * into v_req
  from public.privacy_data_subject_requests
  where id=p_request_id and organization_id=p_organization_id
  for update;
  if not found then return jsonb_build_object('ok',false,'reason','request_not_found'); end if;
  if v_req.request_type not in ('access','portability') then
    return jsonb_build_object('ok',false,'reason','request_type_not_exportable');
  end if;
  if v_req.verification_status<>'verified' or v_req.verified_at is null then
    return jsonb_build_object('ok',false,'reason','identity_not_verified');
  end if;
  if v_req.status in ('denied','cancelled') then
    return jsonb_build_object('ok',false,'reason','request_closed');
  end if;

  v_person:=v_req.person_id;
  if v_person is null and v_req.lead_id is not null then
    select pl.person_id into v_person from public.person_leads pl
    where pl.organization_id=p_organization_id and pl.lead_id=v_req.lead_id;
  end if;
  if v_person is null then return jsonb_build_object('ok',false,'reason','subject_identity_unresolved'); end if;

  select jsonb_build_object('id',p.id,'status',p.status,'created_at',p.created_at,'updated_at',p.updated_at)
  into v_person_json
  from public.persons p where p.id=v_person and p.organization_id=p_organization_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'type',pi.identifier_type,'value',pi.normalized_value,'verified',pi.verified,
    'source_system',pi.source_system,'confidence',pi.confidence,
    'first_seen_at',pi.first_seen_at,'last_seen_at',pi.last_seen_at
  ) order by pi.created_at),'[]'::jsonb)
  into v_identifiers
  from public.person_identifiers pi
  where pi.organization_id=p_organization_id and pi.person_id=v_person;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',l.id,'lead_code',l.lead_code,'first_name',l.first_name,'last_name',l.last_name,
    'display_name',l.display_name,'stage',l.current_stage,'status',l.status,'intent',l.intent,
    'preferred_location',l.preferred_location,'preferred_month',l.preferred_month,
    'preferred_mode',l.preferred_mode,'country',l.country,'timezone',l.timezone,'language',l.language,
    'lead_creation_channel',l.lead_creation_channel,'current_contact_channel',l.current_contact_channel,
    'potential_value',l.potential_value,'potential_currency',l.potential_currency,
    'landing_page',l.landing_page,'lead_origin',l.lead_origin,
    'created_at',l.created_at,'updated_at',l.updated_at
  ) order by l.created_at),'[]'::jsonb)
  into v_leads
  from public.leads l
  join public.person_leads pl on pl.organization_id=l.organization_id and pl.lead_id=l.id
  where l.organization_id=p_organization_id and pl.person_id=v_person;

  select coalesce(jsonb_agg(jsonb_build_object(
    'lead_id',lc.lead_id,'contact_type',lc.contact_type,'value',lc.value,
    'normalized_value',lc.normalized_value,'is_primary',lc.is_primary,'verified',lc.verified,'created_at',lc.created_at
  ) order by lc.created_at),'[]'::jsonb)
  into v_contacts
  from public.lead_contacts lc
  join public.person_leads pl on pl.organization_id=lc.organization_id and pl.lead_id=lc.lead_id
  where lc.organization_id=p_organization_id and pl.person_id=v_person;

  select coalesce(jsonb_agg(jsonb_build_object(
    'lead_id',la.lead_id,'state',la.attribution_state,
    'first_touch_source',la.first_touch_source,'first_touch_medium',la.first_touch_medium,'first_touch_campaign',la.first_touch_campaign,
    'last_touch_source',la.last_touch_source,'last_touch_medium',la.last_touch_medium,'last_touch_campaign',la.last_touch_campaign,
    'lead_creation_source',la.lead_creation_source,'lead_creation_medium',la.lead_creation_medium,'lead_creation_campaign',la.lead_creation_campaign,
    'conversion_source',la.conversion_source,'conversion_medium',la.conversion_medium,'conversion_campaign',la.conversion_campaign,
    'acquisition_locked_at',la.acquisition_locked_at,'conversion_locked_at',la.conversion_locked_at,'updated_at',la.updated_at
  ) order by la.updated_at),'[]'::jsonb)
  into v_attribution
  from public.lead_attribution la
  join public.person_leads pl on pl.organization_id=la.organization_id and pl.lead_id=la.lead_id
  where la.organization_id=p_organization_id and pl.person_id=v_person;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'lead_id',c.lead_id,'channel',c.channel,'status',c.status,
    'started_at',c.started_at,'last_message_at',c.last_message_at
  ) order by c.started_at),'[]'::jsonb)
  into v_conversations
  from public.conversations c
  join public.person_leads pl on pl.organization_id=c.organization_id and pl.lead_id=c.lead_id
  where c.organization_id=p_organization_id and pl.person_id=v_person;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',m.id,'conversation_id',m.conversation_id,'lead_id',m.lead_id,'direction',m.direction,
    'message_type',m.message_type,'body',m.body,'status',m.status,
    'sent_at',m.sent_at,'delivered_at',m.delivered_at,'read_at',m.read_at,'received_at',m.received_at,'created_at',m.created_at
  ) order by m.created_at),'[]'::jsonb)
  into v_messages
  from public.messages m
  join public.person_leads pl on pl.organization_id=m.organization_id and pl.lead_id=m.lead_id
  where m.organization_id=p_organization_id and pl.person_id=v_person;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',ws.id,'started_at',ws.started_at,'ended_at',ws.ended_at,'landing_page',ws.landing_page,'referrer',ws.referrer,
    'utm_source',ws.utm_source,'utm_medium',ws.utm_medium,'utm_campaign',ws.utm_campaign,'utm_content',ws.utm_content,'utm_term',ws.utm_term,
    'gclid',ws.gclid,'gbraid',ws.gbraid,'wbraid',ws.wbraid,'fbclid',ws.fbclid,
    'site',ws.site,'source',ws.source,'medium',ws.medium,'campaign_name',ws.campaign_name
  ) order by ws.started_at),'[]'::jsonb)
  into v_sessions
  from public.web_sessions ws
  left join public.person_sessions ps on ps.organization_id=ws.organization_id and ps.web_session_id=ws.id
  left join public.person_leads pl on pl.organization_id=ws.organization_id and pl.lead_id=ws.lead_id
  where ws.organization_id=p_organization_id and coalesce(ps.person_id,pl.person_id)=v_person;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'lead_id',p.lead_id,'enrollment_id',p.enrollment_id,'provider',p.provider,
    'external_payment_id',p.external_payment_id,'payment_kind',p.payment_kind,'status',p.status,
    'amount',p.amount,'currency',p.currency,'paid_at',p.paid_at,'created_at',p.created_at
  ) order by p.created_at),'[]'::jsonb)
  into v_payments
  from public.payments p
  join public.person_leads pl on pl.organization_id=p.organization_id and pl.lead_id=p.lead_id
  where p.organization_id=p_organization_id and pl.person_id=v_person;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'lead_id',e.lead_id,'course_id',e.course_id,'batch_id',e.batch_id,'status',e.status,
    'total_value',e.total_value,'currency',e.currency,'enrolled_at',e.enrolled_at,'created_at',e.created_at
  ) order by e.created_at),'[]'::jsonb)
  into v_enrollments
  from public.enrollments e
  join public.person_leads pl on pl.organization_id=e.organization_id and pl.lead_id=e.lead_id
  where e.organization_id=p_organization_id and pl.person_id=v_person;

  select coalesce(jsonb_agg(jsonb_build_object(
    'purpose',r.purpose_key,'decision',r.decision,'source',r.source,'notice_version',r.notice_version,
    'occurred_at',r.occurred_at,'received_at',r.received_at
  ) order by r.occurred_at),'[]'::jsonb)
  into v_consents
  from public.privacy_consent_receipts r
  where r.organization_id=p_organization_id and r.person_id=v_person;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',d.id,'request_type',d.request_type,'jurisdiction',d.jurisdiction,'status',d.status,
    'verification_status',d.verification_status,'received_at',d.received_at,'due_at',d.due_at,'completed_at',d.completed_at
  ) order by d.received_at),'[]'::jsonb)
  into v_requests
  from public.privacy_data_subject_requests d
  where d.organization_id=p_organization_id
    and (d.person_id=v_person or exists(
      select 1 from public.person_leads pl where pl.organization_id=p_organization_id and pl.person_id=v_person and pl.lead_id=d.lead_id
    ));

  select coalesce(jsonb_agg(jsonb_build_object(
    'lead_id',i.lead_id,'source_system',i.source_system,'decision',i.decision,
    'selected_score',i.selected_score,'second_best_score',i.second_best_score,
    'candidate_count',i.candidate_count,'created_at',i.created_at
  ) order by i.created_at),'[]'::jsonb)
  into v_identity
  from public.identity_resolution_evaluations i
  join public.person_leads pl on pl.organization_id=i.organization_id and pl.lead_id=i.lead_id
  where i.organization_id=p_organization_id and pl.person_id=v_person;

  select coalesce(jsonb_agg(jsonb_build_object(
    'lead_id',a.lead_id,'workflow_id',a.workflow_id,'status',a.status,
    'flow_version',a.flow_version,'created_at',a.created_at,'updated_at',a.updated_at
  ) order by a.created_at),'[]'::jsonb)
  into v_automations
  from public.automation_enrollments a
  join public.person_leads pl on pl.organization_id=a.organization_id and pl.lead_id=a.lead_id
  where a.organization_id=p_organization_id and pl.person_id=v_person;

  select coalesce(jsonb_agg(jsonb_build_object(
    'source_system',r.source_system,'event_type',r.source_event_type,'occurred_at',r.occurred_at,
    'received_at',r.received_at,'site',r.site,'event_family',r.event_family
  ) order by r.received_at),'[]'::jsonb)
  into v_event_summary
  from public.raw_events r
  where r.organization_id=p_organization_id and (
    r.anonymous_visitor_id in (
      select ws.anonymous_visitor_id from public.web_sessions ws
      left join public.person_sessions ps on ps.organization_id=ws.organization_id and ps.web_session_id=ws.id
      left join public.person_leads pl on pl.organization_id=ws.organization_id and pl.lead_id=ws.lead_id
      where ws.organization_id=p_organization_id and coalesce(ps.person_id,pl.person_id)=v_person
    )
    or (r.metadata->>'lead_id') in (
      select pl.lead_id::text from public.person_leads pl where pl.organization_id=p_organization_id and pl.person_id=v_person
    )
  );

  v_manifest:=jsonb_build_object(
    'version','privacy-export-v1',
    'generated_at',now(),
    'request_id',p_request_id,
    'person_id',v_person,
    'counts',jsonb_build_object(
      'identifiers',jsonb_array_length(v_identifiers),
      'leads',jsonb_array_length(v_leads),
      'contacts',jsonb_array_length(v_contacts),
      'attribution_records',jsonb_array_length(v_attribution),
      'conversations',jsonb_array_length(v_conversations),
      'messages',jsonb_array_length(v_messages),
      'web_sessions',jsonb_array_length(v_sessions),
      'payments',jsonb_array_length(v_payments),
      'enrollments',jsonb_array_length(v_enrollments),
      'consent_receipts',jsonb_array_length(v_consents),
      'privacy_requests',jsonb_array_length(v_requests),
      'identity_evaluations',jsonb_array_length(v_identity),
      'automation_enrollments',jsonb_array_length(v_automations),
      'event_summaries',jsonb_array_length(v_event_summary)
    ),
    'raw_payloads_included',false,
    'third_party_candidate_identity_details_included',false
  );

  v_package:=jsonb_build_object(
    'manifest',v_manifest,
    'data',jsonb_build_object(
      'person',v_person_json,
      'identifiers',v_identifiers,
      'leads',v_leads,
      'contacts',v_contacts,
      'attribution',v_attribution,
      'conversations',v_conversations,
      'messages',v_messages,
      'web_sessions',v_sessions,
      'payments',v_payments,
      'enrollments',v_enrollments,
      'consent_history',v_consents,
      'privacy_requests',v_requests,
      'identity_resolution_summary',v_identity,
      'automation_summary',v_automations,
      'event_summary',v_event_summary
    )
  );

  v_hash:=encode(extensions.digest(v_package::text,'sha256'),'hex');

  insert into public.privacy_export_runs(organization_id,request_id,person_id,package_hash,manifest)
  values(p_organization_id,p_request_id,v_person,v_hash,v_manifest)
  returning id into v_run;

  update public.privacy_data_subject_requests
  set export_generated_at=now(),export_hash=v_hash,export_manifest=v_manifest,
      status=case when request_type='access' then 'completed' else status end,
      completed_at=case when request_type='access' then coalesce(completed_at,now()) else completed_at end,
      updated_at=now()
  where id=p_request_id and organization_id=p_organization_id;

  return jsonb_build_object('ok',true,'export_run_id',v_run,'package_hash',v_hash,'package',v_package);
end;
$$;

create or replace view public.v_privacy_export_health with (security_invoker=true) as
select o.id organization_id,
  count(d.id) filter(where d.request_type in ('access','portability') and d.verification_status='pending' and d.status not in ('completed','denied','cancelled')) as awaiting_verification,
  count(d.id) filter(where d.request_type in ('access','portability') and d.verification_status='verified' and d.export_generated_at is null and d.status not in ('completed','denied','cancelled')) as verified_export_pending,
  count(d.id) filter(where d.export_generated_at>=now()-interval '24 hours') as exports_generated_24h,
  count(e.id) filter(where e.generated_at>=now()-interval '24 hours') as export_runs_24h,
  now() checked_at
from public.organizations o
left join public.privacy_data_subject_requests d on d.organization_id=o.id
left join public.privacy_export_runs e on e.organization_id=o.id and e.request_id=d.id
group by o.id;

revoke all on function public.create_privacy_verification_challenge_v1(uuid,uuid,text,text,integer) from public,anon,authenticated;
revoke all on function public.verify_privacy_challenge_v1(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.build_privacy_export_v1(uuid,uuid) from public,anon,authenticated;
revoke all on function public.privacy_request_verification_guard_v1() from public,anon,authenticated;
grant execute on function public.create_privacy_verification_challenge_v1(uuid,uuid,text,text,integer) to service_role;
grant execute on function public.verify_privacy_challenge_v1(uuid,uuid,text) to service_role;
grant execute on function public.build_privacy_export_v1(uuid,uuid) to service_role;
