-- SEO semantic retrieval foundation v1
-- Provider-independent embedding queue + privacy-safe subject builder.
-- Default OFF for every organization. No vectors or external calls are stored/run here.

create table if not exists public.seo_embedding_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  enabled boolean not null default false,
  provider_profile text not null default 'external_http',
  model_name text null,
  dimensions integer null check (dimensions is null or dimensions between 64 and 4096),
  semantic_index_version text not null default 'v1',
  lexical_weight numeric(5,4) not null default 0.55 check (lexical_weight between 0 and 1),
  semantic_weight numeric(5,4) not null default 0.45 check (semantic_weight between 0 and 1),
  batch_size integer not null default 20 check (batch_size between 1 and 100),
  max_attempts integer not null default 6 check (max_attempts between 1 and 20),
  pilot_max_documents integer not null default 25 check (pilot_max_documents between 1 and 250),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (lexical_weight + semantic_weight > 0)
);

insert into public.seo_embedding_settings(organization_id)
select id from public.organizations
on conflict (organization_id) do nothing;

create table if not exists public.seo_embedding_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null check (entity_type in ('seo_page','seo_topic','seo_entity','seo_experiment','seo_action')),
  entity_id uuid not null,
  operation text not null default 'upsert' check (operation in ('upsert','delete')),
  content_hash text null,
  revision bigint not null default 1,
  status text not null default 'pending' check (status in ('pending','processing','retry','done','dead_letter')),
  attempt_count integer not null default 0,
  next_retry_at timestamptz null,
  lease_token uuid null,
  lease_expires_at timestamptz null,
  claimed_revision bigint null,
  last_error text null,
  last_completed_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, entity_type, entity_id)
);

create index if not exists idx_seo_embedding_outbox_claim
  on public.seo_embedding_outbox(organization_id,status,next_retry_at,updated_at);

alter table public.seo_embedding_settings enable row level security;
alter table public.seo_embedding_outbox enable row level security;
revoke all on public.seo_embedding_settings from public,anon,authenticated;
revoke all on public.seo_embedding_outbox from public,anon,authenticated;
grant select,insert,update,delete on public.seo_embedding_settings to service_role;
grant select,insert,update,delete on public.seo_embedding_outbox to service_role;

create or replace function public.ensure_seo_embedding_settings_v1()
returns trigger
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
begin
  insert into public.seo_embedding_settings(organization_id) values(new.id)
  on conflict (organization_id) do nothing;
  return new;
end;
$$;

drop trigger if exists organizations_seo_embedding_settings_v1 on public.organizations;
create trigger organizations_seo_embedding_settings_v1
after insert on public.organizations
for each row execute function public.ensure_seo_embedding_settings_v1();

create or replace function public.build_seo_embedding_subject_v1(
  p_organization_id uuid,
  p_entity_type text,
  p_entity_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_search jsonb;
  v_doc jsonb;
  v_text text;
begin
  if p_entity_type not in ('seo_page','seo_topic','seo_entity','seo_experiment','seo_action') then
    return jsonb_build_object('indexable',false,'reason','unsupported_entity');
  end if;

  v_search := public.build_search_document_v1(p_organization_id,p_entity_type,p_entity_id);
  if not coalesce((v_search->>'indexable')::boolean,false) then
    return jsonb_build_object(
      'indexable',false,
      'operation',coalesce(v_search->>'operation','delete'),
      'reason',coalesce(v_search->>'reason','not_indexable')
    );
  end if;

  v_doc := v_search->'document';

  -- Explicit allowlist only. No arbitrary metadata, contact data, raw payloads or proposal JSON.
  v_text := concat_ws(E'\n',
    nullif(v_doc->>'title',''),
    nullif(v_doc->>'meta_description',''),
    nullif(v_doc->>'url_path',''),
    nullif(v_doc->>'page_type',''),
    nullif(v_doc->>'indexability_reason',''),
    nullif(v_doc->>'content_state',''),
    nullif(v_doc->>'recommended_action',''),
    nullif(v_doc->>'action_reason',''),
    nullif(v_doc->>'recommendation',''),
    nullif(v_doc->>'topic_name',''),
    nullif(v_doc->>'topic_type',''),
    nullif(v_doc->>'description',''),
    nullif(v_doc->>'gap_type',''),
    nullif(v_doc->>'semantic_entity_name',''),
    nullif(v_doc->>'semantic_entity_kind',''),
    nullif(v_doc->>'experiment_title',''),
    nullif(v_doc->>'hypothesis',''),
    nullif(v_doc->>'learning_summary',''),
    nullif(v_doc->>'seo_action_kind',''),
    nullif(v_doc->>'source_layer',''),
    nullif(v_doc->>'source_action',''),
    nullif(v_doc->>'opportunity_reasons','')
  );

  v_text := left(regexp_replace(coalesce(v_text,''), E'[\\t\\r ]+', ' ', 'g'), 12000);
  if length(trim(v_text)) < 2 then
    return jsonb_build_object('indexable',false,'operation','delete','reason','empty_embedding_subject');
  end if;

  return jsonb_build_object(
    'indexable',true,
    'operation','upsert',
    'entity_type',p_entity_type,
    'entity_id',p_entity_id,
    'text',v_text,
    'content_hash',md5(v_text),
    'document_id',p_organization_id::text||':'||p_entity_type||':'||p_entity_id::text
  );
end;
$$;

create or replace function public.enqueue_seo_embedding_v1(
  p_organization_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_settings public.seo_embedding_settings%rowtype;
  v_subject jsonb;
  v_operation text;
  v_hash text;
  v_existing public.seo_embedding_outbox%rowtype;
  v_id uuid;
begin
  select * into v_settings from public.seo_embedding_settings where organization_id=p_organization_id;
  if not found or not coalesce(v_settings.enabled,false) then return null; end if;
  if not exists(select 1 from public.search_index_settings s where s.organization_id=p_organization_id and s.indexing_enabled=true) then return null; end if;

  v_subject := public.build_seo_embedding_subject_v1(p_organization_id,p_entity_type,p_entity_id);
  v_operation := case when coalesce((v_subject->>'indexable')::boolean,false) then 'upsert' else 'delete' end;
  v_hash := case when v_operation='upsert' then v_subject->>'content_hash' else null end;

  select * into v_existing from public.seo_embedding_outbox
  where organization_id=p_organization_id and entity_type=p_entity_type and entity_id=p_entity_id
  for update;

  if found and v_existing.operation=v_operation and v_existing.content_hash is not distinct from v_hash
     and v_existing.status in ('pending','processing','retry','done') then
    return v_existing.id;
  end if;

  insert into public.seo_embedding_outbox(
    organization_id,entity_type,entity_id,operation,content_hash,status,revision,
    attempt_count,next_retry_at,lease_token,lease_expires_at,claimed_revision,last_error,metadata,updated_at
  ) values(
    p_organization_id,p_entity_type,p_entity_id,v_operation,v_hash,'pending',1,
    0,null,null,null,null,null,coalesce(p_metadata,'{}'::jsonb),now()
  )
  on conflict (organization_id,entity_type,entity_id) do update set
    operation=excluded.operation,
    content_hash=excluded.content_hash,
    revision=public.seo_embedding_outbox.revision+1,
    status='pending',attempt_count=0,next_retry_at=null,
    lease_token=null,lease_expires_at=null,claimed_revision=null,last_error=null,
    metadata=public.seo_embedding_outbox.metadata||excluded.metadata,
    updated_at=now()
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.claim_seo_embedding_outbox_v1(
  p_organization_id uuid,
  p_limit integer default 20,
  p_lease_seconds integer default 180
) returns table(
  outbox_id uuid, entity_type text, entity_id uuid, operation text,
  content_hash text, revision bigint, lease_token uuid
)
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
begin
  return query
  with candidates as (
    select q.id
    from public.seo_embedding_outbox q
    join public.seo_embedding_settings s on s.organization_id=q.organization_id
    join public.search_index_settings si on si.organization_id=q.organization_id
    where q.organization_id=p_organization_id
      and s.enabled=true and si.indexing_enabled=true
      and q.status in ('pending','retry')
      and (q.next_retry_at is null or q.next_retry_at<=now())
      and q.attempt_count<s.max_attempts
    order by q.updated_at asc
    limit greatest(1,least(coalesce(p_limit,20),100))
    for update of q skip locked
  ), claimed as (
    update public.seo_embedding_outbox q set
      status='processing',
      attempt_count=q.attempt_count+1,
      lease_token=gen_random_uuid(),
      lease_expires_at=now()+make_interval(secs=>greatest(30,least(coalesce(p_lease_seconds,180),900))),
      claimed_revision=q.revision,
      updated_at=now()
    from candidates c where q.id=c.id
    returning q.id,q.entity_type,q.entity_id,q.operation,q.content_hash,q.revision,q.lease_token
  )
  select c.id,c.entity_type,c.entity_id,c.operation,c.content_hash,c.revision,c.lease_token from claimed c;
end;
$$;

create or replace function public.complete_seo_embedding_outbox_v1(
  p_organization_id uuid,
  p_outbox_id uuid,
  p_lease_token uuid,
  p_claimed_revision bigint,
  p_success boolean,
  p_error text default null
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_row public.seo_embedding_outbox%rowtype;
  v_max integer:=6;
  v_delay integer;
begin
  select * into v_row from public.seo_embedding_outbox
  where id=p_outbox_id and organization_id=p_organization_id for update;
  if not found then return jsonb_build_object('ok',false,'reason','outbox_not_found'); end if;
  if v_row.status<>'processing' or v_row.lease_token is distinct from p_lease_token or v_row.claimed_revision is distinct from p_claimed_revision then
    return jsonb_build_object('ok',false,'reason','claim_mismatch');
  end if;
  if v_row.revision<>p_claimed_revision then
    update public.seo_embedding_outbox set status='pending',lease_token=null,lease_expires_at=null,claimed_revision=null,next_retry_at=null,last_error=null,updated_at=now() where id=p_outbox_id;
    return jsonb_build_object('ok',true,'status','pending','reason','newer_revision_waiting');
  end if;
  if coalesce(p_success,false) then
    update public.seo_embedding_outbox set status='done',lease_token=null,lease_expires_at=null,claimed_revision=null,next_retry_at=null,last_error=null,last_completed_at=now(),updated_at=now() where id=p_outbox_id;
    return jsonb_build_object('ok',true,'status','done');
  end if;
  select coalesce(max_attempts,6) into v_max from public.seo_embedding_settings where organization_id=p_organization_id;
  if v_row.attempt_count>=v_max then
    update public.seo_embedding_outbox set status='dead_letter',lease_token=null,lease_expires_at=null,claimed_revision=null,next_retry_at=null,last_error=left(coalesce(p_error,'embedding failed'),1200),updated_at=now() where id=p_outbox_id;
    return jsonb_build_object('ok',true,'status','dead_letter');
  end if;
  v_delay:=least(3600,30*cast(power(2,greatest(0,v_row.attempt_count-1)) as integer));
  update public.seo_embedding_outbox set status='retry',lease_token=null,lease_expires_at=null,claimed_revision=null,next_retry_at=now()+make_interval(secs=>v_delay),last_error=left(coalesce(p_error,'embedding failed'),1200),updated_at=now() where id=p_outbox_id;
  return jsonb_build_object('ok',true,'status','retry','retry_in_seconds',v_delay);
end;
$$;

create or replace function public.refresh_seo_embedding_outbox_v1(p_limit_per_type integer default 500)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  r record;
  x record;
  v_orgs integer:=0;
  v_seen integer:=0;
begin
  for r in
    select s.organization_id
    from public.seo_embedding_settings s
    join public.search_index_settings si on si.organization_id=s.organization_id
    where s.enabled=true and si.indexing_enabled=true
  loop
    v_orgs:=v_orgs+1;
    for x in select id from public.seo_pages where organization_id=r.organization_id limit greatest(1,least(p_limit_per_type,2000)) loop perform public.enqueue_seo_embedding_v1(r.organization_id,'seo_page',x.id,jsonb_build_object('source','semantic_refresh_v1')); v_seen:=v_seen+1; end loop;
    for x in select id from public.seo_semantic_topics where organization_id=r.organization_id limit greatest(1,least(p_limit_per_type,2000)) loop perform public.enqueue_seo_embedding_v1(r.organization_id,'seo_topic',x.id,jsonb_build_object('source','semantic_refresh_v1')); v_seen:=v_seen+1; end loop;
    for x in select id from public.seo_semantic_entities where organization_id=r.organization_id limit greatest(1,least(p_limit_per_type,2000)) loop perform public.enqueue_seo_embedding_v1(r.organization_id,'seo_entity',x.id,jsonb_build_object('source','semantic_refresh_v1')); v_seen:=v_seen+1; end loop;
    for x in select id from public.seo_experiments where organization_id=r.organization_id limit greatest(1,least(p_limit_per_type,2000)) loop perform public.enqueue_seo_embedding_v1(r.organization_id,'seo_experiment',x.id,jsonb_build_object('source','semantic_refresh_v1')); v_seen:=v_seen+1; end loop;
    for x in select id from public.seo_optimization_actions where organization_id=r.organization_id limit greatest(1,least(p_limit_per_type,2000)) loop perform public.enqueue_seo_embedding_v1(r.organization_id,'seo_action',x.id,jsonb_build_object('source','semantic_refresh_v1')); v_seen:=v_seen+1; end loop;
  end loop;
  return jsonb_build_object('ok',true,'organizations_refreshed',v_orgs,'entities_examined',v_seen);
end;
$$;

create or replace function public.seo_embedding_enqueue_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_org uuid;
  v_id uuid;
  v_type text:=tg_argv[0];
begin
  v_org:=coalesce(new.organization_id,old.organization_id);
  v_id:=coalesce(new.id,old.id);
  perform public.enqueue_seo_embedding_v1(v_org,v_type,v_id,jsonb_build_object('source','row_trigger_v1','table',tg_table_name));
  return coalesce(new,old);
end;
$$;

-- Current source tables carry organization_id directly.
do $$
begin
  execute 'drop trigger if exists seo_pages_embedding_outbox_v1 on public.seo_pages';
  execute 'create trigger seo_pages_embedding_outbox_v1 after insert or update or delete on public.seo_pages for each row execute function public.seo_embedding_enqueue_trigger_v1(''seo_page'')';
  execute 'drop trigger if exists seo_topics_embedding_outbox_v1 on public.seo_semantic_topics';
  execute 'create trigger seo_topics_embedding_outbox_v1 after insert or update or delete on public.seo_semantic_topics for each row execute function public.seo_embedding_enqueue_trigger_v1(''seo_topic'')';
  execute 'drop trigger if exists seo_entities_embedding_outbox_v1 on public.seo_semantic_entities';
  execute 'create trigger seo_entities_embedding_outbox_v1 after insert or update or delete on public.seo_semantic_entities for each row execute function public.seo_embedding_enqueue_trigger_v1(''seo_entity'')';
  execute 'drop trigger if exists seo_experiments_embedding_outbox_v1 on public.seo_experiments';
  execute 'create trigger seo_experiments_embedding_outbox_v1 after insert or update or delete on public.seo_experiments for each row execute function public.seo_embedding_enqueue_trigger_v1(''seo_experiment'')';
  execute 'drop trigger if exists seo_actions_embedding_outbox_v1 on public.seo_optimization_actions';
  execute 'create trigger seo_actions_embedding_outbox_v1 after insert or update or delete on public.seo_optimization_actions for each row execute function public.seo_embedding_enqueue_trigger_v1(''seo_action'')';
end $$;

create or replace view public.v_seo_embedding_health_v1 with (security_invoker=true) as
select
  o.id organization_id,
  coalesce(s.enabled,false) semantic_enabled,
  s.provider_profile,
  s.model_name,
  s.dimensions,
  s.semantic_index_version,
  s.lexical_weight,
  s.semantic_weight,
  count(q.id) filter(where q.status='pending') pending,
  count(q.id) filter(where q.status='processing') processing,
  count(q.id) filter(where q.status='retry') retry,
  count(q.id) filter(where q.status='dead_letter') dead_letter,
  count(q.id) filter(where q.status='done') done,
  min(q.updated_at) filter(where q.status in ('pending','retry')) oldest_waiting_at,
  max(q.last_completed_at) last_completed_at,
  now() checked_at
from public.organizations o
left join public.seo_embedding_settings s on s.organization_id=o.id
left join public.seo_embedding_outbox q on q.organization_id=o.id
group by o.id,s.enabled,s.provider_profile,s.model_name,s.dimensions,s.semantic_index_version,s.lexical_weight,s.semantic_weight;

-- Refresh derived semantic subjects periodically; disabled tenants remain no-op.
do $$
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname='salsys-seo-semantic-refresh-v1';
    perform cron.schedule('salsys-seo-semantic-refresh-v1','*/30 * * * *','select public.refresh_seo_embedding_outbox_v1(500);');
  end if;
exception when others then null;
end $$;

revoke all on function public.build_seo_embedding_subject_v1(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.enqueue_seo_embedding_v1(uuid,text,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.claim_seo_embedding_outbox_v1(uuid,integer,integer) from public,anon,authenticated;
revoke all on function public.complete_seo_embedding_outbox_v1(uuid,uuid,uuid,bigint,boolean,text) from public,anon,authenticated;
revoke all on function public.refresh_seo_embedding_outbox_v1(integer) from public,anon,authenticated;
grant execute on function public.build_seo_embedding_subject_v1(uuid,text,uuid) to service_role;
grant execute on function public.enqueue_seo_embedding_v1(uuid,text,uuid,jsonb) to service_role;
grant execute on function public.claim_seo_embedding_outbox_v1(uuid,integer,integer) to service_role;
grant execute on function public.complete_seo_embedding_outbox_v1(uuid,uuid,uuid,bigint,boolean,text) to service_role;
grant execute on function public.refresh_seo_embedding_outbox_v1(integer) to service_role;
