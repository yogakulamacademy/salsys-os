-- R13-P3 candidate. NOT an installed migration.
-- Requires P0 + P1 plan admin, change requests and contract quotes.
-- Provider-independent payment consent and immutable verification evidence.
-- No provider adapter, actual checkout, renewal, invoice or activation.
begin;

-- Only DBA-approved merchant accounts may receive SaaS payment evidence.
-- Empty by design. No secrets or CRM payment-provider credentials are stored.
create table saas_governance.saas_payment_merchants (
  id uuid primary key default gen_random_uuid(),
  provider_code text not null check(provider_code ~ '^[a-z][a-z0-9_]{1,39}$'),
  merchant_ref text not null check(char_length(btrim(merchant_ref)) between 1 and 256),
  environment text not null check(environment in ('test','live')),
  enabled boolean not null default false,
  approval_ref text not null check(char_length(btrim(approval_ref)) between 10 and 512),
  unique(provider_code,merchant_ref,environment)
);
create table saas_governance.saas_payment_intents (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null unique references saas_governance.subscription_contract_acceptances(quote_id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  terms_digest text not null check(terms_digest ~ '^[0-9a-f]{64}$'),
  consented_by uuid not null,
  amount_minor bigint not null check(amount_minor between 1 and 4000000000),
  currency text not null check(currency='INR'),
  merchant_id uuid not null references saas_governance.saas_payment_merchants(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  check(expires_at>created_at)
);
-- A provider order is bound once, before any hosted checkout is handed out.
-- Neither this table nor an order reference establishes that money was paid.
create table saas_governance.saas_payment_orders (
  intent_id uuid primary key references saas_governance.saas_payment_intents(id) on delete restrict,
  merchant_id uuid not null references saas_governance.saas_payment_merchants(id) on delete restrict,
  provider_order_ref text not null check(char_length(btrim(provider_order_ref)) between 1 and 256),
  created_at timestamptz not null default clock_timestamp(),
  unique(merchant_id,provider_order_ref)
);
-- Only a separately reviewed provider-verification boundary may create
-- settlement attestations. This candidate deliberately grants NO service
-- write RPC for attestations. A browser callback or arbitrary JSON is not
-- proof of settlement. DBA fixture inserts are synthetic tests only.
create table saas_governance.saas_payment_attestations (
  id uuid primary key default gen_random_uuid(),
  intent_id uuid not null references saas_governance.saas_payment_orders(intent_id) on delete restrict,
  merchant_id uuid not null references saas_governance.saas_payment_merchants(id) on delete restrict,
  provider_order_ref text not null,
  provider_payment_ref text not null check(char_length(btrim(provider_payment_ref)) between 1 and 256),
  provider_event_ref text not null check(char_length(btrim(provider_event_ref)) between 1 and 256),
  terms_digest text not null check(terms_digest ~ '^[0-9a-f]{64}$'),
  currency text not null check(currency='INR'),
  amount_minor bigint not null check(amount_minor between 1 and 4000000000),
  provider_status text not null check(provider_status in ('settled','failed','refunded','disputed')),
  provider_observed_at timestamptz not null,
  verified_at timestamptz not null default clock_timestamp(),
  evidence_sha256 text not null check(evidence_sha256 ~ '^[0-9a-f]{64}$'),
  verification_ref text not null check(char_length(btrim(verification_ref)) between 10 and 512),
  unique(merchant_id,provider_event_ref)
);
-- Successful verification is immutable evidence, not a plan assignment.
create table saas_governance.saas_payment_settlements (
  intent_id uuid primary key references saas_governance.saas_payment_intents(id) on delete restrict,
  attestation_id uuid not null unique references saas_governance.saas_payment_attestations(id) on delete restrict,
  merchant_id uuid not null references saas_governance.saas_payment_merchants(id) on delete restrict,
  provider_payment_ref text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  unique(merchant_id,provider_payment_ref)
);
alter table saas_governance.saas_payment_merchants enable row level security;
alter table saas_governance.saas_payment_intents enable row level security;
alter table saas_governance.saas_payment_orders enable row level security;
alter table saas_governance.saas_payment_attestations enable row level security;
alter table saas_governance.saas_payment_settlements enable row level security;
revoke all on saas_governance.saas_payment_merchants,saas_governance.saas_payment_intents,
  saas_governance.saas_payment_orders,saas_governance.saas_payment_attestations,
  saas_governance.saas_payment_settlements from public,anon,authenticated,service_role;
do $ddl$
declare v_table text;
begin
  foreach v_table in array array['saas_payment_intents','saas_payment_orders','saas_payment_attestations','saas_payment_settlements'] loop
    execute format('create trigger payment_immutable before update or delete on saas_governance.%I for each row execute function saas_governance.block_immutable()',v_table);
    execute format('create trigger payment_no_truncate before truncate on saas_governance.%I for each statement execute function saas_governance.block_immutable()',v_table);
  end loop;
end;
$ddl$;

-- Private exact consent boundary. Not exposed until provider onboarding,
-- genuine payment consent UI and approved adapter are implemented.
create function saas_governance.prepare_payment_intent(p_quote uuid,p_digest text,p_merchant uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_org uuid; v_quote saas_governance.subscription_contract_quotes%rowtype;
  v_req saas_governance.subscription_change_requests%rowtype;
  v_sub public.saas_organization_subscriptions%rowtype;
  v_existing saas_governance.saas_payment_intents%rowtype; v_id uuid;
begin
  v_org:=saas_governance.current_change_owner();
  perform pg_advisory_xact_lock(hashtextextended('saas_change:'||v_org::text,0));
  select * into v_quote from saas_governance.subscription_contract_quotes where id=p_quote and organization_id=v_org;
  if not found or v_quote.terms_digest is distinct from p_digest or v_quote.first_period_total_minor<=0
    or v_quote.expires_at<=clock_timestamp() then raise exception 'Payable quote unavailable'; end if;
  if not exists(select 1 from saas_governance.subscription_contract_acceptances a where a.quote_id=p_quote
    and a.terms_digest=p_digest and a.accepted_by=auth.uid()) then raise exception 'Exact owner acceptance required'; end if;
  perform 1 from saas_governance.change_request_access where organization_id=v_org and enabled for share;
  if not found then raise exception 'Plan changes unavailable'; end if;
  select * into v_req from saas_governance.subscription_change_requests where id=v_quote.request_id for update;
  select * into v_sub from public.saas_organization_subscriptions where id=v_quote.subscription_id and organization_id=v_org for update;
  if not found or v_req.status<>'requested' or v_sub.updated_at<>v_req.from_subscription_updated_at
    or v_sub.plan_id<>v_req.from_plan_id or v_sub.status not in ('active','trialing')
    or (v_sub.status='trialing' and (v_sub.trial_ends_at is null or v_sub.trial_ends_at<=clock_timestamp()))
    then raise exception 'Subscription changed; new quote required'; end if;
  perform 1 from public.saas_plans where id=v_quote.plan_id and version=v_quote.plan_version and status='active' for share;
  if not found then raise exception 'Published offer unavailable'; end if;
  perform 1 from saas_governance.saas_payment_merchants where id=p_merchant and enabled for share;
  if not found then raise exception 'SaaS merchant unavailable'; end if;
  select * into v_existing from saas_governance.saas_payment_intents where quote_id=p_quote;
  if found then
    if v_existing.merchant_id<>p_merchant or v_existing.consented_by<>auth.uid() or v_existing.terms_digest<>p_digest
      then raise exception 'Payment intent already bound to different consent'; end if;
    return v_existing.id;
  end if;
  insert into saas_governance.saas_payment_intents(quote_id,organization_id,terms_digest,consented_by,amount_minor,currency,merchant_id,expires_at)
    values(p_quote,v_org,p_digest,auth.uid(),v_quote.first_period_total_minor,v_quote.currency,p_merchant,v_quote.expires_at)
    returning id into v_id;
  return v_id;
end;
$fn$;

-- Private server-side order binding. A future provider adapter must verify
-- order creation against the merchant and expected amount before calling.
-- No provider order can be rebound or reused across different intents.
create function saas_governance.bind_payment_order(
  p_intent uuid,p_merchant uuid,p_order_ref text,p_amount_minor bigint,p_currency text
) returns boolean language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_i saas_governance.saas_payment_intents%rowtype;
  v_o saas_governance.saas_payment_orders%rowtype;
begin
  select * into v_i from saas_governance.saas_payment_intents where id=p_intent for update;
  if not found or v_i.merchant_id is distinct from p_merchant
    or v_i.amount_minor is distinct from p_amount_minor or v_i.currency is distinct from p_currency
    or p_order_ref is null or char_length(btrim(p_order_ref)) not between 1 and 256
    then raise exception 'Provider order mismatch'; end if;
  select * into v_o from saas_governance.saas_payment_orders where intent_id=p_intent;
  if found then
    if v_o.provider_order_ref<>p_order_ref then raise exception 'Payment order already bound'; end if;
    return true;
  end if;
  if v_i.expires_at<=clock_timestamp() or not exists(
    select 1 from saas_governance.saas_payment_merchants where id=p_merchant and enabled
  ) then raise exception 'Payment intent unavailable'; end if;
  if not exists(select 1 from saas_governance.subscription_contract_quotes q
    join saas_governance.subscription_change_requests r on r.id=q.request_id and r.status='requested'
    join saas_governance.change_request_access a on a.organization_id=r.organization_id and a.enabled
    join public.saas_organization_subscriptions s on s.id=r.subscription_id and s.organization_id=r.organization_id
      and s.updated_at=r.from_subscription_updated_at and s.plan_id=r.from_plan_id
    join public.organizations o on o.id=r.organization_id and o.status='active'
    join public.saas_plans p on p.id=q.plan_id and p.version=q.plan_version and p.status='active'
    where q.id=v_i.quote_id and q.organization_id=v_i.organization_id
      and s.status in ('active','trialing') and (s.status<>'trialing' or s.trial_ends_at>clock_timestamp())
  ) then raise exception 'Payment intent no longer eligible'; end if;
  insert into saas_governance.saas_payment_orders(intent_id,merchant_id,provider_order_ref)
    values(p_intent,p_merchant,p_order_ref);
  return true;
end;
$fn$;
revoke all on function saas_governance.bind_payment_order(uuid,uuid,text,bigint,text)
  from public,anon,authenticated,service_role;

-- Consume only pre-existing trusted attestations, never a caller's claimed
-- amount or status. A mismatch or adverse event requires reconciliation.
-- No execute grants yet; activation code must recheck all current state.
create function saas_governance.record_verified_settlement(p_attestation uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_a saas_governance.saas_payment_attestations%rowtype;
  v_i saas_governance.saas_payment_intents%rowtype;
  v_o saas_governance.saas_payment_orders%rowtype;
  v_existing saas_governance.saas_payment_settlements%rowtype;
begin
  select * into v_a from saas_governance.saas_payment_attestations where id=p_attestation;
  if not found then raise exception 'Verified evidence unavailable'; end if;
  select * into v_i from saas_governance.saas_payment_intents where id=v_a.intent_id for update;
  select * into v_o from saas_governance.saas_payment_orders where intent_id=v_i.id;
  if not found or v_a.provider_status<>'settled' or v_a.merchant_id<>v_i.merchant_id
    or v_o.merchant_id<>v_i.merchant_id or v_a.provider_order_ref<>v_o.provider_order_ref
    or v_a.terms_digest<>v_i.terms_digest or v_a.currency<>v_i.currency or v_a.amount_minor<>v_i.amount_minor
    or v_a.provider_observed_at<v_o.created_at or v_a.provider_observed_at>v_i.expires_at
    or v_a.provider_observed_at>v_a.verified_at or v_a.verified_at>clock_timestamp()
    then raise exception 'Settlement evidence mismatch'; end if;
  if exists(select 1 from saas_governance.saas_payment_attestations x where x.merchant_id=v_a.merchant_id
    and x.provider_payment_ref=v_a.provider_payment_ref and x.provider_status in ('refunded','disputed'))
    then raise exception 'Payment requires adverse-event reconciliation'; end if;
  select * into v_existing from saas_governance.saas_payment_settlements where intent_id=v_i.id;
  if found then
    if v_existing.merchant_id<>v_a.merchant_id or v_existing.provider_payment_ref<>v_a.provider_payment_ref
      then raise exception 'Different payment already recorded; reconcile duplicate charge'; end if;
    return v_existing.intent_id;
  end if;
  insert into saas_governance.saas_payment_settlements(intent_id,attestation_id,merchant_id,provider_payment_ref)
    values(v_i.id,v_a.id,v_a.merchant_id,v_a.provider_payment_ref);
  return v_i.id;
end;
$fn$;
revoke all on function saas_governance.prepare_payment_intent(uuid,text,uuid),
  saas_governance.record_verified_settlement(uuid) from public,anon,authenticated,service_role;
-- No public bridge, no service writes, no checkout or activation.
commit;
