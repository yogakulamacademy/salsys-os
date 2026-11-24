-- One-time owner-authorized initial catalog bootstrap. No seed or grant on install.
-- Deliberately distinct from the independent review route. No fabricated reviewer.
begin;
alter table saas_governance.plan_requests
 drop constraint plan_requests_status_check,
 drop constraint plan_requests_check1,
 add constraint plan_requests_status_check check(status in ('draft','under_review','reviewed_for_design','rejected','owner_approved')),
 add constraint plan_requests_check1 check(
 ((status in ('draft','under_review','owner_approved')) and reviewer_user_id is null)
 or ((status in ('reviewed_for_design','rejected')) and reviewer_user_id is not null)),
 add constraint plan_requests_owner_approval_revision_check check(status<>'owner_approved' or (revision=2 and expected_plan_version=0));
alter table saas_governance.review_events
 drop constraint review_events_action_check,
 add constraint review_events_action_check check(action in ('created','submitted','reviewed_for_design','rejected','owner_approved'));
create table saas_governance.initial_catalog_owner_authorization (
 singleton boolean primary key default true check(singleton),
 actor_user_id uuid not null,
 platform_organization_id uuid not null references public.organizations(id) on delete restrict,
 approved_catalog jsonb not null,
 catalog_sha256 text not null check(catalog_sha256 ~ '^[a-f0-9]{64}$'),
 owner_approval_ref text not null check(char_length(btrim(owner_approval_ref)) between 10 and 512),
 release_approval_ref text not null check(char_length(btrim(release_approval_ref)) between 10 and 512),
 published_at timestamptz not null default clock_timestamp()
);
alter table saas_governance.initial_catalog_owner_authorization enable row level security;
revoke all on saas_governance.initial_catalog_owner_authorization from public,anon,authenticated,service_role;
create trigger initial_catalog_owner_immutable before update or delete on saas_governance.initial_catalog_owner_authorization for each row execute function saas_governance.block_immutable();
create trigger initial_catalog_owner_no_truncate before truncate on saas_governance.initial_catalog_owner_authorization for each statement execute function saas_governance.block_immutable();

-- Explicit release-operator-only execution. No PostgREST wrapper and no grants.
-- Existing independent governance routines are unchanged.
create function saas_governance.bootstrap_initial_owner_catalog_v1(
 p_actor uuid,p_platform uuid,p_catalog jsonb,p_digest text,p_owner_ref text,p_release_ref text
) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $fn$
declare
 v_code text; v_request uuid; v_plan uuid;
 v_snapshot jsonb; v_digest text; v_price saas_governance.price_proposals%rowtype;
 v_free_digest text; v_pro_digest text; v_eligible integer; v_result jsonb:='{}'::jsonb;
begin
 if p_actor is null or p_platform is null or p_catalog is null or jsonb_typeof(p_catalog)<>'object'
 or not (p_catalog ?& array['free','basic','growth','pro'])
 or (p_catalog-array['free','basic','growth','pro'])<>'{}'::jsonb
 or p_digest is null or p_digest is distinct from encode(sha256(convert_to(p_catalog::text,'UTF8')),'hex')
 or p_owner_ref is null or char_length(btrim(p_owner_ref)) not between 10 and 250
 or p_release_ref is null or char_length(btrim(p_release_ref)) not between 10 and 512
 then raise exception 'Exact owner-approved initial catalog required'; end if;
 perform pg_advisory_xact_lock(138130827);
 if exists(select 1 from saas_governance.initial_catalog_owner_authorization)
 or exists(select 1 from saas_governance.operators)
 or exists(select 1 from public.saas_plans)
 or exists(select 1 from saas_governance.plan_requests)
 or exists(select 1 from saas_governance.published_plan_versions)
 or exists(select 1 from public.signup_trial_policy)
 or exists(select 1 from public.signup_registration_intents)
 or exists(select 1 from public.saas_organization_subscriptions)
 then raise exception 'Initial owner catalog bootstrap requires pristine commercial state'; end if;
 select count(distinct m.user_id) into v_eligible from public.organization_members m
 join public.organizations o on o.id=m.organization_id and o.slug='salsysos' and o.status='active'
 join public.profiles p on p.id=m.user_id and p.active
 join auth.users u on u.id=m.user_id and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
 where m.active and m.role in ('owner','admin');
 if v_eligible<>1 or not exists(select 1 from public.organization_members m
 join public.organizations o on o.id=m.organization_id and o.slug='salsysos' and o.status='active'
 join public.profiles p on p.id=m.user_id and p.active
 join auth.users u on u.id=m.user_id and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
 where m.user_id=p_actor and m.organization_id=p_platform and m.active and m.role in ('owner','admin'))
 then raise exception 'Sole verified platform operator required' using errcode='42501'; end if;
 -- Only the designated existing administrator; never create users or memberships.
 insert into saas_governance.operators(user_id,platform_organization_id,may_author,may_review,may_publish,may_approve_pilot,active)
 values(p_actor,p_platform,true,false,true,true,true);
 foreach v_code in array array['free','basic','growth','pro'] loop
  v_snapshot:=p_catalog->v_code;
  -- Use the existing validated snapshot/proposal routine, not an unchecked price insert.
  v_request:=saas_governance.create_plan_request(p_actor,v_code,0,v_snapshot,'One-time owner-authorized initial catalog; no independent review claimed');
  select snapshot_sha256 into strict v_digest from saas_governance.plan_requests where id=v_request;
  select * into strict v_price from saas_governance.price_proposals where request_id=v_request;
  if not (v_snapshot->'workspace_codes' ? 'sales') or not (v_snapshot->'integration_codes' ? 'instagram')
  then raise exception 'Initial catalog must include Sales and Instagram for every plan'; end if;
  update saas_governance.plan_requests set status='owner_approved',revision=2,updated_at=clock_timestamp() where id=v_request;
  insert into saas_governance.review_events(request_id,revision,action,actor_user_id,snapshot_sha256,reason)
  values(v_request,2,'owner_approved',p_actor,v_digest,'One-time owner authorization: '||p_owner_ref);
  insert into public.saas_plans(code,display_name,status,version,limits,metadata)
  values(v_code,v_snapshot->>'display_name','active',1,
    jsonb_build_object('named_users',v_snapshot->'named_users','lead_records',v_snapshot->'lead_records'),
    jsonb_build_object('publication_request_id',v_request,'snapshot_sha256',v_digest,'publication_mode','initial_owner_authorized'))
  returning id into v_plan;
  insert into saas_governance.published_plan_versions(plan_id,version,request_id,plan_code,snapshot,snapshot_sha256,
   currency,billing_period,amount_minor,setup_min_minor,setup_max_minor,setup_optional,tax_treatment,
   published_by,commercial_approval_ref,release_approval_ref)
  values(v_plan,1,v_request,v_code,v_snapshot,v_digest,v_price.currency,v_price.billing_period,v_price.amount_minor,
   v_price.setup_min_minor,v_price.setup_max_minor,v_price.setup_optional,v_price.tax_treatment,p_actor,p_owner_ref,p_release_ref);
  v_result:=v_result||jsonb_build_object(v_code,v_plan);
  if v_code='free' then v_free_digest:=v_digest; elsif v_code='pro' then v_pro_digest:=v_digest; end if;
 end loop;
 -- All tiers must retain Free workspace and integration scope and at least Free quotas.
 if exists(select 1 from saas_governance.published_plan_versions p
 where not ((p.snapshot->'workspace_codes') @> (p_catalog->'free'->'workspace_codes'))
 or not ((p.snapshot->'integration_codes') @> (p_catalog->'free'->'integration_codes'))
 or (p.snapshot->>'named_users')::integer < (p_catalog->'free'->>'named_users')::integer
 or (p.snapshot->>'lead_records')::integer < (p_catalog->'free'->>'lead_records')::integer)
 then raise exception 'Paid tier must retain Free scope and limits'; end if;
 if not saas_governance.prepare_initial_trial_policy(v_free_digest,v_pro_digest,p_owner_ref)
 then raise exception 'Disabled trial policy preparation failed'; end if;
 insert into saas_governance.initial_catalog_owner_authorization(actor_user_id,platform_organization_id,approved_catalog,catalog_sha256,owner_approval_ref,release_approval_ref)
 values(p_actor,p_platform,p_catalog,p_digest,p_owner_ref,p_release_ref);
 return v_result;
end;
$fn$;
revoke all on function saas_governance.bootstrap_initial_owner_catalog_v1(uuid,uuid,jsonb,text,text,text) from public,anon,authenticated,service_role;
commit;
