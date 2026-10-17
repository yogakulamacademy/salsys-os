-- Privacy rights automation v1

create table if not exists public.privacy_subject_restrictions (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  person_id uuid references public.persons(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  anonymous_visitor_id text,
  block_optional_tracking boolean not null default false,
  block_marketing boolean not null default false,
  block_profiling boolean not null default false,
  block_ad_exports boolean not null default false,
  restrict_processing boolean not null default false,
  reason text not null,
  source_request_id uuid references public.privacy_data_subject_requests(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (person_id is not null or lead_id is not null or anonymous_visitor_id is not null)
);

create unique index if not exists uq_privacy_subject_restrictions_person
  on public.privacy_subject_restrictions(organization_id,person_id)
  where person_id is not null and active;
create unique index if not exists uq_privacy_subject_restrictions_lead
  on public.privacy_subject_restrictions(organization_id,lead_id)
  where lead_id is not null and active;
create unique index if not exists uq_privacy_subject_restrictions_visitor
  on public.privacy_subject_restrictions(organization_id,anonymous_visitor_id)
  where anonymous_visitor_id is not null and active;

alter table public.privacy_subject_restrictions enable row level security;
drop policy if exists privacy_subject_restrictions_member_read on public.privacy_subject_restrictions;
create policy privacy_subject_restrictions_member_read on public.privacy_subject_restrictions
for select using (
  exists (
    select 1 from public.organization_members m
    where m.organization_id=privacy_subject_restrictions.organization_id
      and m.user_id=auth.uid() and m.active
  )
);

create or replace function public.privacy_subject_is_verified_v1(
  p_organization_id uuid,
  p_person_id uuid default null,
  p_lead_id uuid default null
) returns boolean
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
declare v_person uuid;
begin
  if p_person_id is not null then
    if not exists(select 1 from public.persons where id=p_person_id and organization_id=p_organization_id) then return false; end if;
    v_person:=p_person_id;
  elsif p_lead_id is not null then
    select pl.person_id into v_person
    from public.person_leads pl
    where pl.organization_id=p_organization_id and pl.lead_id=p_lead_id;
  end if;
  if v_person is null then return false; end if;
  return exists(
    select 1 from public.person_identifiers pi
    where pi.organization_id=p_organization_id
      and pi.person_id=v_person
      and pi.verified
      and pi.identifier_type in ('email','phone','whatsapp','instagram_user_id')
  );
end;
$$;

create or replace function public.intake_privacy_request_v1(
  p_organization_id uuid,
  p_request_type text,
  p_jurisdiction text default null,
  p_person_id uuid default null,
  p_lead_id uuid default null,
  p_anonymous_visitor_id text default null,
  p_requester_email text default null,
  p_requester_phone text default null,
  p_source text default 'privacy_portal',
  p_purpose_key text default null,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_id uuid;
  v_verified boolean;
  v_due_days integer:=30;
  v_status text;
  v_receipt uuid;
begin
  if p_request_type not in ('access','correction','deletion','restriction','portability','objection','opt_out_sale_sharing','limit_sensitive','withdraw_consent','grievance','other') then
    raise exception 'invalid privacy request type';
  end if;

  if p_person_id is not null and not exists(select 1 from public.persons where id=p_person_id and organization_id=p_organization_id) then raise exception 'person tenant mismatch'; end if;
  if p_lead_id is not null and not exists(select 1 from public.leads where id=p_lead_id and organization_id=p_organization_id) then raise exception 'lead tenant mismatch'; end if;

  v_verified:=public.privacy_subject_is_verified_v1(p_organization_id,p_person_id,p_lead_id);
  v_status:=case when v_verified then 'in_progress' else 'verifying' end;

  insert into public.privacy_data_subject_requests(
    organization_id,request_type,jurisdiction,person_id,lead_id,anonymous_visitor_id,
    requester_email,requester_phone,status,verification_status,due_at,metadata
  ) values (
    p_organization_id,p_request_type,nullif(btrim(coalesce(p_jurisdiction,'')),''),p_person_id,p_lead_id,
    nullif(btrim(coalesce(p_anonymous_visitor_id,'')),''),nullif(btrim(coalesce(p_requester_email,'')),''),
    nullif(btrim(coalesce(p_requester_phone,'')),''),v_status,case when v_verified then 'verified' else 'pending' end,
    now()+(v_due_days||' days')::interval,
    coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('source',p_source,'internal_sla_days',v_due_days)
  ) returning id into v_id;

  -- Rights that can be honored immediately without destructive deletion.
  if p_request_type='opt_out_sale_sharing' then
    v_receipt:=public.record_privacy_preference_v1(
      p_organization_id,'sale_sharing','opted_out',p_source,now(),p_person_id,p_lead_id,p_anonymous_visitor_id,null,
      jsonb_build_object('privacy_request_id',v_id,'jurisdiction',p_jurisdiction),'{}'::jsonb
    );
  elsif p_request_type='withdraw_consent' and p_purpose_key is not null then
    v_receipt:=public.record_privacy_preference_v1(
      p_organization_id,p_purpose_key,'withdrawn',p_source,now(),p_person_id,p_lead_id,p_anonymous_visitor_id,null,
      jsonb_build_object('privacy_request_id',v_id,'jurisdiction',p_jurisdiction),'{}'::jsonb
    );
  end if;

  if p_request_type in ('deletion','restriction','objection','limit_sensitive','opt_out_sale_sharing') then
    -- Never delete automatically at intake. Immediately reduce processing while verification/legal-hold checks continue.
    insert into public.privacy_subject_restrictions(
      organization_id,person_id,lead_id,anonymous_visitor_id,
      block_optional_tracking,block_marketing,block_profiling,block_ad_exports,restrict_processing,
      reason,source_request_id,active
    ) values (
      p_organization_id,p_person_id,p_lead_id,nullif(btrim(coalesce(p_anonymous_visitor_id,'')),''),
      true,
      p_request_type in ('deletion','restriction','objection'),
      true,true,
      p_request_type in ('deletion','restriction'),
      'privacy_request:'||p_request_type,v_id,true
    )
    on conflict do nothing;
  end if;

  return jsonb_build_object(
    'request_id',v_id,
    'status',v_status,
    'verification_status',case when v_verified then 'verified' else 'pending' end,
    'due_at',(select due_at from public.privacy_data_subject_requests where id=v_id),
    'immediate_preference_receipt_id',v_receipt,
    'processing_reduced',p_request_type in ('deletion','restriction','objection','limit_sensitive','opt_out_sale_sharing')
  );
end;
$$;

create or replace function public.privacy_subject_restriction_v1(
  p_organization_id uuid,
  p_person_id uuid default null,
  p_lead_id uuid default null,
  p_anonymous_visitor_id text default null
) returns jsonb
language sql
stable
security definer
set search_path=public,auth,pg_temp
as $$
select coalesce(
  (
    select jsonb_build_object(
      'active',true,
      'block_optional_tracking',bool_or(r.block_optional_tracking),
      'block_marketing',bool_or(r.block_marketing),
      'block_profiling',bool_or(r.block_profiling),
      'block_ad_exports',bool_or(r.block_ad_exports),
      'restrict_processing',bool_or(r.restrict_processing),
      'reasons',jsonb_agg(distinct r.reason)
    )
    from public.privacy_subject_restrictions r
    where r.organization_id=p_organization_id and r.active and (
      (p_person_id is not null and r.person_id=p_person_id) or
      (p_lead_id is not null and r.lead_id=p_lead_id) or
      (nullif(btrim(coalesce(p_anonymous_visitor_id,'')),'') is not null and r.anonymous_visitor_id=btrim(p_anonymous_visitor_id))
    )
  ),
  jsonb_build_object('active',false,'block_optional_tracking',false,'block_marketing',false,'block_profiling',false,'block_ad_exports',false,'restrict_processing',false,'reasons','[]'::jsonb)
)
$$;

-- Upgrade the event gate so active restrictions override purpose permissions.
create or replace function public.privacy_gate_tracking_event_v1(
  p_organization_id uuid,
  p_event_name text,
  p_person_id uuid default null,
  p_lead_id uuid default null,
  p_anonymous_visitor_id text default null,
  p_gpc boolean default false
) returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_purpose text;
  v_result jsonb;
  v_restriction jsonb;
begin
  v_purpose:=public.privacy_purpose_for_event_v1(p_event_name);
  v_restriction:=public.privacy_subject_restriction_v1(p_organization_id,p_person_id,p_lead_id,p_anonymous_visitor_id);

  if coalesce((v_restriction->>'restrict_processing')::boolean,false) and v_purpose not in ('legal_compliance','security_fraud') then
    return jsonb_build_object('allowed',false,'reason','subject_processing_restricted','event_name',p_event_name,'mapped_purpose',v_purpose,'restriction',v_restriction);
  end if;
  if coalesce((v_restriction->>'block_optional_tracking')::boolean,false) and v_purpose in ('analytics','marketing','advertising','sale_sharing','personalization') then
    return jsonb_build_object('allowed',false,'reason','subject_optional_processing_blocked','event_name',p_event_name,'mapped_purpose',v_purpose,'restriction',v_restriction);
  end if;

  v_result:=public.privacy_effective_permission_v1(p_organization_id,v_purpose,p_person_id,p_lead_id,p_anonymous_visitor_id,p_gpc);
  return v_result||jsonb_build_object('event_name',p_event_name,'mapped_purpose',v_purpose,'restriction',v_restriction);
end;
$$;

create or replace view public.v_privacy_rights_health with (security_invoker=true) as
select o.id organization_id,
  count(d.id) filter(where d.status not in ('completed','denied','cancelled')) as open_requests,
  count(d.id) filter(where d.status not in ('completed','denied','cancelled') and d.due_at<now()) as overdue_requests,
  count(d.id) filter(where d.verification_status='pending') as pending_verification,
  (select count(*) from public.privacy_subject_restrictions r where r.organization_id=o.id and r.active) as active_restrictions,
  now() checked_at
from public.organizations o
left join public.privacy_data_subject_requests d on d.organization_id=o.id
group by o.id;

revoke all on function public.intake_privacy_request_v1(uuid,text,text,uuid,uuid,text,text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.privacy_subject_restriction_v1(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.privacy_subject_is_verified_v1(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.intake_privacy_request_v1(uuid,text,text,uuid,uuid,text,text,text,text,text,jsonb) to service_role;
grant execute on function public.privacy_subject_restriction_v1(uuid,uuid,uuid,text) to service_role;
grant execute on function public.privacy_subject_is_verified_v1(uuid,uuid,uuid) to service_role;
