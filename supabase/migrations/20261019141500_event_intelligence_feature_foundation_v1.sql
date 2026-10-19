begin;

create table if not exists public.event_intelligence_feature_state (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subject_type text not null,
  subject_key text not null,
  subject_id uuid,
  feature_family text not null,
  feature_version text not null default 'v1',
  feature_payload jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  feature_hash text not null,
  revision integer not null default 1 check (revision >= 1),
  observed_at timestamptz not null default now(),
  window_start timestamptz,
  window_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,subject_type,subject_key,feature_family),
  check (subject_type ~ '^[a-z][a-z0-9_]{0,63}$'),
  check (feature_family ~ '^[a-z][a-z0-9_]{0,63}$')
);

create index if not exists idx_event_intelligence_feature_state_org_family
  on public.event_intelligence_feature_state(organization_id,feature_family,updated_at desc);
create index if not exists idx_event_intelligence_feature_state_subject_id
  on public.event_intelligence_feature_state(organization_id,subject_type,subject_id)
  where subject_id is not null;

create table if not exists public.event_intelligence_feature_history (
  id uuid primary key default gen_random_uuid(),
  feature_state_id uuid not null references public.event_intelligence_feature_state(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subject_type text not null,
  subject_key text not null,
  subject_id uuid,
  feature_family text not null,
  feature_version text not null,
  feature_payload jsonb not null,
  evidence jsonb not null default '{}'::jsonb,
  feature_hash text not null,
  revision integer not null check (revision >= 1),
  observed_at timestamptz not null,
  window_start timestamptz,
  window_end timestamptz,
  created_at timestamptz not null default now(),
  unique (feature_state_id,revision)
);

create index if not exists idx_event_intelligence_feature_history_subject
  on public.event_intelligence_feature_history(organization_id,subject_type,subject_key,feature_family,observed_at desc);

create table if not exists public.event_intelligence_predictions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subject_type text not null,
  subject_key text not null,
  subject_id uuid,
  prediction_type text not null,
  model_key text not null,
  model_version text not null,
  model_mode text not null default 'deterministic',
  feature_state_id uuid references public.event_intelligence_feature_state(id) on delete set null,
  score numeric,
  probability numeric,
  confidence_low numeric,
  confidence_high numeric,
  confidence_band text,
  reason_codes text[] not null default '{}'::text[],
  explanation jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  generated_at timestamptz not null default now(),
  expires_at timestamptz,
  actual_outcome text,
  actual_outcome_value jsonb,
  outcome_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (subject_type ~ '^[a-z][a-z0-9_]{0,63}$'),
  check (prediction_type ~ '^[a-z][a-z0-9_]{0,79}$'),
  check (model_mode in ('deterministic','statistical','ml','ai_synthesis')),
  check (status in ('active','superseded','expired','observed')),
  check (score is null or (score >= 0 and score <= 1)),
  check (probability is null or (probability >= 0 and probability <= 1)),
  check (confidence_low is null or (confidence_low >= 0 and confidence_low <= 1)),
  check (confidence_high is null or (confidence_high >= 0 and confidence_high <= 1))
);

create index if not exists idx_event_intelligence_predictions_subject
  on public.event_intelligence_predictions(organization_id,subject_type,subject_key,prediction_type,generated_at desc);
create index if not exists idx_event_intelligence_predictions_active
  on public.event_intelligence_predictions(organization_id,prediction_type,generated_at desc)
  where status='active';

create table if not exists public.event_intelligence_prediction_outcomes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  prediction_id uuid not null references public.event_intelligence_predictions(id) on delete cascade,
  outcome_key text not null,
  outcome_value jsonb not null default '{}'::jsonb,
  raw_event_id uuid references public.raw_events(id) on delete set null,
  occurred_at timestamptz not null,
  source text not null default 'system',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_event_intelligence_prediction_outcomes_prediction
  on public.event_intelligence_prediction_outcomes(organization_id,prediction_id,occurred_at desc);

alter table public.event_intelligence_feature_state enable row level security;
alter table public.event_intelligence_feature_history enable row level security;
alter table public.event_intelligence_predictions enable row level security;
alter table public.event_intelligence_prediction_outcomes enable row level security;

revoke all on public.event_intelligence_feature_state from anon,authenticated;
revoke all on public.event_intelligence_feature_history from anon,authenticated;
revoke all on public.event_intelligence_predictions from anon,authenticated;
revoke all on public.event_intelligence_prediction_outcomes from anon,authenticated;

grant select on public.event_intelligence_feature_state to authenticated;
grant select on public.event_intelligence_feature_history to authenticated;
grant select on public.event_intelligence_predictions to authenticated;
grant select on public.event_intelligence_prediction_outcomes to authenticated;
grant select,insert,update,delete on public.event_intelligence_feature_state to service_role;
grant select,insert,update,delete on public.event_intelligence_feature_history to service_role;
grant select,insert,update,delete on public.event_intelligence_predictions to service_role;
grant select,insert,update,delete on public.event_intelligence_prediction_outcomes to service_role;

drop policy if exists event_intelligence_feature_state_member_select on public.event_intelligence_feature_state;
create policy event_intelligence_feature_state_member_select on public.event_intelligence_feature_state
for select to authenticated using (public.is_organization_member(organization_id));

drop policy if exists event_intelligence_feature_history_member_select on public.event_intelligence_feature_history;
create policy event_intelligence_feature_history_member_select on public.event_intelligence_feature_history
for select to authenticated using (public.is_organization_member(organization_id));

drop policy if exists event_intelligence_predictions_member_select on public.event_intelligence_predictions;
create policy event_intelligence_predictions_member_select on public.event_intelligence_predictions
for select to authenticated using (public.is_organization_member(organization_id));

drop policy if exists event_intelligence_prediction_outcomes_member_select on public.event_intelligence_prediction_outcomes;
create policy event_intelligence_prediction_outcomes_member_select on public.event_intelligence_prediction_outcomes
for select to authenticated using (public.is_organization_member(organization_id));

create or replace function public.normalize_event_intelligence_url_v1(p_value text)
returns text
language sql
immutable
as $function$
select nullif(
  regexp_replace(regexp_replace(btrim(coalesce(p_value,'')),'[?#].*$',''),'/+$',''),
  ''
);
$function$;

create or replace function public.upsert_event_intelligence_feature_v1(
  p_organization_id uuid,
  p_subject_type text,
  p_subject_key text,
  p_subject_id uuid,
  p_feature_family text,
  p_feature_version text,
  p_feature_payload jsonb,
  p_evidence jsonb default '{}'::jsonb,
  p_observed_at timestamptz default now(),
  p_window_start timestamptz default null,
  p_window_end timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public,pg_temp
as $function$
declare
  v_state public.event_intelligence_feature_state%rowtype;
  v_hash text;
  v_changed boolean := false;
begin
  if p_organization_id is null then raise exception 'organization_id is required'; end if;
  if not exists (select 1 from public.organizations where id=p_organization_id) then raise exception 'organization not found'; end if;
  if nullif(btrim(coalesce(p_subject_type,'')),'') is null then raise exception 'subject_type is required'; end if;
  if nullif(btrim(coalesce(p_subject_key,'')),'') is null then raise exception 'subject_key is required'; end if;
  if nullif(btrim(coalesce(p_feature_family,'')),'') is null then raise exception 'feature_family is required'; end if;

  v_hash := md5(coalesce(p_feature_payload,'{}'::jsonb)::text);
  perform pg_advisory_xact_lock(hashtextextended(
    'event-intelligence-feature:'||p_organization_id::text||':'||lower(btrim(p_subject_type))||':'||btrim(p_subject_key)||':'||lower(btrim(p_feature_family)),0
  ));

  select * into v_state
  from public.event_intelligence_feature_state
  where organization_id=p_organization_id
    and subject_type=lower(btrim(p_subject_type))
    and subject_key=btrim(p_subject_key)
    and feature_family=lower(btrim(p_feature_family))
  for update;

  if v_state.id is null then
    insert into public.event_intelligence_feature_state(
      organization_id,subject_type,subject_key,subject_id,feature_family,feature_version,
      feature_payload,evidence,feature_hash,revision,observed_at,window_start,window_end
    ) values (
      p_organization_id,lower(btrim(p_subject_type)),btrim(p_subject_key),p_subject_id,lower(btrim(p_feature_family)),coalesce(nullif(btrim(p_feature_version),''),'v1'),
      coalesce(p_feature_payload,'{}'::jsonb),coalesce(p_evidence,'{}'::jsonb),v_hash,1,coalesce(p_observed_at,now()),p_window_start,p_window_end
    ) returning * into v_state;
    v_changed := true;
  elsif v_state.feature_hash is distinct from v_hash
     or v_state.feature_version is distinct from coalesce(nullif(btrim(p_feature_version),''),'v1') then
    update public.event_intelligence_feature_state
    set subject_id=coalesce(p_subject_id,subject_id),
        feature_version=coalesce(nullif(btrim(p_feature_version),''),'v1'),
        feature_payload=coalesce(p_feature_payload,'{}'::jsonb),
        evidence=coalesce(p_evidence,'{}'::jsonb),
        feature_hash=v_hash,
        revision=revision+1,
        observed_at=coalesce(p_observed_at,now()),
        window_start=p_window_start,
        window_end=p_window_end,
        updated_at=now()
    where id=v_state.id
    returning * into v_state;
    v_changed := true;
  else
    update public.event_intelligence_feature_state
    set subject_id=coalesce(p_subject_id,subject_id),
        evidence=coalesce(p_evidence,evidence),
        observed_at=greatest(observed_at,coalesce(p_observed_at,now())),
        window_start=coalesce(p_window_start,window_start),
        window_end=coalesce(p_window_end,window_end),
        updated_at=now()
    where id=v_state.id
    returning * into v_state;
  end if;

  if v_changed then
    insert into public.event_intelligence_feature_history(
      feature_state_id,organization_id,subject_type,subject_key,subject_id,feature_family,feature_version,
      feature_payload,evidence,feature_hash,revision,observed_at,window_start,window_end
    ) values (
      v_state.id,v_state.organization_id,v_state.subject_type,v_state.subject_key,v_state.subject_id,v_state.feature_family,v_state.feature_version,
      v_state.feature_payload,v_state.evidence,v_state.feature_hash,v_state.revision,v_state.observed_at,v_state.window_start,v_state.window_end
    ) on conflict (feature_state_id,revision) do nothing;
  end if;

  return jsonb_build_object('ok',true,'feature_state_id',v_state.id,'changed',v_changed,'revision',v_state.revision,'feature_hash',v_state.feature_hash);
end;
$function$;

create or replace function public.record_event_intelligence_prediction_v1(
  p_organization_id uuid,p_subject_type text,p_subject_key text,p_subject_id uuid,
  p_prediction_type text,p_model_key text,p_model_version text,p_model_mode text,
  p_feature_state_id uuid,p_score numeric,p_probability numeric,p_confidence_low numeric,p_confidence_high numeric,
  p_confidence_band text,p_reason_codes text[],p_explanation jsonb,p_evidence jsonb,
  p_generated_at timestamptz default now(),p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public,pg_temp
as $function$
declare v_id uuid;
begin
  if p_organization_id is null then raise exception 'organization_id is required'; end if;
  if nullif(btrim(coalesce(p_subject_type,'')),'') is null or nullif(btrim(coalesce(p_subject_key,'')),'') is null then raise exception 'prediction subject is required'; end if;
  if nullif(btrim(coalesce(p_prediction_type,'')),'') is null then raise exception 'prediction_type is required'; end if;
  if p_model_mode not in ('deterministic','statistical','ml','ai_synthesis') then raise exception 'invalid model_mode'; end if;
  if p_feature_state_id is not null and not exists (
    select 1 from public.event_intelligence_feature_state where id=p_feature_state_id and organization_id=p_organization_id
  ) then raise exception 'feature_state tenant mismatch'; end if;

  update public.event_intelligence_predictions
  set status='superseded',updated_at=now()
  where organization_id=p_organization_id
    and subject_type=lower(btrim(p_subject_type))
    and subject_key=btrim(p_subject_key)
    and prediction_type=lower(btrim(p_prediction_type))
    and model_key=btrim(p_model_key)
    and status='active';

  insert into public.event_intelligence_predictions(
    organization_id,subject_type,subject_key,subject_id,prediction_type,model_key,model_version,model_mode,
    feature_state_id,score,probability,confidence_low,confidence_high,confidence_band,reason_codes,
    explanation,evidence,status,generated_at,expires_at
  ) values (
    p_organization_id,lower(btrim(p_subject_type)),btrim(p_subject_key),p_subject_id,lower(btrim(p_prediction_type)),btrim(p_model_key),btrim(p_model_version),p_model_mode,
    p_feature_state_id,p_score,p_probability,p_confidence_low,p_confidence_high,nullif(btrim(coalesce(p_confidence_band,'')),''),coalesce(p_reason_codes,'{}'::text[]),
    coalesce(p_explanation,'{}'::jsonb),coalesce(p_evidence,'{}'::jsonb),'active',coalesce(p_generated_at,now()),p_expires_at
  ) returning id into v_id;

  return v_id;
end;
$function$;

create or replace function public.record_event_intelligence_outcome_v1(
  p_organization_id uuid,p_prediction_id uuid,p_outcome_key text,p_outcome_value jsonb,
  p_occurred_at timestamptz,p_raw_event_id uuid default null,p_source text default 'system',p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public,pg_temp
as $function$
declare v_id uuid;
begin
  if not exists (select 1 from public.event_intelligence_predictions where id=p_prediction_id and organization_id=p_organization_id) then
    raise exception 'prediction not found for organization';
  end if;
  if p_raw_event_id is not null and not exists (select 1 from public.raw_events where id=p_raw_event_id and organization_id=p_organization_id) then
    raise exception 'raw_event tenant mismatch';
  end if;

  insert into public.event_intelligence_prediction_outcomes(
    organization_id,prediction_id,outcome_key,outcome_value,raw_event_id,occurred_at,source,metadata
  ) values (
    p_organization_id,p_prediction_id,btrim(p_outcome_key),coalesce(p_outcome_value,'{}'::jsonb),p_raw_event_id,coalesce(p_occurred_at,now()),coalesce(nullif(btrim(p_source),''),'system'),coalesce(p_metadata,'{}'::jsonb)
  ) returning id into v_id;

  update public.event_intelligence_predictions
  set actual_outcome=btrim(p_outcome_key),actual_outcome_value=coalesce(p_outcome_value,'{}'::jsonb),outcome_at=coalesce(p_occurred_at,now()),status='observed',updated_at=now()
  where id=p_prediction_id and organization_id=p_organization_id;

  return v_id;
end;
$function$;

revoke all on function public.normalize_event_intelligence_url_v1(text) from public,anon,authenticated;
revoke all on function public.upsert_event_intelligence_feature_v1(uuid,text,text,uuid,text,text,jsonb,jsonb,timestamptz,timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function public.record_event_intelligence_prediction_v1(uuid,text,text,uuid,text,text,text,text,uuid,numeric,numeric,numeric,numeric,text,text[],jsonb,jsonb,timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function public.record_event_intelligence_outcome_v1(uuid,uuid,text,jsonb,timestamptz,uuid,text,jsonb) from public,anon,authenticated;

grant execute on function public.normalize_event_intelligence_url_v1(text) to service_role;
grant execute on function public.upsert_event_intelligence_feature_v1(uuid,text,text,uuid,text,text,jsonb,jsonb,timestamptz,timestamptz,timestamptz) to service_role;
grant execute on function public.record_event_intelligence_prediction_v1(uuid,text,text,uuid,text,text,text,text,uuid,numeric,numeric,numeric,numeric,text,text[],jsonb,jsonb,timestamptz,timestamptz) to service_role;
grant execute on function public.record_event_intelligence_outcome_v1(uuid,uuid,text,jsonb,timestamptz,uuid,text,jsonb) to service_role;

commit;
