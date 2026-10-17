-- OpenSearch indexing foundation v1
-- Postgres remains source of truth. Outbox stores references, not duplicated PII payloads.
-- Tenant scope is mandatory at claim/document-build boundaries.

create table if not exists public.search_index_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  provider text not null default 'opensearch',
  indexing_enabled boolean not null default false,
  index_prefix text not null default 'salsys',
  batch_size integer not null default 50,
  max_attempts integer not null default 8,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (provider='opensearch'),
  check (batch_size between 1 and 500),
  check (max_attempts between 1 and 20)
);

insert into public.search_index_settings(organization_id)
select id from public.organizations
on conflict (organization_id) do nothing;

create table if not exists public.search_index_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  operation text not null default 'upsert',
  revision bigint not null default 1,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  next_retry_at timestamptz,
  lease_token uuid,
  lease_expires_at timestamptz,
  claimed_revision bigint,
  last_error text,
  last_completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,entity_type,entity_id),
  check (entity_type in ('lead','conversation','message','knowledge_chunk','person')),
  check (operation in ('upsert','delete')),
  check (status in ('pending','processing','retry','done','dead_letter'))
);

create index if not exists idx_search_index_outbox_claim
  on public.search_index_outbox(organization_id,status,next_retry_at,updated_at)
  where status in ('pending','retry','processing');

alter table public.search_index_settings enable row level security;
alter table public.search_index_outbox enable row level security;

drop policy if exists search_index_settings_member_read on public.search_index_settings;
create policy search_index_settings_member_read on public.search_index_settings
for select using (
  exists (
    select 1 from public.organization_members m
    where m.organization_id=search_index_settings.organization_id
      and m.user_id=auth.uid() and m.active
  )
);

drop policy if exists search_index_outbox_member_read on public.search_index_outbox;
create policy search_index_outbox_member_read on public.search_index_outbox
for select using (
  exists (
    select 1 from public.organization_members m
    where m.organization_id=search_index_outbox.organization_id
      and m.user_id=auth.uid() and m.active
  )
);

create or replace function public.enqueue_search_index_v1(
  p_organization_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_operation text default 'upsert',
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare v_id uuid;
begin
  if p_organization_id is null or p_entity_id is null then raise exception 'organization and entity required'; end if;
  if p_entity_type not in ('lead','conversation','message','knowledge_chunk','person') then raise exception 'unsupported search entity'; end if;
  if p_operation not in ('upsert','delete') then raise exception 'unsupported search operation'; end if;

  insert into public.search_index_outbox(
    organization_id,entity_type,entity_id,operation,status,revision,attempt_count,next_retry_at,
    lease_token,lease_expires_at,claimed_revision,last_error,metadata,updated_at
  ) values(
    p_organization_id,p_entity_type,p_entity_id,p_operation,'pending',1,0,null,
    null,null,null,null,coalesce(p_metadata,'{}'::jsonb),now()
  )
  on conflict (organization_id,entity_type,entity_id) do update
  set operation=excluded.operation,
      revision=public.search_index_outbox.revision+1,
      status='pending',
      attempt_count=0,
      next_retry_at=null,
      lease_token=null,
      lease_expires_at=null,
      claimed_revision=null,
      last_error=null,
      metadata=public.search_index_outbox.metadata||excluded.metadata,
      updated_at=now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.search_enqueue_row_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
begin
  if tg_op='DELETE' then
    perform public.enqueue_search_index_v1(old.organization_id,tg_argv[0],old.id,'delete',jsonb_build_object('trigger_table',tg_table_name));
    return old;
  end if;
  perform public.enqueue_search_index_v1(new.organization_id,tg_argv[0],new.id,'upsert',jsonb_build_object('trigger_table',tg_table_name));
  return new;
end;
$$;

-- Core CRM/conversation entities.
drop trigger if exists leads_search_outbox_v1 on public.leads;
create trigger leads_search_outbox_v1
after insert or update or delete on public.leads
for each row execute function public.search_enqueue_row_trigger_v1('lead');

drop trigger if exists conversations_search_outbox_v1 on public.conversations;
create trigger conversations_search_outbox_v1
after insert or update or delete on public.conversations
for each row execute function public.search_enqueue_row_trigger_v1('conversation');

drop trigger if exists messages_search_outbox_v1 on public.messages;
create trigger messages_search_outbox_v1
after insert or update or delete on public.messages
for each row execute function public.search_enqueue_row_trigger_v1('message');

drop trigger if exists knowledge_chunks_search_outbox_v1 on public.knowledge_chunks;
create trigger knowledge_chunks_search_outbox_v1
after insert or update or delete on public.knowledge_chunks
for each row execute function public.search_enqueue_row_trigger_v1('knowledge_chunk');

create or replace function public.search_privacy_tombstone_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
begin
  if new.entity_type in ('person','lead','conversation','message') then
    perform public.enqueue_search_index_v1(
      new.organization_id,new.entity_type,new.entity_id,'delete',
      jsonb_build_object('privacy_tombstone_id',new.id,'reason',new.reason)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists privacy_tombstones_search_outbox_v1 on public.privacy_search_tombstones;
create trigger privacy_tombstones_search_outbox_v1
after insert on public.privacy_search_tombstones
for each row execute function public.search_privacy_tombstone_trigger_v1();

create or replace function public.claim_search_index_outbox_v1(
  p_organization_id uuid,
  p_limit integer default 50,
  p_lease_seconds integer default 120
) returns table(
  outbox_id uuid,
  entity_type text,
  entity_id uuid,
  operation text,
  revision bigint,
  lease_token uuid
)
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare v_token uuid:=gen_random_uuid();
begin
  if not exists(
    select 1 from public.search_index_settings s
    where s.organization_id=p_organization_id and s.indexing_enabled
  ) then return; end if;

  return query
  with candidates as (
    select o.id
    from public.search_index_outbox o
    where o.organization_id=p_organization_id
      and (
        o.status='pending'
        or (o.status='retry' and coalesce(o.next_retry_at,now())<=now())
        or (o.status='processing' and o.lease_expires_at<now())
      )
    order by o.updated_at,o.id
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,50),500))
  ), claimed as (
    update public.search_index_outbox o
    set status='processing',
        attempt_count=o.attempt_count+1,
        lease_token=v_token,
        lease_expires_at=now()+make_interval(secs=>greatest(30,least(coalesce(p_lease_seconds,120),900))),
        claimed_revision=o.revision,
        updated_at=now()
    from candidates c
    where o.id=c.id
    returning o.id,o.entity_type,o.entity_id,o.operation,o.revision,o.lease_token
  )
  select c.id,c.entity_type,c.entity_id,c.operation,c.revision,c.lease_token from claimed c;
end;
$$;

create or replace function public.complete_search_index_outbox_v1(
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
  v_row public.search_index_outbox%rowtype;
  v_max integer:=8;
  v_delay integer;
begin
  select * into v_row from public.search_index_outbox
  where id=p_outbox_id and organization_id=p_organization_id
  for update;
  if not found then return jsonb_build_object('ok',false,'reason','outbox_not_found'); end if;
  if v_row.status<>'processing' or v_row.lease_token is distinct from p_lease_token or v_row.claimed_revision is distinct from p_claimed_revision then
    return jsonb_build_object('ok',false,'reason','claim_mismatch');
  end if;

  select coalesce(max_attempts,8) into v_max from public.search_index_settings where organization_id=p_organization_id;

  -- A newer database mutation arrived while this revision was in-flight. Never mark it done.
  if v_row.revision<>p_claimed_revision then
    update public.search_index_outbox set
      status='pending',lease_token=null,lease_expires_at=null,claimed_revision=null,
      next_retry_at=null,last_error=null,updated_at=now()
    where id=p_outbox_id;
    return jsonb_build_object('ok',true,'status','pending','reason','newer_revision_waiting');
  end if;

  if coalesce(p_success,false) then
    update public.search_index_outbox set
      status='done',lease_token=null,lease_expires_at=null,claimed_revision=null,
      next_retry_at=null,last_error=null,last_completed_at=now(),updated_at=now()
    where id=p_outbox_id;
    return jsonb_build_object('ok',true,'status','done');
  end if;

  if v_row.attempt_count>=v_max then
    update public.search_index_outbox set
      status='dead_letter',lease_token=null,lease_expires_at=null,claimed_revision=null,
      next_retry_at=null,last_error=left(coalesce(p_error,'search indexing failed'),1500),updated_at=now()
    where id=p_outbox_id;
    return jsonb_build_object('ok',true,'status','dead_letter');
  end if;

  v_delay:=least(3600,30*cast(power(2,greatest(0,v_row.attempt_count-1)) as integer));
  update public.search_index_outbox set
    status='retry',lease_token=null,lease_expires_at=null,claimed_revision=null,
    next_retry_at=now()+make_interval(secs=>v_delay),
    last_error=left(coalesce(p_error,'search indexing failed'),1500),updated_at=now()
  where id=p_outbox_id;
  return jsonb_build_object('ok',true,'status','retry','retry_in_seconds',v_delay);
end;
$$;

create or replace function public.build_search_document_v1(
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
  v_person uuid;
  v_restriction jsonb;
  v_doc jsonb;
  v_lead uuid;
begin
  if p_entity_type not in ('lead','conversation','message','knowledge_chunk','person') then
    return jsonb_build_object('indexable',false,'reason','unsupported_entity');
  end if;

  if exists(
    select 1 from public.privacy_search_tombstones t
    where t.organization_id=p_organization_id and t.entity_type=p_entity_type and t.entity_id=p_entity_id
  ) then
    return jsonb_build_object('indexable',false,'reason','privacy_tombstone','operation','delete');
  end if;

  if p_entity_type='person' then
    if not exists(select 1 from public.persons p where p.id=p_entity_id and p.organization_id=p_organization_id and p.status<>'erased') then
      return jsonb_build_object('indexable',false,'reason','person_missing_or_erased','operation','delete');
    end if;
    v_person:=p_entity_id;
    v_restriction:=public.privacy_subject_restriction_v1(p_organization_id,v_person,null,null);
    if coalesce((v_restriction->>'restrict_processing')::boolean,false) then
      return jsonb_build_object('indexable',false,'reason','privacy_processing_restricted','operation','delete');
    end if;
    select jsonb_build_object(
      'organization_id',p_organization_id,'entity_type','person','entity_id',p.id,
      'status',p.status,'updated_at',p.updated_at
    ) into v_doc from public.persons p where p.id=p_entity_id and p.organization_id=p_organization_id;

  elsif p_entity_type='lead' then
    select pl.person_id into v_person from public.person_leads pl
    where pl.organization_id=p_organization_id and pl.lead_id=p_entity_id;
    if v_person is not null then
      v_restriction:=public.privacy_subject_restriction_v1(p_organization_id,v_person,p_entity_id,null);
      if coalesce((v_restriction->>'restrict_processing')::boolean,false) then
        return jsonb_build_object('indexable',false,'reason','privacy_processing_restricted','operation','delete');
      end if;
    end if;
    select jsonb_build_object(
      'organization_id',l.organization_id,'entity_type','lead','entity_id',l.id,
      'lead_code',l.lead_code,'display_name',l.display_name,'stage',l.current_stage,'status',l.status,'intent',l.intent,
      'preferred_location',l.preferred_location,'preferred_month',l.preferred_month,'preferred_mode',l.preferred_mode,
      'country',l.country,'lead_origin',l.lead_origin,'lead_creation_channel',l.lead_creation_channel,
      'first_touch_source',l.first_touch_source,'first_touch_medium',l.first_touch_medium,'first_touch_campaign',l.first_touch_campaign,
      'last_touch_source',l.last_touch_source,'last_touch_medium',l.last_touch_medium,'last_touch_campaign',l.last_touch_campaign,
      'summary',l.summary,'created_at',l.created_at,'updated_at',l.updated_at
    ) into v_doc from public.leads l where l.id=p_entity_id and l.organization_id=p_organization_id;
    if v_doc is null then return jsonb_build_object('indexable',false,'reason','entity_missing','operation','delete'); end if;

  elsif p_entity_type='conversation' then
    select c.lead_id into v_lead from public.conversations c where c.id=p_entity_id and c.organization_id=p_organization_id;
    if v_lead is null then return jsonb_build_object('indexable',false,'reason','entity_missing','operation','delete'); end if;
    select pl.person_id into v_person from public.person_leads pl where pl.organization_id=p_organization_id and pl.lead_id=v_lead;
    if v_person is not null then
      v_restriction:=public.privacy_subject_restriction_v1(p_organization_id,v_person,v_lead,null);
      if coalesce((v_restriction->>'restrict_processing')::boolean,false) then
        return jsonb_build_object('indexable',false,'reason','privacy_processing_restricted','operation','delete');
      end if;
    end if;
    select jsonb_build_object(
      'organization_id',c.organization_id,'entity_type','conversation','entity_id',c.id,'lead_id',c.lead_id,
      'channel',c.channel,'status',c.status,'started_at',c.started_at,'last_message_at',c.last_message_at,'updated_at',c.updated_at
    ) into v_doc from public.conversations c where c.id=p_entity_id and c.organization_id=p_organization_id;

  elsif p_entity_type='message' then
    select m.lead_id into v_lead from public.messages m where m.id=p_entity_id and m.organization_id=p_organization_id;
    if v_lead is null then return jsonb_build_object('indexable',false,'reason','entity_missing','operation','delete'); end if;
    select pl.person_id into v_person from public.person_leads pl where pl.organization_id=p_organization_id and pl.lead_id=v_lead;
    if v_person is not null then
      v_restriction:=public.privacy_subject_restriction_v1(p_organization_id,v_person,v_lead,null);
      if coalesce((v_restriction->>'restrict_processing')::boolean,false) then
        return jsonb_build_object('indexable',false,'reason','privacy_processing_restricted','operation','delete');
      end if;
    end if;
    select jsonb_build_object(
      'organization_id',m.organization_id,'entity_type','message','entity_id',m.id,'lead_id',m.lead_id,
      'conversation_id',m.conversation_id,'direction',m.direction,'message_type',m.message_type,
      'body',m.body,'status',m.status,'sent_at',m.sent_at,'received_at',m.received_at,'created_at',m.created_at
    ) into v_doc from public.messages m where m.id=p_entity_id and m.organization_id=p_organization_id;

  elsif p_entity_type='knowledge_chunk' then
    select jsonb_build_object(
      'organization_id',kc.organization_id,'entity_type','knowledge_chunk','entity_id',kc.id,
      'document_id',kc.document_id,'chunk_index',kc.chunk_index,'content',kc.content,'content_hash',kc.content_hash,
      'document_title',kd.title,'document_category',kd.category,'document_version',kd.version,
      'created_at',kc.created_at,'updated_at',kc.updated_at
    ) into v_doc
    from public.knowledge_chunks kc
    join public.knowledge_documents kd on kd.organization_id=kc.organization_id and kd.id=kc.document_id
    where kc.id=p_entity_id and kc.organization_id=p_organization_id
      and kd.status='approved'
      and (kd.valid_from is null or kd.valid_from<=now())
      and (kd.valid_until is null or kd.valid_until>now());
    if v_doc is null then return jsonb_build_object('indexable',false,'reason','knowledge_not_approved_or_missing','operation','delete'); end if;
  end if;

  return jsonb_build_object(
    'indexable',true,'operation','upsert',
    'document_id',p_organization_id::text||':'||p_entity_type||':'||p_entity_id::text,
    'document',v_doc
  );
end;
$$;

create or replace function public.seed_search_index_outbox_v1(
  p_organization_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare v_leads integer:=0; v_convs integer:=0; v_msgs integer:=0; v_chunks integer:=0;
begin
  if not exists(select 1 from public.organizations where id=p_organization_id) then
    return jsonb_build_object('ok',false,'reason','organization_not_found');
  end if;

  insert into public.search_index_outbox(organization_id,entity_type,entity_id,operation,status,metadata)
  select p_organization_id,'lead',l.id,'upsert','pending',jsonb_build_object('seed','v1')
  from public.leads l where l.organization_id=p_organization_id
  on conflict (organization_id,entity_type,entity_id) do update set status='pending',revision=public.search_index_outbox.revision+1,updated_at=now();
  get diagnostics v_leads=row_count;

  insert into public.search_index_outbox(organization_id,entity_type,entity_id,operation,status,metadata)
  select p_organization_id,'conversation',c.id,'upsert','pending',jsonb_build_object('seed','v1')
  from public.conversations c where c.organization_id=p_organization_id
  on conflict (organization_id,entity_type,entity_id) do update set status='pending',revision=public.search_index_outbox.revision+1,updated_at=now();
  get diagnostics v_convs=row_count;

  insert into public.search_index_outbox(organization_id,entity_type,entity_id,operation,status,metadata)
  select p_organization_id,'message',m.id,'upsert','pending',jsonb_build_object('seed','v1')
  from public.messages m where m.organization_id=p_organization_id
  on conflict (organization_id,entity_type,entity_id) do update set status='pending',revision=public.search_index_outbox.revision+1,updated_at=now();
  get diagnostics v_msgs=row_count;

  insert into public.search_index_outbox(organization_id,entity_type,entity_id,operation,status,metadata)
  select p_organization_id,'knowledge_chunk',kc.id,'upsert','pending',jsonb_build_object('seed','v1')
  from public.knowledge_chunks kc
  join public.knowledge_documents kd on kd.organization_id=kc.organization_id and kd.id=kc.document_id
  where kc.organization_id=p_organization_id and kd.status='approved'
  on conflict (organization_id,entity_type,entity_id) do update set status='pending',revision=public.search_index_outbox.revision+1,updated_at=now();
  get diagnostics v_chunks=row_count;

  return jsonb_build_object('ok',true,'lead_rows',v_leads,'conversation_rows',v_convs,'message_rows',v_msgs,'knowledge_chunk_rows',v_chunks);
end;
$$;

create or replace view public.v_search_index_health_v1 with (security_invoker=true) as
select o.id organization_id,
  coalesce(s.indexing_enabled,false) indexing_enabled,
  coalesce(s.batch_size,50) batch_size,
  count(q.id) filter(where q.status='pending') pending,
  count(q.id) filter(where q.status='processing') processing,
  count(q.id) filter(where q.status='retry') retry,
  count(q.id) filter(where q.status='dead_letter') dead_letter,
  count(q.id) filter(where q.status='done') done,
  min(q.updated_at) filter(where q.status in ('pending','retry')) oldest_waiting_at,
  max(q.last_completed_at) last_completed_at,
  now() checked_at
from public.organizations o
left join public.search_index_settings s on s.organization_id=o.id
left join public.search_index_outbox q on q.organization_id=o.id
group by o.id,s.indexing_enabled,s.batch_size;

revoke all on function public.enqueue_search_index_v1(uuid,text,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.claim_search_index_outbox_v1(uuid,integer,integer) from public,anon,authenticated;
revoke all on function public.complete_search_index_outbox_v1(uuid,uuid,uuid,bigint,boolean,text) from public,anon,authenticated;
revoke all on function public.build_search_document_v1(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.seed_search_index_outbox_v1(uuid) from public,anon,authenticated;
grant execute on function public.enqueue_search_index_v1(uuid,text,uuid,text,jsonb) to service_role;
grant execute on function public.claim_search_index_outbox_v1(uuid,integer,integer) to service_role;
grant execute on function public.complete_search_index_outbox_v1(uuid,uuid,uuid,bigint,boolean,text) to service_role;
grant execute on function public.build_search_document_v1(uuid,text,uuid) to service_role;
grant execute on function public.seed_search_index_outbox_v1(uuid) to service_role;
