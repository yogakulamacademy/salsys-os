-- R13-P1 candidate. Depends on P0 #827. NOT an installed migration.
-- No seeds, automatic publication, billing, subscription assignment, or capability enablement.
begin;
create schema saas_governance;
revoke all on schema saas_governance from public, anon, authenticated, service_role;
grant usage on schema saas_governance to service_role;

-- Independent operator grants. Empty by design; provisioning these grants
-- requires separate security approval. A platform admin role alone is insufficient.
create table saas_governance.operators (
  user_id uuid primary key,
  platform_organization_id uuid not null references public.organizations(id) on delete restrict,
  may_author boolean not null default false,
  may_review boolean not null default false,
  may_publish boolean not null default false,
  active boolean not null default false,
  check(may_author or may_review or may_publish)
);

-- One immutable proposal per logical plan/version; competing proposals may
-- exist but only later publication can advance the current canonical version.
create table saas_governance.plan_requests (
  id uuid primary key default gen_random_uuid(),
  plan_code text not null check(plan_code in ('free','basic','growth','pro')),
  expected_plan_version integer not null check(expected_plan_version >= 0),
  snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
  snapshot_sha256 text not null check(snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  rationale text not null check(char_length(btrim(rationale)) between 10 and 2048),
  author_user_id uuid not null,
  reviewer_user_id uuid,
  status text not null default 'draft' check(status in ('draft','under_review','reviewed_for_design','rejected')),
  revision integer not null default 1 check(revision between 1 and 3),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check(reviewer_user_id is null or reviewer_user_id <> author_user_id),
  check((status in ('draft','under_review') and reviewer_user_id is null)
     or (status in ('reviewed_for_design','rejected') and reviewer_user_id is not null))
);

-- The price proposal is exact minor-unit INR, never a charge or published price.
create table saas_governance.price_proposals (
  request_id uuid primary key references saas_governance.plan_requests(id) on delete restrict,
  currency text not null check(currency='INR'),
  billing_period text not null check(billing_period='month'),
  amount_minor bigint not null check(amount_minor between 0 and 1000000000),
  setup_min_minor bigint not null check(setup_min_minor between 0 and 1000000000),
  setup_max_minor bigint not null check(setup_max_minor between setup_min_minor and 1000000000),
  setup_optional boolean not null,
  tax_treatment text not null check(tax_treatment in ('exclusive','inclusive'))
);
create table saas_governance.review_events (
  request_id uuid not null references saas_governance.plan_requests(id) on delete restrict,
  revision integer not null,
  action text not null check(action in ('created','submitted','reviewed_for_design','rejected')),
  actor_user_id uuid not null,
  snapshot_sha256 text not null,
  reason text not null check(char_length(btrim(reason)) between 1 and 2048),
  occurred_at timestamptz not null default clock_timestamp(),
  primary key(request_id,revision)
);
alter table saas_governance.operators enable row level security;
alter table saas_governance.plan_requests enable row level security;
alter table saas_governance.price_proposals enable row level security;
alter table saas_governance.review_events enable row level security;
revoke all on all tables in schema saas_governance from public, anon, authenticated, service_role;
grant select on saas_governance.plan_requests,saas_governance.price_proposals,saas_governance.review_events to service_role;

create function saas_governance.block_immutable() returns trigger
language plpgsql set search_path=pg_catalog as $fn$
begin
  raise exception 'Commercial review evidence is immutable' using errcode='55000';
end;
$fn$;
create trigger price_proposal_immutable before update or delete on saas_governance.price_proposals
for each row execute function saas_governance.block_immutable();
create trigger price_proposal_no_truncate before truncate on saas_governance.price_proposals
for each statement execute function saas_governance.block_immutable();
create trigger review_event_immutable before update or delete on saas_governance.review_events
for each row execute function saas_governance.block_immutable();
create trigger review_event_no_truncate before truncate on saas_governance.review_events
for each statement execute function saas_governance.block_immutable();

-- Actor IDs are supplied ONLY by a future fresh-session trusted server
-- boundary, not by user input. This additional database check cannot prove
-- the actor's session; the server boundary is mandatory before activation.
create function saas_governance.require_operator(p_actor uuid,p_review boolean) returns void
language plpgsql security definer set search_path=pg_catalog as $fn$
begin
  if p_actor is null or not exists (
    select 1 from saas_governance.operators g
    join public.profiles p on p.id=g.user_id and p.active
    join public.organization_members m on m.user_id=g.user_id and m.organization_id=g.platform_organization_id and m.active
      and m.role in ('owner','admin')
    join public.organizations o on o.id=m.organization_id and o.status='active' and o.slug='salsysos'
    where g.user_id=p_actor and g.active
      and case when p_review is null then (g.may_author or g.may_review or g.may_publish) when p_review then g.may_review else g.may_author end
  ) then raise exception 'Commercial operator not authorized' using errcode='42501'; end if;
end;
$fn$;

create function saas_governance.require_base_version(p_code text,p_expected integer) returns void
language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_version integer;
begin
  select version into v_version from public.saas_plans where code=p_code for share;
  if coalesce(v_version,0) is distinct from p_expected then
    raise exception 'Commercial plan version changed' using errcode='40001';
  end if;
end;
$fn$;

-- Snapshot schema is deliberately closed: no caller-defined provider keys,
-- customer records, or runtime capabilities can be included in this request.
create function saas_governance.create_plan_request(
  p_actor uuid,p_code text,p_expected integer,p_snapshot jsonb,p_rationale text
) returns uuid language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_id uuid; v_digest text; v_key text;
begin
  perform saas_governance.require_operator(p_actor,false);
  if p_code is null or p_code not in ('free','basic','growth','pro') or p_expected is null or p_expected<0
    or p_snapshot is null or jsonb_typeof(p_snapshot)<>'object'
    or not (p_snapshot ?& array['display_name','amount_minor','setup_min_minor','setup_max_minor','setup_optional','tax_treatment','named_users','lead_records','workspace_codes','integration_codes'])
    or (p_snapshot - array['display_name','amount_minor','setup_min_minor','setup_max_minor','setup_optional','tax_treatment','named_users','lead_records','workspace_codes','integration_codes']) <> '{}'::jsonb
  then raise exception 'Invalid commercial snapshot'; end if;
  if jsonb_typeof(p_snapshot->'display_name')<>'string'
    or char_length(btrim(p_snapshot->>'display_name')) not between 2 and 160
    or jsonb_typeof(p_snapshot->'setup_optional')<>'boolean'
    or jsonb_typeof(p_snapshot->'tax_treatment')<>'string'
    or p_snapshot->>'tax_treatment' not in ('inclusive','exclusive')
  then raise exception 'Invalid commercial terms'; end if;
  foreach v_key in array array['amount_minor','setup_min_minor','setup_max_minor','named_users','lead_records'] loop
    if jsonb_typeof(p_snapshot->v_key)<>'number' or (p_snapshot->>v_key) !~ '^[0-9]{1,10}$' then
      raise exception 'Commercial prices and limits require nonnegative integers';
    end if;
  end loop;
  if (p_snapshot->>'named_users')::bigint not between 1 and 1000000
    or (p_snapshot->>'lead_records')::bigint not between 1 and 100000000
    or (p_code='free' and ((p_snapshot->>'amount_minor')::bigint<>0 or not (p_snapshot->>'setup_optional')::boolean))
    or (p_code<>'free' and (p_snapshot->>'amount_minor')::bigint=0)
  then raise exception 'Invalid plan price or quota'; end if;
  if jsonb_typeof(p_snapshot->'workspace_codes')<>'array'
    or jsonb_typeof(p_snapshot->'integration_codes')<>'array'
  then raise exception 'Invalid plan scope'; end if;
  if not (p_snapshot->'workspace_codes' ? 'admin')
    or exists(select 1 from jsonb_array_elements(p_snapshot->'workspace_codes') x(value)
      where jsonb_typeof(x.value)<>'string' or not exists(
        select 1 from public.workspace_catalog w where w.code=x.value#>>'{}' and w.status='active'))
    or exists(select 1 from jsonb_array_elements(p_snapshot->'integration_codes') x(value)
      where jsonb_typeof(x.value)<>'string' or (x.value#>>'{}') not in ('whatsapp','instagram','ga4','gsc','google_ads','meta_ads'))
  then raise exception 'Invalid workspace or integration code'; end if;
  perform saas_governance.require_base_version(p_code,p_expected);
  v_digest := encode(sha256(convert_to(p_snapshot::text,'UTF8')),'hex');
  insert into saas_governance.plan_requests(plan_code,expected_plan_version,snapshot,snapshot_sha256,rationale,author_user_id)
    values(p_code,p_expected,p_snapshot,v_digest,p_rationale,p_actor) returning id into v_id;
  insert into saas_governance.price_proposals values(v_id,'INR','month',
    (p_snapshot->>'amount_minor')::bigint,(p_snapshot->>'setup_min_minor')::bigint,
    (p_snapshot->>'setup_max_minor')::bigint,(p_snapshot->>'setup_optional')::boolean,p_snapshot->>'tax_treatment');
  insert into saas_governance.review_events(request_id,revision,action,actor_user_id,snapshot_sha256,reason)
    values(v_id,1,'created',p_actor,v_digest,p_rationale);
  return v_id;
end;
$fn$;

create function saas_governance.transition_plan_request(
  p_actor uuid,p_request uuid,p_revision integer,p_digest text,p_action text,p_reason text
) returns boolean language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_req saas_governance.plan_requests%rowtype; v_next text; v_review boolean;
begin
  if p_action is null or p_action not in ('submit','review','reject') then raise exception 'Invalid review action'; end if;
  v_review := p_action<>'submit';
  perform saas_governance.require_operator(p_actor,v_review);
  select * into v_req from saas_governance.plan_requests where id=p_request for update;
  if not found or v_req.revision is distinct from p_revision or v_req.snapshot_sha256 is distinct from p_digest then return false; end if;
  if not v_review then
    if v_req.author_user_id<>p_actor or v_req.status<>'draft' then return false; end if;
    v_next:='under_review';
  else
    if v_req.author_user_id=p_actor or v_req.status<>'under_review' then return false; end if;
    v_next:=case when p_action='review' then 'reviewed_for_design' else 'rejected' end;
  end if;
  perform saas_governance.require_base_version(v_req.plan_code,v_req.expected_plan_version);
  update saas_governance.plan_requests set status=v_next,revision=revision+1,
    reviewer_user_id=case when v_review then p_actor else null end,updated_at=clock_timestamp()
    where id=p_request;
  insert into saas_governance.review_events(request_id,revision,action,actor_user_id,snapshot_sha256,reason)
    values(p_request,v_req.revision+1,case when v_review then v_next else 'submitted' end,p_actor,v_req.snapshot_sha256,p_reason);
  return true;
end;
$fn$;

revoke all on all functions in schema saas_governance from public, anon, authenticated, service_role;
grant execute on function
  saas_governance.create_plan_request(uuid,text,integer,jsonb,text),
  saas_governance.transition_plan_request(uuid,uuid,integer,text,text,text)
to service_role;
-- Separate exact release authorization. Only a database security operator
-- can record it after commercial/security/release approval. No UI or service
-- role can create these records; no approvals or operators are seeded.
create table saas_governance.publication_authorizations (
  request_id uuid primary key references saas_governance.plan_requests(id) on delete restrict,
  snapshot_sha256 text not null check(snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  authorized_publisher uuid not null references saas_governance.operators(user_id) on delete restrict,
  commercial_approval_ref text not null check(char_length(btrim(commercial_approval_ref)) between 10 and 512),
  release_approval_ref text not null check(char_length(btrim(release_approval_ref)) between 10 and 512),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  check(expires_at>created_at)
);
-- Published snapshots retain the precise offer; no mutable price or
-- terms are used as evidence for a historical contract.
create table saas_governance.published_plan_versions (
  plan_id uuid not null references public.saas_plans(id) on delete restrict,
  version integer not null check(version>0),
  request_id uuid not null unique references saas_governance.plan_requests(id) on delete restrict,
  plan_code text not null check(plan_code in ('free','basic','growth','pro')),
  snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
  snapshot_sha256 text not null check(snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  currency text not null check(currency='INR'),
  billing_period text not null check(billing_period='month'),
  amount_minor bigint not null check(amount_minor>=0),
  setup_min_minor bigint not null check(setup_min_minor>=0),
  setup_max_minor bigint not null check(setup_max_minor>=setup_min_minor),
  setup_optional boolean not null,
  tax_treatment text not null check(tax_treatment in ('exclusive','inclusive')),
  published_by uuid not null,
  commercial_approval_ref text not null,
  release_approval_ref text not null,
  effective_from timestamptz not null default clock_timestamp(),
  primary key(plan_id,version),
  unique(plan_code,version)
);
alter table saas_governance.publication_authorizations enable row level security;
alter table saas_governance.published_plan_versions enable row level security;
revoke all on saas_governance.publication_authorizations,saas_governance.published_plan_versions from public,anon,authenticated,service_role;
grant select on saas_governance.published_plan_versions to service_role;
create trigger published_plan_immutable before update or delete on saas_governance.published_plan_versions
for each row execute function saas_governance.block_immutable();
create trigger published_plan_no_truncate before truncate on saas_governance.published_plan_versions
for each statement execute function saas_governance.block_immutable();

-- Narrow service-only bridge: the private schema need not be exposed through
-- PostgREST. The caller must derive the actor from a fresh verified session.
create function saas_governance.read_plan_requests(p_actor uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_result jsonb;
begin
  perform saas_governance.require_operator(p_actor,null);
  select jsonb_build_object(
    'may_author',g.may_author,'may_review',g.may_review,'may_publish',g.may_publish,
    'requests',coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id)
      from (
        select id,plan_code,expected_plan_version,snapshot,snapshot_sha256,rationale,
          author_user_id,reviewer_user_id,status,revision,created_at
        from saas_governance.plan_requests order by created_at desc,id limit 100
      ) r
    ),'[]'::jsonb),
    'authorized_request_ids',coalesce((
      select jsonb_agg(a.request_id) from saas_governance.publication_authorizations a
      join saas_governance.plan_requests r on r.id=a.request_id and r.snapshot_sha256=a.snapshot_sha256
      where a.authorized_publisher=p_actor and g.may_publish and a.revoked_at is null
        and a.expires_at>clock_timestamp() and r.status='reviewed_for_design'
        and r.author_user_id<>p_actor and r.reviewer_user_id<>p_actor
        and r.expected_plan_version=0
        and not exists(select 1 from public.saas_plans p where p.code=r.plan_code)
    ),'[]'::jsonb),
    'published_request_ids',coalesce((select jsonb_agg(request_id) from saas_governance.published_plan_versions),'[]'::jsonb),
    'versions',coalesce((
      select jsonb_object_agg(code,version) from public.saas_plans
        where code in ('free','basic','growth','pro')
    ),'{}'::jsonb)
  ) into v_result from saas_governance.operators g where g.user_id=p_actor;
  return v_result;
end;
$fn$;
revoke all on function saas_governance.read_plan_requests(uuid) from public,anon,authenticated,service_role;
grant execute on function saas_governance.read_plan_requests(uuid) to service_role;

create function public.commercial_read_plan_requests_v1(p_actor uuid)
returns jsonb language sql security invoker set search_path=pg_catalog as $fn$
  select saas_governance.read_plan_requests(p_actor);
$fn$;
create function public.commercial_create_plan_request_v1(p_actor uuid,p_code text,p_expected integer,p_snapshot jsonb,p_rationale text)
returns uuid language sql security invoker set search_path=pg_catalog as $fn$
  select saas_governance.create_plan_request(p_actor,p_code,p_expected,p_snapshot,p_rationale);
$fn$;
create function public.commercial_transition_plan_request_v1(p_actor uuid,p_request uuid,p_revision integer,p_digest text,p_action text,p_reason text)
returns boolean language sql security invoker set search_path=pg_catalog as $fn$
  select saas_governance.transition_plan_request(p_actor,p_request,p_revision,p_digest,p_action,p_reason);
$fn$;
revoke all on function public.commercial_read_plan_requests_v1(uuid),
  public.commercial_create_plan_request_v1(uuid,text,integer,jsonb,text),
  public.commercial_transition_plan_request_v1(uuid,uuid,integer,text,text,text)
from public,anon,authenticated,service_role;
grant execute on function public.commercial_read_plan_requests_v1(uuid),
  public.commercial_create_plan_request_v1(uuid,text,integer,jsonb,text),
  public.commercial_transition_plan_request_v1(uuid,uuid,integer,text,text,text)
to service_role;
-- Initial publication only. Existing plans are intentionally not mutated:
-- P2 trials pin plan versions and current subscription terms must be
-- reconciled against immutable contracts before a version upgrade is allowed.
create function saas_governance.publish_initial_plan(
  p_actor uuid,p_request uuid,p_revision integer,p_digest text
) returns uuid language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_req saas_governance.plan_requests%rowtype;
  v_auth saas_governance.publication_authorizations%rowtype;
  v_price saas_governance.price_proposals%rowtype;
  v_plan uuid;
begin
  perform saas_governance.require_operator(p_actor,null);
  if not exists(select 1 from saas_governance.operators where user_id=p_actor and active and may_publish) then
    raise exception 'Publication permission required' using errcode='42501';
  end if;
  select * into v_req from saas_governance.plan_requests where id=p_request for update;
  if not found or v_req.status<>'reviewed_for_design' or v_req.revision is distinct from p_revision
    or v_req.snapshot_sha256 is distinct from p_digest
    or v_req.author_user_id=p_actor or v_req.reviewer_user_id=p_actor
  then raise exception 'Independent reviewed proposal required'; end if;
  select * into v_auth from saas_governance.publication_authorizations where request_id=p_request for update;
  if not found or v_auth.authorized_publisher<>p_actor or v_auth.snapshot_sha256<>v_req.snapshot_sha256
    or v_auth.revoked_at is not null or v_auth.expires_at<=clock_timestamp()
  then raise exception 'Valid publication authorization required' using errcode='42501'; end if;
  -- Retry after a successful commit returns the same plan, no second price row.
  select plan_id into v_plan from saas_governance.published_plan_versions where request_id=p_request;
  if found then return v_plan; end if;
  perform pg_advisory_xact_lock(hashtextextended('saas_initial_publish:'||v_req.plan_code,0));
  if v_req.expected_plan_version<>0 or exists(select 1 from public.saas_plans where code=v_req.plan_code) then
    raise exception 'Existing plan version changes require customer contract migration' using errcode='40001';
  end if;
  if exists(select 1 from jsonb_array_elements_text(v_req.snapshot->'workspace_codes') c(code)
    where not exists(select 1 from public.workspace_catalog w where w.code=c.code and w.status='active'))
  then raise exception 'Approved workspace scope no longer available'; end if;
  select * into strict v_price from saas_governance.price_proposals where request_id=p_request;
  -- Canonical catalog availability is not a customer assignment, trial policy,
  -- provider connection or a runtime capability grant.
  insert into public.saas_plans(code,display_name,status,version,limits,metadata)
  values(v_req.plan_code,v_req.snapshot->>'display_name','active',1,
    jsonb_build_object('named_users',v_req.snapshot->'named_users','lead_records',v_req.snapshot->'lead_records'),
    jsonb_build_object('publication_request_id',p_request,'snapshot_sha256',v_req.snapshot_sha256))
  returning id into v_plan;
  insert into saas_governance.published_plan_versions(plan_id,version,request_id,plan_code,snapshot,snapshot_sha256,
    currency,billing_period,amount_minor,setup_min_minor,setup_max_minor,setup_optional,tax_treatment,
    published_by,commercial_approval_ref,release_approval_ref)
  values(v_plan,1,p_request,v_req.plan_code,v_req.snapshot,v_req.snapshot_sha256,
    v_price.currency,v_price.billing_period,v_price.amount_minor,v_price.setup_min_minor,v_price.setup_max_minor,
    v_price.setup_optional,v_price.tax_treatment,p_actor,v_auth.commercial_approval_ref,v_auth.release_approval_ref);
  return v_plan;
end;
$fn$;
revoke all on function saas_governance.publish_initial_plan(uuid,uuid,integer,text) from public,anon,authenticated,service_role;
grant execute on function saas_governance.publish_initial_plan(uuid,uuid,integer,text) to service_role;
create function public.commercial_publish_initial_plan_v1(p_actor uuid,p_request uuid,p_revision integer,p_digest text)
returns uuid language sql security invoker set search_path=pg_catalog as $fn$
  select saas_governance.publish_initial_plan(p_actor,p_request,p_revision,p_digest);
$fn$;
revoke all on function public.commercial_publish_initial_plan_v1(uuid,uuid,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.commercial_publish_initial_plan_v1(uuid,uuid,integer,text) to service_role;
-- No subscription mutation, charge, capability or signup policy enablement.
commit;
