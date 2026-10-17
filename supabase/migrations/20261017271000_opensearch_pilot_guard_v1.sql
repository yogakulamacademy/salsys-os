-- OpenSearch controlled pilot guard v1
-- Keeps indexing fail-closed, caps pilot documents, and prevents accidental broad indexing.

alter table public.search_index_settings
  add column if not exists pilot_mode_enabled boolean not null default true,
  add column if not exists pilot_started_at timestamptz,
  add column if not exists pilot_max_documents integer not null default 25,
  add column if not exists pilot_seeded_at timestamptz,
  add column if not exists pilot_completed_at timestamptz;

alter table public.search_index_settings
  drop constraint if exists search_index_settings_pilot_max_documents_check;
alter table public.search_index_settings
  add constraint search_index_settings_pilot_max_documents_check
  check (pilot_max_documents between 1 and 500);

update public.search_index_settings
set indexing_enabled=false,
    pilot_mode_enabled=true,
    pilot_started_at=null,
    pilot_max_documents=least(greatest(coalesce(pilot_max_documents,25),1),500),
    updated_at=now();

create or replace function public.stage_search_index_pilot_v1(
  p_organization_id uuid,
  p_max_documents integer default 25,
  p_confirm_controlled_pilot boolean default false
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare v_max integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;
  if not coalesce(p_confirm_controlled_pilot,false) then
    return jsonb_build_object('ok',false,'reason','controlled_pilot_confirmation_required');
  end if;
  if not exists(select 1 from public.organizations where id=p_organization_id) then
    return jsonb_build_object('ok',false,'reason','organization_not_found');
  end if;

  v_max:=greatest(1,least(coalesce(p_max_documents,25),100));

  insert into public.search_index_settings(
    organization_id,indexing_enabled,pilot_mode_enabled,pilot_started_at,pilot_max_documents,pilot_seeded_at,pilot_completed_at
  ) values (
    p_organization_id,false,true,null,v_max,null,null
  )
  on conflict (organization_id) do update
  set indexing_enabled=false,
      pilot_mode_enabled=true,
      pilot_started_at=null,
      pilot_max_documents=v_max,
      pilot_seeded_at=null,
      pilot_completed_at=null,
      updated_at=now();

  return jsonb_build_object(
    'ok',true,
    'staged',true,
    'indexing_enabled',false,
    'pilot_mode_enabled',true,
    'pilot_started',false,
    'pilot_max_documents',v_max
  );
end;
$$;

create or replace function public.seed_search_index_pilot_v1(
  p_organization_id uuid,
  p_entity_types text[] default array['lead','conversation','message','knowledge_chunk']::text[]
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_settings public.search_index_settings%rowtype;
  v_remaining integer;
  v_count integer:=0;
  v_rows integer:=0;
  v_type text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  select * into v_settings
  from public.search_index_settings
  where organization_id=p_organization_id
  for update;

  if not found then return jsonb_build_object('ok',false,'reason','settings_not_found'); end if;
  if not v_settings.pilot_mode_enabled then return jsonb_build_object('ok',false,'reason','pilot_mode_disabled'); end if;
  if v_settings.indexing_enabled then return jsonb_build_object('ok',false,'reason','disable_indexing_before_seed'); end if;
  if v_settings.pilot_started_at is not null then return jsonb_build_object('ok',false,'reason','pilot_already_started'); end if;

  v_remaining:=v_settings.pilot_max_documents;

  foreach v_type in array coalesce(p_entity_types,array[]::text[]) loop
    exit when v_remaining<=0;
    if v_type='lead' then
      insert into public.search_index_outbox(organization_id,entity_type,entity_id,operation,status,metadata)
      select p_organization_id,'lead',l.id,'upsert','pending',jsonb_build_object('seed','pilot_v1')
      from public.leads l
      where l.organization_id=p_organization_id
      order by l.updated_at desc,l.id
      limit v_remaining
      on conflict (organization_id,entity_type,entity_id) do update
      set operation='upsert',status='pending',revision=public.search_index_outbox.revision+1,
          metadata=public.search_index_outbox.metadata||jsonb_build_object('seed','pilot_v1'),updated_at=now();
    elsif v_type='conversation' then
      insert into public.search_index_outbox(organization_id,entity_type,entity_id,operation,status,metadata)
      select p_organization_id,'conversation',c.id,'upsert','pending',jsonb_build_object('seed','pilot_v1')
      from public.conversations c
      where c.organization_id=p_organization_id
      order by c.updated_at desc,c.id
      limit v_remaining
      on conflict (organization_id,entity_type,entity_id) do update
      set operation='upsert',status='pending',revision=public.search_index_outbox.revision+1,
          metadata=public.search_index_outbox.metadata||jsonb_build_object('seed','pilot_v1'),updated_at=now();
    elsif v_type='message' then
      insert into public.search_index_outbox(organization_id,entity_type,entity_id,operation,status,metadata)
      select p_organization_id,'message',m.id,'upsert','pending',jsonb_build_object('seed','pilot_v1')
      from public.messages m
      where m.organization_id=p_organization_id
      order by coalesce(m.sent_at,m.received_at,m.created_at) desc,m.id
      limit v_remaining
      on conflict (organization_id,entity_type,entity_id) do update
      set operation='upsert',status='pending',revision=public.search_index_outbox.revision+1,
          metadata=public.search_index_outbox.metadata||jsonb_build_object('seed','pilot_v1'),updated_at=now();
    elsif v_type='knowledge_chunk' then
      insert into public.search_index_outbox(organization_id,entity_type,entity_id,operation,status,metadata)
      select p_organization_id,'knowledge_chunk',kc.id,'upsert','pending',jsonb_build_object('seed','pilot_v1')
      from public.knowledge_chunks kc
      join public.knowledge_documents kd
        on kd.organization_id=kc.organization_id and kd.id=kc.document_id
      where kc.organization_id=p_organization_id
        and kd.status='approved'
        and (kd.valid_from is null or kd.valid_from<=now())
        and (kd.valid_until is null or kd.valid_until>now())
      order by kc.updated_at desc,kc.id
      limit v_remaining
      on conflict (organization_id,entity_type,entity_id) do update
      set operation='upsert',status='pending',revision=public.search_index_outbox.revision+1,
          metadata=public.search_index_outbox.metadata||jsonb_build_object('seed','pilot_v1'),updated_at=now();
    else
      continue;
    end if;
    get diagnostics v_rows=row_count;
    v_count:=v_count+v_rows;
    v_remaining:=greatest(0,v_settings.pilot_max_documents-v_count);
  end loop;

  update public.search_index_settings
  set pilot_seeded_at=now(),updated_at=now()
  where organization_id=p_organization_id;

  return jsonb_build_object('ok',true,'seeded_rows',v_count,'pilot_max_documents',v_settings.pilot_max_documents,'indexing_enabled',false);
end;
$$;

create or replace function public.arm_search_index_pilot_v1(
  p_organization_id uuid,
  p_confirm_external_indexing boolean default false
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare v_settings public.search_index_settings%rowtype; v_pending integer;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  if not coalesce(p_confirm_external_indexing,false) then
    return jsonb_build_object('ok',false,'reason','external_indexing_confirmation_required');
  end if;
  select * into v_settings from public.search_index_settings where organization_id=p_organization_id for update;
  if not found then return jsonb_build_object('ok',false,'reason','settings_not_found'); end if;
  if not v_settings.pilot_mode_enabled then return jsonb_build_object('ok',false,'reason','pilot_mode_disabled'); end if;
  if v_settings.pilot_seeded_at is null then return jsonb_build_object('ok',false,'reason','pilot_not_seeded'); end if;

  select count(*) into v_pending
  from public.search_index_outbox
  where organization_id=p_organization_id and status in ('pending','retry','processing');
  if v_pending=0 then return jsonb_build_object('ok',false,'reason','pilot_queue_empty'); end if;
  if v_pending>v_settings.pilot_max_documents then
    return jsonb_build_object('ok',false,'reason','pilot_queue_exceeds_cap','queued',v_pending,'cap',v_settings.pilot_max_documents);
  end if;

  update public.search_index_settings
  set indexing_enabled=true,pilot_started_at=coalesce(pilot_started_at,now()),updated_at=now()
  where organization_id=p_organization_id;
  return jsonb_build_object('ok',true,'armed',true,'queued',v_pending,'cap',v_settings.pilot_max_documents);
end;
$$;

create or replace function public.disarm_search_index_pilot_v1(
  p_organization_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  update public.search_index_settings
  set indexing_enabled=false,pilot_started_at=null,updated_at=now()
  where organization_id=p_organization_id;
  return jsonb_build_object('ok',true,'indexing_enabled',false,'pilot_started',false);
end;
$$;

create or replace function public.claim_search_index_outbox_v1(
  p_organization_id uuid,
  p_limit integer default 50,
  p_lease_seconds integer default 120
) returns table(outbox_id uuid,entity_type text,entity_id uuid,operation text,revision bigint,lease_token uuid)
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_token uuid:=gen_random_uuid();
  v_settings public.search_index_settings%rowtype;
  v_allowed integer;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  select * into v_settings from public.search_index_settings where organization_id=p_organization_id;
  if not found or not v_settings.indexing_enabled then return; end if;

  v_allowed:=greatest(1,least(coalesce(p_limit,50),500));
  if v_settings.pilot_mode_enabled then
    if v_settings.pilot_started_at is null then return; end if;
    select greatest(0,v_settings.pilot_max_documents-count(*))::integer into v_allowed
    from public.search_index_outbox o
    where o.organization_id=p_organization_id
      and o.last_completed_at>=v_settings.pilot_started_at
      and o.status='done';
    v_allowed:=least(v_allowed,greatest(1,least(coalesce(p_limit,50),500)));
    if v_allowed<=0 then
      update public.search_index_settings
      set indexing_enabled=false,pilot_completed_at=coalesce(pilot_completed_at,now()),updated_at=now()
      where organization_id=p_organization_id;
      return;
    end if;
  end if;

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
    limit v_allowed
  ), claimed as (
    update public.search_index_outbox o
    set status='processing',attempt_count=o.attempt_count+1,lease_token=v_token,
        lease_expires_at=now()+make_interval(secs=>greatest(30,least(coalesce(p_lease_seconds,120),900))),
        claimed_revision=o.revision,updated_at=now()
    from candidates c where o.id=c.id
    returning o.id,o.entity_type,o.entity_id,o.operation,o.revision,o.lease_token
  )
  select c.id,c.entity_type,c.entity_id,c.operation,c.revision,c.lease_token from claimed c;
end;
$$;

revoke all on function public.stage_search_index_pilot_v1(uuid,integer,boolean) from public,anon,authenticated;
revoke all on function public.seed_search_index_pilot_v1(uuid,text[]) from public,anon,authenticated;
revoke all on function public.arm_search_index_pilot_v1(uuid,boolean) from public,anon,authenticated;
revoke all on function public.disarm_search_index_pilot_v1(uuid) from public,anon,authenticated;
revoke all on function public.claim_search_index_outbox_v1(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.stage_search_index_pilot_v1(uuid,integer,boolean) to service_role;
grant execute on function public.seed_search_index_pilot_v1(uuid,text[]) to service_role;
grant execute on function public.arm_search_index_pilot_v1(uuid,boolean) to service_role;
grant execute on function public.disarm_search_index_pilot_v1(uuid) to service_role;
grant execute on function public.claim_search_index_outbox_v1(uuid,integer,integer) to service_role;
