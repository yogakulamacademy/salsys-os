-- OpenSearch pilot guard hardening v1
-- Requires Tracking Contract v1 readiness and claims only explicitly pilot-seeded rows while pilot mode is active.

create or replace function public.arm_search_index_pilot_v1(
  p_organization_id uuid,
  p_confirm_external_indexing boolean default false
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_settings public.search_index_settings%rowtype;
  v_pending integer;
  v_readiness jsonb;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  if not coalesce(p_confirm_external_indexing,false) then
    return jsonb_build_object('ok',false,'reason','external_indexing_confirmation_required');
  end if;

  v_readiness:=public.evaluate_tracking_contract_v1(p_organization_id);
  if not coalesce((v_readiness->>'ready_for_opensearch_indexing')::boolean,false) then
    return jsonb_build_object('ok',false,'reason','tracking_contract_not_ready');
  end if;

  select * into v_settings
  from public.search_index_settings
  where organization_id=p_organization_id
  for update;

  if not found then return jsonb_build_object('ok',false,'reason','settings_not_found'); end if;
  if not v_settings.pilot_mode_enabled then return jsonb_build_object('ok',false,'reason','pilot_mode_disabled'); end if;
  if v_settings.pilot_seeded_at is null then return jsonb_build_object('ok',false,'reason','pilot_not_seeded'); end if;

  select count(*) into v_pending
  from public.search_index_outbox
  where organization_id=p_organization_id
    and status in ('pending','retry','processing')
    and metadata->>'seed'='pilot_v1';

  if v_pending=0 then return jsonb_build_object('ok',false,'reason','pilot_queue_empty'); end if;
  if v_pending>v_settings.pilot_max_documents then
    return jsonb_build_object('ok',false,'reason','pilot_queue_exceeds_cap','queued',v_pending,'cap',v_settings.pilot_max_documents);
  end if;

  update public.search_index_settings
  set indexing_enabled=true,
      pilot_started_at=coalesce(pilot_started_at,now()),
      updated_at=now()
  where organization_id=p_organization_id;

  return jsonb_build_object('ok',true,'armed',true,'queued',v_pending,'cap',v_settings.pilot_max_documents);
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
      and o.status='done'
      and o.metadata->>'seed'='pilot_v1';

    v_allowed:=least(v_allowed,greatest(1,least(coalesce(p_limit,50),500)));
    if v_allowed<=0 then
      update public.search_index_settings
      set indexing_enabled=false,
          pilot_completed_at=coalesce(pilot_completed_at,now()),
          updated_at=now()
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
      and (not v_settings.pilot_mode_enabled or o.metadata->>'seed'='pilot_v1')
    order by o.updated_at,o.id
    for update skip locked
    limit v_allowed
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

create or replace view public.v_search_index_pilot_health as
select
  s.organization_id,
  s.indexing_enabled,
  s.pilot_mode_enabled,
  s.pilot_started_at,
  s.pilot_seeded_at,
  s.pilot_completed_at,
  s.pilot_max_documents,
  count(*) filter (where o.metadata->>'seed'='pilot_v1' and o.status in ('pending','retry','processing')) as pilot_queued,
  count(*) filter (where o.metadata->>'seed'='pilot_v1' and o.status='done') as pilot_done,
  count(*) filter (where o.metadata->>'seed'='pilot_v1' and o.status='dead_letter') as pilot_dead_letter,
  count(*) filter (where o.metadata->>'seed' is distinct from 'pilot_v1' and o.status in ('pending','retry','processing')) as non_pilot_queued,
  now() as checked_at
from public.search_index_settings s
left join public.search_index_outbox o on o.organization_id=s.organization_id
group by s.organization_id,s.indexing_enabled,s.pilot_mode_enabled,s.pilot_started_at,s.pilot_seeded_at,s.pilot_completed_at,s.pilot_max_documents;

revoke all on function public.arm_search_index_pilot_v1(uuid,boolean) from public,anon,authenticated;
revoke all on function public.claim_search_index_outbox_v1(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.arm_search_index_pilot_v1(uuid,boolean) to service_role;
grant execute on function public.claim_search_index_outbox_v1(uuid,integer,integer) to service_role;
