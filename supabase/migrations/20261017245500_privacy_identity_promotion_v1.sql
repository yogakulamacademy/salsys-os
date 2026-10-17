-- Privacy identity promotion v1
-- Carries anonymous visitor privacy choices/restrictions forward when a visitor
-- is deterministically linked to a Person. This prevents consent/opt-out state
-- from being lost at the anonymous -> identified boundary.

create or replace function public.promote_visitor_privacy_to_person_v1(
  p_organization_id uuid,
  p_person_id uuid,
  p_anonymous_visitor_id text,
  p_source_context jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_visitor text := nullif(btrim(coalesce(p_anonymous_visitor_id,'')), '');
  v_pref record;
  v_promoted integer := 0;
  v_restriction public.privacy_subject_restrictions%rowtype;
  v_person_restriction boolean := false;
begin
  if p_organization_id is null or p_person_id is null or v_visitor is null then
    return jsonb_build_object('ok',false,'reason','missing_identity');
  end if;

  if not exists (
    select 1 from public.persons
    where id=p_person_id and organization_id=p_organization_id
  ) then
    return jsonb_build_object('ok',false,'reason','person_tenant_mismatch');
  end if;

  -- Promote only the latest decision per purpose from this anonymous visitor.
  for v_pref in
    select distinct on (r.purpose_key)
      r.id,
      r.purpose_key,
      r.decision,
      r.notice_version,
      r.occurred_at,
      r.source
    from public.privacy_consent_receipts r
    where r.organization_id=p_organization_id
      and r.anonymous_visitor_id=v_visitor
    order by r.purpose_key, r.occurred_at desc, r.created_at desc
  loop
    if not exists (
      select 1
      from public.privacy_consent_receipts existing
      where existing.organization_id=p_organization_id
        and existing.person_id=p_person_id
        and existing.metadata->>'promoted_from_receipt_id'=v_pref.id::text
    ) then
      perform public.record_privacy_preference_v1(
        p_organization_id,
        v_pref.purpose_key,
        v_pref.decision,
        'identity_promotion_v1',
        v_pref.occurred_at,
        p_person_id,
        null,
        null,
        v_pref.notice_version,
        jsonb_build_object(
          'promoted_from_receipt_id',v_pref.id,
          'promoted_from_source',v_pref.source
        ) || coalesce(p_source_context,'{}'::jsonb),
        jsonb_build_object(
          'promoted_from_receipt_id',v_pref.id,
          'privacy_identity_promotion',true
        )
      );
      v_promoted:=v_promoted+1;
    end if;
  end loop;

  select * into v_restriction
  from public.privacy_subject_restrictions r
  where r.organization_id=p_organization_id
    and r.anonymous_visitor_id=v_visitor
    and r.active
  order by r.created_at desc
  limit 1;

  if found then
    insert into public.privacy_subject_restrictions(
      organization_id,person_id,
      block_optional_tracking,block_marketing,block_profiling,block_ad_exports,restrict_processing,
      reason,source_request_id,active,metadata
    ) values (
      p_organization_id,p_person_id,
      v_restriction.block_optional_tracking,v_restriction.block_marketing,
      v_restriction.block_profiling,v_restriction.block_ad_exports,
      v_restriction.restrict_processing,
      'identity_promoted:'||v_restriction.reason,
      v_restriction.source_request_id,true,
      jsonb_build_object(
        'promoted_from_visitor',v_visitor,
        'promoted_from_restriction_created_at',v_restriction.created_at
      ) || coalesce(p_source_context,'{}'::jsonb)
    )
    on conflict (organization_id,person_id) where person_id is not null and active
    do update set
      block_optional_tracking=public.privacy_subject_restrictions.block_optional_tracking or excluded.block_optional_tracking,
      block_marketing=public.privacy_subject_restrictions.block_marketing or excluded.block_marketing,
      block_profiling=public.privacy_subject_restrictions.block_profiling or excluded.block_profiling,
      block_ad_exports=public.privacy_subject_restrictions.block_ad_exports or excluded.block_ad_exports,
      restrict_processing=public.privacy_subject_restrictions.restrict_processing or excluded.restrict_processing,
      metadata=public.privacy_subject_restrictions.metadata || excluded.metadata,
      updated_at=now();
    v_person_restriction:=true;
  end if;

  return jsonb_build_object(
    'ok',true,
    'promoted_preferences',v_promoted,
    'restriction_promoted',v_person_restriction
  );
end;
$$;

create or replace function public.promote_privacy_from_person_session_v1()
returns trigger
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_visitor text;
begin
  select ws.anonymous_visitor_id into v_visitor
  from public.web_sessions ws
  where ws.id=new.web_session_id
    and ws.organization_id=new.organization_id;

  if v_visitor is not null then
    perform public.promote_visitor_privacy_to_person_v1(
      new.organization_id,
      new.person_id,
      v_visitor,
      jsonb_build_object('web_session_id',new.web_session_id,'resolution_method',new.resolution_method)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists person_sessions_promote_privacy_v1 on public.person_sessions;
create trigger person_sessions_promote_privacy_v1
after insert or update of person_id,web_session_id on public.person_sessions
for each row execute function public.promote_privacy_from_person_session_v1();

create or replace function public.promote_privacy_from_web_session_lead_v1()
returns trigger
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_person uuid;
begin
  if new.lead_id is null or new.anonymous_visitor_id is null then return new; end if;

  select pl.person_id into v_person
  from public.person_leads pl
  where pl.organization_id=new.organization_id
    and pl.lead_id=new.lead_id;

  if v_person is not null then
    perform public.promote_visitor_privacy_to_person_v1(
      new.organization_id,
      v_person,
      new.anonymous_visitor_id,
      jsonb_build_object('web_session_id',new.id,'lead_id',new.lead_id)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists web_sessions_promote_privacy_v1 on public.web_sessions;
create trigger web_sessions_promote_privacy_v1
after insert or update of lead_id on public.web_sessions
for each row when (new.lead_id is not null)
execute function public.promote_privacy_from_web_session_lead_v1();

revoke all on function public.promote_visitor_privacy_to_person_v1(uuid,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.promote_privacy_from_person_session_v1() from public,anon,authenticated;
revoke all on function public.promote_privacy_from_web_session_lead_v1() from public,anon,authenticated;
grant execute on function public.promote_visitor_privacy_to_person_v1(uuid,uuid,text,jsonb) to service_role;
