-- Privacy compliance core v1
-- Supports privacy-by-design controls for DPDP / GDPR / CCPA-style obligations.
-- This migration provides technical controls; legal applicability and notices remain controller responsibilities.

alter table public.tracking_sources
  add column if not exists privacy_mode text not null default 'strict',
  add column if not exists honor_gpc boolean not null default true,
  add column if not exists require_consent_for_optional boolean not null default true,
  add column if not exists privacy_notice_version text;

alter table public.tracking_sources
  drop constraint if exists tracking_sources_privacy_mode_check;
alter table public.tracking_sources
  add constraint tracking_sources_privacy_mode_check
  check (privacy_mode in ('strict','balanced','custom'));

create table if not exists public.privacy_processing_purposes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  purpose_key text not null,
  name text not null,
  category text not null,
  lawful_basis text not null,
  consent_required boolean not null default false,
  is_optional boolean not null default true,
  honor_gpc boolean not null default false,
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, purpose_key),
  check (category in ('service_delivery','security','analytics','marketing','advertising','sale_sharing','personalization','legal_compliance','other')),
  check (lawful_basis in ('consent','contract','legal_obligation','vital_interests','public_task','legitimate_interests','opt_out','other'))
);

create table if not exists public.privacy_consent_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  person_id uuid references public.persons(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  anonymous_visitor_id text,
  subject_key text not null,
  purpose_key text not null,
  decision text not null,
  source text not null,
  notice_version text,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  evidence jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (decision in ('granted','denied','withdrawn','opted_out','limited')),
  check (person_id is not null or lead_id is not null or anonymous_visitor_id is not null),
  foreign key (organization_id, purpose_key)
    references public.privacy_processing_purposes(organization_id, purpose_key)
    on delete restrict
);

create index if not exists idx_privacy_consent_receipts_subject
  on public.privacy_consent_receipts(organization_id, subject_key, purpose_key, occurred_at desc, created_at desc);
create index if not exists idx_privacy_consent_receipts_person
  on public.privacy_consent_receipts(organization_id, person_id, purpose_key, occurred_at desc)
  where person_id is not null;
create index if not exists idx_privacy_consent_receipts_lead
  on public.privacy_consent_receipts(organization_id, lead_id, purpose_key, occurred_at desc)
  where lead_id is not null;
create index if not exists idx_privacy_consent_receipts_visitor
  on public.privacy_consent_receipts(organization_id, anonymous_visitor_id, purpose_key, occurred_at desc)
  where anonymous_visitor_id is not null;

create table if not exists public.privacy_preferences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subject_key text not null,
  purpose_key text not null,
  current_decision text not null,
  latest_receipt_id uuid not null references public.privacy_consent_receipts(id) on delete restrict,
  effective_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, subject_key, purpose_key),
  check (current_decision in ('granted','denied','withdrawn','opted_out','limited'))
);

create table if not exists public.privacy_data_subject_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_type text not null,
  jurisdiction text,
  person_id uuid references public.persons(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  anonymous_visitor_id text,
  requester_email text,
  requester_phone text,
  status text not null default 'received',
  verification_status text not null default 'pending',
  received_at timestamptz not null default now(),
  due_at timestamptz not null default (now() + interval '30 days'),
  completed_at timestamptz,
  denial_reason text,
  export_location text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (request_type in ('access','correction','deletion','restriction','portability','objection','opt_out_sale_sharing','limit_sensitive','withdraw_consent','grievance','other')),
  check (status in ('received','verifying','in_progress','completed','denied','cancelled')),
  check (verification_status in ('pending','verified','failed','not_required'))
);

create index if not exists idx_privacy_dsr_due
  on public.privacy_data_subject_requests(organization_id, status, due_at)
  where status not in ('completed','denied','cancelled');

create table if not exists public.privacy_retention_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  data_category text not null,
  purpose_key text,
  retention_days integer,
  action text not null default 'review',
  enabled boolean not null default false,
  legal_hold_blocks_action boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, data_category, purpose_key),
  check (retention_days is null or retention_days > 0),
  check (action in ('review','delete','anonymize')),
  foreign key (organization_id, purpose_key)
    references public.privacy_processing_purposes(organization_id, purpose_key)
    on delete restrict
);

create table if not exists public.privacy_legal_holds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  person_id uuid references public.persons(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  reason text not null,
  active boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (person_id is not null or lead_id is not null)
);

-- Seed a privacy-friendly purpose catalog for every organization.
insert into public.privacy_processing_purposes
  (organization_id, purpose_key, name, category, lawful_basis, consent_required, is_optional, honor_gpc)
select o.id, x.purpose_key, x.name, x.category, x.lawful_basis, x.consent_required, x.is_optional, x.honor_gpc
from public.organizations o
cross join (values
  ('service_delivery','Service delivery','service_delivery','contract',false,false,false),
  ('security_fraud','Security and fraud prevention','security','legitimate_interests',false,false,false),
  ('legal_compliance','Legal and regulatory compliance','legal_compliance','legal_obligation',false,false,false),
  ('analytics','Analytics','analytics','consent',true,true,false),
  ('marketing','Marketing communications','marketing','consent',true,true,false),
  ('advertising','Advertising and ad personalization','advertising','consent',true,true,true),
  ('sale_sharing','Sale or sharing for cross-context behavioral advertising','sale_sharing','opt_out',false,true,true),
  ('personalization','Optional personalization','personalization','consent',true,true,false)
) as x(purpose_key,name,category,lawful_basis,consent_required,is_optional,honor_gpc)
on conflict (organization_id, purpose_key) do nothing;

create or replace function public.privacy_subject_key_v1(
  p_person_id uuid,
  p_lead_id uuid,
  p_anonymous_visitor_id text
) returns text
language plpgsql
immutable
as $$
begin
  if p_person_id is not null then return 'person:' || p_person_id::text; end if;
  if p_lead_id is not null then return 'lead:' || p_lead_id::text; end if;
  if nullif(btrim(coalesce(p_anonymous_visitor_id,'')), '') is not null then
    return 'visitor:' || btrim(p_anonymous_visitor_id);
  end if;
  raise exception 'privacy subject identifier required';
end;
$$;

create or replace function public.record_privacy_preference_v1(
  p_organization_id uuid,
  p_purpose_key text,
  p_decision text,
  p_source text,
  p_occurred_at timestamptz,
  p_person_id uuid default null,
  p_lead_id uuid default null,
  p_anonymous_visitor_id text default null,
  p_notice_version text default null,
  p_evidence jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_subject_key text;
  v_receipt_id uuid;
begin
  if p_decision not in ('granted','denied','withdrawn','opted_out','limited') then
    raise exception 'invalid privacy decision';
  end if;

  if not exists (
    select 1 from public.privacy_processing_purposes
    where organization_id = p_organization_id
      and purpose_key = p_purpose_key
      and enabled
  ) then
    raise exception 'unknown or disabled privacy purpose';
  end if;

  if p_person_id is not null and not exists (
    select 1 from public.persons where id=p_person_id and organization_id=p_organization_id
  ) then raise exception 'person tenant mismatch'; end if;

  if p_lead_id is not null and not exists (
    select 1 from public.leads where id=p_lead_id and organization_id=p_organization_id
  ) then raise exception 'lead tenant mismatch'; end if;

  v_subject_key := public.privacy_subject_key_v1(p_person_id,p_lead_id,p_anonymous_visitor_id);

  insert into public.privacy_consent_receipts(
    organization_id, person_id, lead_id, anonymous_visitor_id, subject_key,
    purpose_key, decision, source, notice_version, occurred_at, evidence, metadata
  ) values (
    p_organization_id,p_person_id,p_lead_id,nullif(btrim(coalesce(p_anonymous_visitor_id,'')),''),v_subject_key,
    p_purpose_key,p_decision,coalesce(nullif(btrim(p_source),''),'system'),p_notice_version,
    coalesce(p_occurred_at,now()),coalesce(p_evidence,'{}'::jsonb),coalesce(p_metadata,'{}'::jsonb)
  ) returning id into v_receipt_id;

  insert into public.privacy_preferences(
    organization_id,subject_key,purpose_key,current_decision,latest_receipt_id,effective_at,updated_at
  ) values (
    p_organization_id,v_subject_key,p_purpose_key,p_decision,v_receipt_id,coalesce(p_occurred_at,now()),now()
  )
  on conflict (organization_id,subject_key,purpose_key) do update
  set current_decision = case
        when excluded.effective_at >= public.privacy_preferences.effective_at then excluded.current_decision
        else public.privacy_preferences.current_decision end,
      latest_receipt_id = case
        when excluded.effective_at >= public.privacy_preferences.effective_at then excluded.latest_receipt_id
        else public.privacy_preferences.latest_receipt_id end,
      effective_at = greatest(public.privacy_preferences.effective_at, excluded.effective_at),
      updated_at = now();

  return v_receipt_id;
end;
$$;

create or replace function public.privacy_effective_permission_v1(
  p_organization_id uuid,
  p_purpose_key text,
  p_person_id uuid default null,
  p_lead_id uuid default null,
  p_anonymous_visitor_id text default null,
  p_gpc boolean default false
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_purpose public.privacy_processing_purposes;
  v_receipt public.privacy_consent_receipts;
  v_allowed boolean;
  v_reason text;
begin
  select * into v_purpose
  from public.privacy_processing_purposes
  where organization_id=p_organization_id and purpose_key=p_purpose_key and enabled;

  if not found then
    return jsonb_build_object('allowed',false,'reason','unknown_or_disabled_purpose');
  end if;

  if coalesce(p_gpc,false) and v_purpose.honor_gpc then
    return jsonb_build_object(
      'allowed',false,'reason','global_privacy_control','purpose',p_purpose_key,
      'lawful_basis',v_purpose.lawful_basis
    );
  end if;

  select r.* into v_receipt
  from public.privacy_consent_receipts r
  where r.organization_id=p_organization_id
    and r.purpose_key=p_purpose_key
    and (
      (p_person_id is not null and r.person_id=p_person_id)
      or (p_lead_id is not null and r.lead_id=p_lead_id)
      or (nullif(btrim(coalesce(p_anonymous_visitor_id,'')),'') is not null and r.anonymous_visitor_id=btrim(p_anonymous_visitor_id))
    )
  order by r.occurred_at desc, r.created_at desc
  limit 1;

  if found then
    v_allowed := v_receipt.decision = 'granted';
    v_reason := 'explicit_' || v_receipt.decision;
  elsif v_purpose.consent_required then
    v_allowed := false;
    v_reason := 'consent_missing';
  elsif v_purpose.lawful_basis = 'opt_out' then
    v_allowed := true;
    v_reason := 'no_opt_out_recorded';
  else
    v_allowed := true;
    v_reason := 'configured_lawful_basis';
  end if;

  return jsonb_build_object(
    'allowed',v_allowed,
    'reason',v_reason,
    'purpose',p_purpose_key,
    'lawful_basis',v_purpose.lawful_basis,
    'consent_required',v_purpose.consent_required,
    'latest_decision',case when v_receipt.id is null then null else v_receipt.decision end,
    'latest_receipt_id',v_receipt.id
  );
end;
$$;

create or replace function public.privacy_purpose_for_event_v1(p_event_name text)
returns text
language sql
immutable
as $$
select case
  when lower(coalesce(p_event_name,'')) in ('page_view','form_start','cta_click','instagram_click','whatsapp_click','enrollment_cta_click') then 'analytics'
  when lower(coalesce(p_event_name,'')) like 'web.%' and lower(p_event_name) not in ('web.form_submitted','web.lead_submitted') then 'analytics'
  when lower(coalesce(p_event_name,'')) like 'marketing.%' then 'marketing'
  when lower(coalesce(p_event_name,'')) like 'ad.%' then 'advertising'
  when lower(coalesce(p_event_name,'')) like 'lead.%' then 'service_delivery'
  when lower(coalesce(p_event_name,'')) like 'message.%' then 'service_delivery'
  when lower(coalesce(p_event_name,'')) like 'conversation.%' then 'service_delivery'
  when lower(coalesce(p_event_name,'')) like 'booking.%' then 'service_delivery'
  when lower(coalesce(p_event_name,'')) like 'payment.%' then 'service_delivery'
  when lower(coalesce(p_event_name,'')) like 'enrollment.%' then 'service_delivery'
  when lower(coalesce(p_event_name,'')) in ('lead_form_submit','form_submit','meta_lead_created','instagram_dm_started','whatsapp_started') then 'service_delivery'
  else 'service_delivery'
end
$$;

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
set search_path = public, auth, pg_temp
as $$
declare
  v_purpose text;
  v_result jsonb;
begin
  v_purpose := public.privacy_purpose_for_event_v1(p_event_name);
  v_result := public.privacy_effective_permission_v1(
    p_organization_id,v_purpose,p_person_id,p_lead_id,p_anonymous_visitor_id,p_gpc
  );
  return v_result || jsonb_build_object('event_name',p_event_name,'mapped_purpose',v_purpose);
end;
$$;

create or replace function public.sync_tracking_consent_to_privacy_v1()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if new.anonymous_visitor_id is null then return new; end if;

  if new.consent_analytics is not null then
    perform public.record_privacy_preference_v1(
      new.organization_id,'analytics',case when new.consent_analytics then 'granted' else 'denied' end,
      new.consent_source,new.occurred_at,null,null,new.anonymous_visitor_id,null,
      jsonb_build_object('tracking_consent_event_id',new.id,'consent_mode',new.consent_mode),new.metadata
    );
  end if;

  if new.consent_marketing is not null then
    perform public.record_privacy_preference_v1(
      new.organization_id,'marketing',case when new.consent_marketing then 'granted' else 'denied' end,
      new.consent_source,new.occurred_at,null,null,new.anonymous_visitor_id,null,
      jsonb_build_object('tracking_consent_event_id',new.id,'consent_mode',new.consent_mode),new.metadata
    );
  end if;

  if new.consent_ad_personalization is not null then
    perform public.record_privacy_preference_v1(
      new.organization_id,'advertising',case when new.consent_ad_personalization then 'granted' else 'denied' end,
      new.consent_source,new.occurred_at,null,null,new.anonymous_visitor_id,null,
      jsonb_build_object('tracking_consent_event_id',new.id,'consent_mode',new.consent_mode),new.metadata
    );
  end if;

  if new.consent_ad_user_data is not null then
    perform public.record_privacy_preference_v1(
      new.organization_id,'sale_sharing',case when new.consent_ad_user_data then 'granted' else 'opted_out' end,
      new.consent_source,new.occurred_at,null,null,new.anonymous_visitor_id,null,
      jsonb_build_object('tracking_consent_event_id',new.id,'consent_mode',new.consent_mode),new.metadata
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_tracking_consent_to_privacy_v1 on public.tracking_consent_events;
create trigger trg_tracking_consent_to_privacy_v1
after insert on public.tracking_consent_events
for each row execute function public.sync_tracking_consent_to_privacy_v1();

-- Backfill existing consent history into the normalized privacy ledger once.
insert into public.privacy_consent_receipts(
  organization_id,anonymous_visitor_id,subject_key,purpose_key,decision,source,notice_version,occurred_at,evidence,metadata
)
select t.organization_id,t.anonymous_visitor_id,'visitor:'||t.anonymous_visitor_id,x.purpose_key,x.decision,
       t.consent_source,null,t.occurred_at,
       jsonb_build_object('tracking_consent_event_id',t.id,'consent_mode',t.consent_mode,'backfilled',true),t.metadata
from public.tracking_consent_events t
cross join lateral (values
  ('analytics', case when t.consent_analytics is null then null when t.consent_analytics then 'granted' else 'denied' end),
  ('marketing', case when t.consent_marketing is null then null when t.consent_marketing then 'granted' else 'denied' end),
  ('advertising', case when t.consent_ad_personalization is null then null when t.consent_ad_personalization then 'granted' else 'denied' end),
  ('sale_sharing', case when t.consent_ad_user_data is null then null when t.consent_ad_user_data then 'granted' else 'opted_out' end)
) x(purpose_key,decision)
where t.anonymous_visitor_id is not null
  and x.decision is not null
  and not exists (
    select 1 from public.privacy_consent_receipts r
    where r.organization_id=t.organization_id
      and r.evidence->>'tracking_consent_event_id'=t.id::text
      and r.purpose_key=x.purpose_key
  );

insert into public.privacy_preferences(organization_id,subject_key,purpose_key,current_decision,latest_receipt_id,effective_at,updated_at)
select distinct on (r.organization_id,r.subject_key,r.purpose_key)
  r.organization_id,r.subject_key,r.purpose_key,r.decision,r.id,r.occurred_at,now()
from public.privacy_consent_receipts r
order by r.organization_id,r.subject_key,r.purpose_key,r.occurred_at desc,r.created_at desc
on conflict (organization_id,subject_key,purpose_key) do update
set current_decision=excluded.current_decision,
    latest_receipt_id=excluded.latest_receipt_id,
    effective_at=excluded.effective_at,
    updated_at=now();

create or replace view public.v_privacy_compliance_health
with (security_invoker=true)
as
select o.id as organization_id,
  (select count(*) from public.privacy_processing_purposes p where p.organization_id=o.id and p.enabled) as enabled_purposes,
  (select count(*) from public.tracking_sources s where s.organization_id=o.id and s.status='active' and s.privacy_mode='strict') as strict_tracking_sources,
  (select count(*) from public.tracking_sources s where s.organization_id=o.id and s.status='active' and not s.honor_gpc) as active_sources_not_honoring_gpc,
  (select count(*) from public.privacy_data_subject_requests d where d.organization_id=o.id and d.status not in ('completed','denied','cancelled') and d.due_at < now()) as overdue_subject_requests,
  (select count(*) from public.privacy_retention_policies rp where rp.organization_id=o.id and rp.enabled) as enabled_retention_policies,
  (select count(*) from public.privacy_legal_holds h where h.organization_id=o.id and h.active and (h.ends_at is null or h.ends_at > now())) as active_legal_holds,
  now() as checked_at
from public.organizations o;

-- RLS: tenant members can read privacy configuration/status. Mutations are expected through server-side/admin paths.
alter table public.privacy_processing_purposes enable row level security;
alter table public.privacy_consent_receipts enable row level security;
alter table public.privacy_preferences enable row level security;
alter table public.privacy_data_subject_requests enable row level security;
alter table public.privacy_retention_policies enable row level security;
alter table public.privacy_legal_holds enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'privacy_processing_purposes','privacy_consent_receipts','privacy_preferences',
    'privacy_data_subject_requests','privacy_retention_policies','privacy_legal_holds'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_member_read', t);
    execute format(
      'create policy %I on public.%I for select using (exists (select 1 from public.organization_members m where m.organization_id = organization_id and m.user_id = auth.uid() and m.active))',
      t || '_member_read', t
    );
  end loop;
end $$;

revoke all on function public.record_privacy_preference_v1(uuid,text,text,text,timestamptz,uuid,uuid,text,text,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.privacy_effective_permission_v1(uuid,text,uuid,uuid,text,boolean) from public, anon, authenticated;
revoke all on function public.privacy_gate_tracking_event_v1(uuid,text,uuid,uuid,text,boolean) from public, anon, authenticated;
grant execute on function public.record_privacy_preference_v1(uuid,text,text,text,timestamptz,uuid,uuid,text,text,jsonb,jsonb) to service_role;
grant execute on function public.privacy_effective_permission_v1(uuid,text,uuid,uuid,text,boolean) to service_role;
grant execute on function public.privacy_gate_tracking_event_v1(uuid,text,uuid,uuid,text,boolean) to service_role;
