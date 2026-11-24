-- R13 subscription contract preparation candidate. NOT a migration.
-- Requires P0 + governed plan admin + subscription change requests.
-- No payment evidence, settlement, assignment, renewal, or activation RPC.
begin;

-- Quoting permission is independent from author/reviewer/publisher.
alter table saas_governance.operators add column may_quote boolean not null default false;
-- A quote-only operator is not implicitly a plan administrator. Existing
-- operators still need the dedicated platform membership and quote permission.

create table saas_governance.subscription_contract_quotes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references saas_governance.subscription_change_requests(id) on delete restrict,
  organization_id uuid not null,
  subscription_id uuid not null,
  plan_id uuid not null,
  plan_version integer not null,
  offer_digest text not null check(offer_digest ~ '^[0-9a-f]{64}$'),
  terms jsonb not null check(jsonb_typeof(terms)='object'),
  terms_digest text not null check(terms_digest ~ '^[0-9a-f]{64}$'),
  currency text not null check(currency='INR'),
  monthly_minor bigint not null check(monthly_minor between 0 and 1000000000),
  setup_minor bigint not null check(setup_minor between 0 and 1000000000),
  tax_minor bigint not null check(tax_minor between 0 and 2000000000),
  first_period_total_minor bigint not null,
  tax_treatment text not null check(tax_treatment in ('inclusive','exclusive')),
  quoted_by uuid not null,
  quote_reason text not null check(char_length(btrim(quote_reason)) between 10 and 2048),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  check(expires_at>created_at),
  check(first_period_total_minor=monthly_minor+setup_minor+
    case when tax_treatment='exclusive' then tax_minor else 0 end),
  check(tax_treatment<>'inclusive' or tax_minor<=monthly_minor+setup_minor),
  foreign key(subscription_id,organization_id) references public.saas_organization_subscriptions(id,organization_id) on delete restrict,
  foreign key(plan_id,plan_version) references saas_governance.published_plan_versions(plan_id,version) on delete restrict
);

-- Customer acceptance is separate, immutable and explicitly non-binding until
-- payment/provider checks and a reviewed activation transaction are available.
create table saas_governance.subscription_contract_acceptances (
  quote_id uuid primary key references saas_governance.subscription_contract_quotes(id) on delete restrict,
  terms_digest text not null check(terms_digest ~ '^[0-9a-f]{64}$'),
  accepted_by uuid not null,
  accepted_at timestamptz not null default clock_timestamp()
);
alter table saas_governance.subscription_contract_quotes enable row level security;
alter table saas_governance.subscription_contract_acceptances enable row level security;
revoke all on saas_governance.subscription_contract_quotes,saas_governance.subscription_contract_acceptances
  from public,anon,authenticated,service_role;
create trigger contract_quotes_immutable before update or delete on saas_governance.subscription_contract_quotes
  for each row execute function saas_governance.block_immutable();
create trigger contract_quotes_no_truncate before truncate on saas_governance.subscription_contract_quotes
  for each statement execute function saas_governance.block_immutable();
create trigger contract_acceptances_immutable before update or delete on saas_governance.subscription_contract_acceptances
  for each row execute function saas_governance.block_immutable();
create trigger contract_acceptances_no_truncate before truncate on saas_governance.subscription_contract_acceptances
  for each statement execute function saas_governance.block_immutable();

-- Exact published price, no client-supplied monthly amount. The operator
-- quotes setup and tax only, with an explicit rationale. No proration,
-- credits, future renewal mandate, or tax-rate inference in this candidate.
create function saas_governance.prepare_contract_quote(
  p_actor uuid,p_request uuid,p_setup_minor bigint,p_tax_minor bigint,p_reason text
) returns uuid language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_req saas_governance.subscription_change_requests%rowtype;
  v_offer saas_governance.published_plan_versions%rowtype;
  v_sub public.saas_organization_subscriptions%rowtype;
  v_quote saas_governance.subscription_contract_quotes%rowtype;
  v_org uuid; v_terms jsonb; v_total bigint; v_id uuid; v_expiry timestamptz;
begin
  perform saas_governance.require_operator(p_actor,null);
  if not exists(select 1 from saas_governance.operators where user_id=p_actor and active and may_quote)
    then raise exception 'Quote permission required' using errcode='42501'; end if;
  if p_setup_minor is null or p_setup_minor not between 0 and 1000000000
    or p_tax_minor is null or p_tax_minor not between 0 and 2000000000
    or p_reason is null or char_length(btrim(p_reason)) not between 10 and 2048
    then raise exception 'Exact quote terms required'; end if;
  select organization_id into v_org from saas_governance.subscription_change_requests where id=p_request;
  if not found then raise exception 'Request unavailable'; end if;
  -- Same lock order as request and withdrawal; quote and accept cannot race
  -- a cancellation into an apparently valid contract.
  perform pg_advisory_xact_lock(hashtextextended('saas_change:'||v_org::text,0));
  select * into v_req from saas_governance.subscription_change_requests where id=p_request for update;
  if v_req.status<>'requested' or v_req.requested_by=p_actor
    then raise exception 'Independent pending request required'; end if;
  if not exists(select 1 from saas_governance.change_request_access where organization_id=v_org and enabled)
    then raise exception 'Plan changes unavailable'; end if;
  select * into v_sub from public.saas_organization_subscriptions where id=v_req.subscription_id and organization_id=v_org for update;
  if not found or v_sub.updated_at<>v_req.from_subscription_updated_at or v_sub.plan_id<>v_req.from_plan_id
    or v_sub.status not in ('trialing','active')
    or (v_sub.status='trialing' and (v_sub.trial_ends_at is null or v_sub.trial_ends_at<=clock_timestamp()))
    then raise exception 'Subscription changed; new request required' using errcode='40001'; end if;
  select p.* into v_offer from saas_governance.published_plan_versions p
    join public.saas_plans c on c.id=p.plan_id and c.version=p.version and c.code=p.plan_code and c.status='active'
    where p.plan_id=v_req.target_plan_id and p.version=v_req.target_version
      and p.snapshot_sha256=v_req.target_digest and p.effective_from<=clock_timestamp() for share of c;
  if not found then raise exception 'Published offer unavailable'; end if;
  if not (p_setup_minor=0 and v_offer.setup_optional)
    and p_setup_minor not between v_offer.setup_min_minor and v_offer.setup_max_minor
    then raise exception 'Setup charge outside approved range'; end if;
  if v_offer.tax_treatment='inclusive' and p_tax_minor>v_offer.amount_minor+p_setup_minor
    then raise exception 'Inclusive tax exceeds quoted consideration'; end if;
  -- Free is always free to use. No mandatory charge or payment mandate.
  if v_offer.plan_code='free' and (v_offer.amount_minor<>0 or p_setup_minor<>0 or p_tax_minor<>0)
    then raise exception 'Free plan change must have zero charges'; end if;
  v_total:=v_offer.amount_minor+p_setup_minor+
    case when v_offer.tax_treatment='exclusive' then p_tax_minor else 0 end;
  select * into v_quote from saas_governance.subscription_contract_quotes where request_id=p_request;
  if found then
    if v_quote.quoted_by<>p_actor or v_quote.setup_minor<>p_setup_minor or v_quote.tax_minor<>p_tax_minor
      or v_quote.quote_reason<>p_reason or v_quote.expires_at<=clock_timestamp()
      then raise exception 'Existing quote differs or expired; new request required'; end if;
    return v_quote.id;
  end if;
  v_expiry:=clock_timestamp()+interval '24 hours';
  if v_sub.status='trialing' then v_expiry:=least(v_expiry,v_sub.trial_ends_at); end if;
  v_terms:=jsonb_build_object('request_id',p_request,'organization_id',v_org,
    'subscription_id',v_sub.id,'subscription_revision',v_sub.updated_at,
    'plan_id',v_offer.plan_id,'plan_version',v_offer.version,'offer_digest',v_offer.snapshot_sha256,
    'offer_snapshot',v_offer.snapshot,'currency',v_offer.currency,'billing_period',v_offer.billing_period,
    'monthly_minor',v_offer.amount_minor,'setup_minor',p_setup_minor,'tax_minor',p_tax_minor,
    'tax_treatment',v_offer.tax_treatment,'first_period_total_minor',v_total,
    'expires_at',v_expiry,'automatic_renewal',false);
  insert into saas_governance.subscription_contract_quotes(
    request_id,organization_id,subscription_id,plan_id,plan_version,offer_digest,terms,terms_digest,
    currency,monthly_minor,setup_minor,tax_minor,first_period_total_minor,tax_treatment,quoted_by,quote_reason,expires_at)
  values(p_request,v_org,v_sub.id,v_offer.plan_id,v_offer.version,v_offer.snapshot_sha256,
    v_terms,encode(sha256(convert_to(v_terms::text,'UTF8')),'hex'),v_offer.currency,
    v_offer.amount_minor,p_setup_minor,p_tax_minor,v_total,v_offer.tax_treatment,p_actor,p_reason,v_expiry)
  returning id into v_id;
  return v_id;
end;
$fn$;
revoke all on function saas_governance.prepare_contract_quote(uuid,uuid,bigint,bigint,text) from public,anon,authenticated,service_role;
grant execute on function saas_governance.prepare_contract_quote(uuid,uuid,bigint,bigint,text) to service_role;
create function public.commercial_prepare_contract_quote_v1(p_actor uuid,p_request uuid,p_setup_minor bigint,p_tax_minor bigint,p_reason text)
returns uuid language sql security invoker set search_path=pg_catalog as $fn$
  select saas_governance.prepare_contract_quote(p_actor,p_request,p_setup_minor,p_tax_minor,p_reason);
$fn$;
revoke all on function public.commercial_prepare_contract_quote_v1(uuid,uuid,bigint,bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.commercial_prepare_contract_quote_v1(uuid,uuid,bigint,bigint,text) to service_role;

-- Only the active, verified owner of this workspace can see its quote.
create function public.get_current_contract_quotes_v1() returns jsonb
language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_org uuid; v_result jsonb;
begin
  v_org:=saas_governance.current_change_owner();
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'request_id',q.request_id,
    'terms_digest',q.terms_digest,'plan_code',p.plan_code,'plan_version',q.plan_version,
    'monthly_minor',q.monthly_minor,'setup_minor',q.setup_minor,'tax_minor',q.tax_minor,
    'tax_treatment',q.tax_treatment,'first_period_total_minor',q.first_period_total_minor,
    'currency',q.currency,'expires_at',q.expires_at,'accepted_at',a.accepted_at,
    'offer_snapshot',p.snapshot,'state',case
      when r.status<>'requested' then 'withdrawn'
      when q.expires_at<=clock_timestamp() then 'expired'
      when s.updated_at<>r.from_subscription_updated_at or s.plan_id<>r.from_plan_id then 'stale'
      when a.quote_id is not null then 'accepted_not_activated'
      when not exists(select 1 from saas_governance.change_request_access x where x.organization_id=v_org and x.enabled)
        or s.status not in ('active','trialing') or (s.status='trialing' and (s.trial_ends_at is null or s.trial_ends_at<=clock_timestamp()))
        or not exists(select 1 from public.saas_plans c where c.id=q.plan_id and c.version=q.plan_version and c.status='active') then 'unavailable'
      else 'awaiting_acceptance' end) order by q.created_at desc,q.id),'[]'::jsonb)
  into v_result from (
    select * from saas_governance.subscription_contract_quotes
    where organization_id=v_org order by created_at desc,id limit 50
  ) q join saas_governance.subscription_change_requests r on r.id=q.request_id
  join public.saas_organization_subscriptions s on s.id=q.subscription_id and s.organization_id=v_org
  join saas_governance.published_plan_versions p on p.plan_id=q.plan_id and p.version=q.plan_version
  left join saas_governance.subscription_contract_acceptances a on a.quote_id=q.id;
  return v_result;
end;
$fn$;

create function public.accept_current_contract_quote_v1(p_quote uuid,p_terms_digest text) returns boolean
language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_org uuid; v_quote saas_governance.subscription_contract_quotes%rowtype;
  v_req saas_governance.subscription_change_requests%rowtype;
  v_sub public.saas_organization_subscriptions%rowtype;
begin
  v_org:=saas_governance.current_change_owner();
  perform pg_advisory_xact_lock(hashtextextended('saas_change:'||v_org::text,0));
  select * into v_quote from saas_governance.subscription_contract_quotes where id=p_quote and organization_id=v_org;
  if not found or v_quote.terms_digest is distinct from p_terms_digest or v_quote.quoted_by=auth.uid()
    then return false; end if;
  if not exists(select 1 from saas_governance.change_request_access where organization_id=v_org and enabled)
    then return false; end if;
  select * into v_req from saas_governance.subscription_change_requests where id=v_quote.request_id for update;
  select * into v_sub from public.saas_organization_subscriptions where id=v_quote.subscription_id and organization_id=v_org for update;
  if not found or v_req.status<>'requested' or v_quote.expires_at<=clock_timestamp()
    or v_sub.updated_at<>v_req.from_subscription_updated_at or v_sub.plan_id<>v_req.from_plan_id
    or v_sub.status not in ('active','trialing')
    or (v_sub.status='trialing' and (v_sub.trial_ends_at is null or v_sub.trial_ends_at<=clock_timestamp()))
    or not exists(select 1 from public.saas_plans where id=v_quote.plan_id and version=v_quote.plan_version and status='active')
  then return false; end if;
  insert into saas_governance.subscription_contract_acceptances(quote_id,terms_digest,accepted_by)
    values(v_quote.id,v_quote.terms_digest,auth.uid()) on conflict(quote_id) do nothing;
  return true;
end;
$fn$;
revoke all on function public.get_current_contract_quotes_v1(),public.accept_current_contract_quote_v1(uuid,text)
from public,anon,authenticated,service_role;
grant execute on function public.get_current_contract_quotes_v1(),public.accept_current_contract_quote_v1(uuid,text) to authenticated;
-- Quote operator queue is deliberately narrow: no leads, user email, tokens,
-- subscription provider references or arbitrary customer data.
create function saas_governance.list_pending_contract_quotes(p_actor uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_result jsonb;
begin
  perform saas_governance.require_operator(p_actor,null);
  if not exists(select 1 from saas_governance.operators where user_id=p_actor and active and may_quote)
    then raise exception 'Quote permission required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.requested_at,x.id),'[]'::jsonb)
  into v_result from (
    select r.id,o.name as organization_name,p.plan_code,p.version,p.amount_minor,p.setup_min_minor,
      p.setup_max_minor,p.setup_optional,p.tax_treatment,r.requested_at
    from saas_governance.subscription_change_requests r
    join public.organizations o on o.id=r.organization_id and o.status='active'
    join saas_governance.change_request_access a on a.organization_id=r.organization_id and a.enabled
    join public.saas_organization_subscriptions s on s.id=r.subscription_id and s.organization_id=r.organization_id
      and s.updated_at=r.from_subscription_updated_at and s.plan_id=r.from_plan_id
    join saas_governance.published_plan_versions p on p.plan_id=r.target_plan_id and p.version=r.target_version
      and p.snapshot_sha256=r.target_digest
    join public.saas_plans c on c.id=p.plan_id and c.version=p.version and c.status='active'
    where r.status='requested' and r.requested_by<>p_actor and p.effective_from<=clock_timestamp()
      and s.status in ('active','trialing') and (s.status<>'trialing' or s.trial_ends_at>clock_timestamp())
      and not exists(select 1 from saas_governance.subscription_contract_quotes q where q.request_id=r.id)
    order by r.requested_at,r.id limit 100
  ) x;
  return v_result;
end;
$fn$;
revoke all on function saas_governance.list_pending_contract_quotes(uuid) from public,anon,authenticated,service_role;
grant execute on function saas_governance.list_pending_contract_quotes(uuid) to service_role;
create function public.commercial_list_pending_contract_quotes_v1(p_actor uuid) returns jsonb
language sql security invoker set search_path=pg_catalog as $fn$
  select saas_governance.list_pending_contract_quotes(p_actor);
$fn$;
revoke all on function public.commercial_list_pending_contract_quotes_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function public.commercial_list_pending_contract_quotes_v1(uuid) to service_role;

-- Acceptance is not payment, subscription activation, or a renewal mandate.
commit;
