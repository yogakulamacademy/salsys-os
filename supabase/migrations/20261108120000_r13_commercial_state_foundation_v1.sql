-- R13-P0 provider-neutral SaaS commercial state foundation.
-- DRAFT ONLY: no plan/pricing seeds, customer assignments, billing integration,
-- capability changes, account suspension, public signup or customer backfill.
-- Intentionally separate from CRM student/customer payment records.
begin;

-- Logical plans are not prices and are not payment provider products.
create table public.saas_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]{1,63}$'),
  display_name text not null check (char_length(btrim(display_name)) between 2 and 160),
  description text not null default '',
  status text not null default 'inactive'
    check (status in ('active', 'inactive')),
  version integer not null default 1 check (version > 0),
  limits jsonb not null default '{}'::jsonb
    check (jsonb_typeof(limits) = 'object'),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A commercial allowance never enables an R11 runtime capability.
create table public.saas_plan_entitlements (
  plan_id uuid not null references public.saas_plans(id) on delete restrict,
  capability_code text not null references public.capability_catalog(code) on delete restrict,
  allowed boolean not null default false,
  limits jsonb not null default '{}'::jsonb
    check (jsonb_typeof(limits) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan_id, capability_code)
);

-- V1 keeps ONE current canonical record per organization. Commercial status
-- does NOT change organizations.status or runtime capabilities.
-- Canceled/expired rows remain so past status is never misreported as "free".
create table public.saas_organization_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique
    references public.organizations(id) on delete restrict,
  plan_id uuid not null references public.saas_plans(id) on delete restrict,
  status text not null check (status in
    ('trialing', 'active', 'past_due', 'canceled', 'expired')),
  source text not null default 'manual' check (source in ('manual', 'provider')),
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  current_period_started_at timestamptz,
  current_period_ends_at timestamptz,
  canceled_at timestamptz,
  provider_key text,
  provider_customer_ref text,
  provider_subscription_ref text,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saas_subscription_plan_tenant_unique unique (id, organization_id),
  constraint saas_subscription_trial_window check (
    trial_started_at is null or trial_ends_at is null
    or trial_ends_at >= trial_started_at
  ),
  constraint saas_subscription_period_window check (
    current_period_started_at is null or current_period_ends_at is null
    or current_period_ends_at >= current_period_started_at
  ),
  constraint saas_subscription_provider_ref_pair check (
    (provider_customer_ref is null and provider_subscription_ref is null)
    or (provider_key is not null and length(btrim(provider_key)) > 0)
  )
);

-- Append-only commercial change evidence, not a SaaS invoice or payment row.
-- Composite FK guarantees event organization matches the subscription owner.
create table public.saas_subscription_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  subscription_id uuid not null,
  event_type text not null check (event_type ~ '^[a-z][a-z0-9_]{2,79}$'),
  previous_status text check (previous_status is null or previous_status in
    ('trialing', 'active', 'past_due', 'canceled', 'expired')),
  new_status text check (new_status is null or new_status in
    ('trialing', 'active', 'past_due', 'canceled', 'expired')),
  source text not null check (source in ('manual','provider')),
  actor_user_id uuid,
  external_event_ref text,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now(),
  constraint saas_events_subscription_tenant_fk
    foreign key (subscription_id,organization_id)
    references public.saas_organization_subscriptions(id,organization_id)
    on delete restrict
);
create unique index saas_subscription_events_external_once_v1
  on public.saas_subscription_events(organization_id,source,external_event_ref)
  where external_event_ref is not null;
create index saas_subscription_events_subscription_time_v1
  on public.saas_subscription_events(subscription_id,occurred_at desc);

-- Neither authenticated clients nor anon have table-level privileges.
-- RLS stays enabled for all SaaS state; P0 has NO client read/write policies.
alter table public.saas_plans enable row level security;
alter table public.saas_plan_entitlements enable row level security;
alter table public.saas_organization_subscriptions enable row level security;
alter table public.saas_subscription_events enable row level security;

revoke all on table
  public.saas_plans,
  public.saas_plan_entitlements,
  public.saas_organization_subscriptions,
  public.saas_subscription_events
from public, anon, authenticated;

grant select,insert,update,delete on table
  public.saas_plans,
  public.saas_plan_entitlements,
  public.saas_organization_subscriptions
to service_role;
grant select,insert on table public.saas_subscription_events to service_role;

-- Event UPDATE/DELETE/TRUNCATE must fail even if executed by an internal
-- elevated client. Database owner still has DDL authority as usual.
create function public.saas_subscription_event_immutable_v1()
returns trigger language plpgsql
set search_path = public, pg_temp
as $function$
begin
  raise exception 'SalsysOS SaaS subscription events are append-only'
    using errcode = '55000';
end;
$function$;

create trigger saas_event_block_update_delete_v1
  before update or delete on public.saas_subscription_events
  for each row execute function public.saas_subscription_event_immutable_v1();
create trigger saas_event_block_truncate_v1
  before truncate on public.saas_subscription_events
  for each statement execute function public.saas_subscription_event_immutable_v1();

-- Actual subscription writes create real transition evidence atomically.
-- This is not a trial, payment, synthetic subscription or auto-activation.
create function public.saas_subscription_audit_v1()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $function$
declare
  v_event_type text;
begin
  if tg_op = 'INSERT' then
    v_event_type := 'subscription_created';
  elsif new.status is distinct from old.status then
    v_event_type := 'subscription_status_changed';
  elsif new.plan_id is distinct from old.plan_id then
    v_event_type := 'subscription_plan_changed';
  else
    v_event_type := 'subscription_terms_changed';
  end if;

  insert into public.saas_subscription_events (
    organization_id, subscription_id, event_type,
    previous_status, new_status, source, metadata
  ) values (
    new.organization_id, new.id, v_event_type,
    case when tg_op='INSERT' then null else old.status end,
    new.status, new.source,
    jsonb_build_object('plan_id',new.plan_id)
  );
  return new;
end;
$function$;

create trigger saas_subscription_audit_insert_v1
  after insert on public.saas_organization_subscriptions
  for each row execute function public.saas_subscription_audit_v1();
create trigger saas_subscription_audit_update_v1
  after update on public.saas_organization_subscriptions
  for each row when (old is distinct from new)
  execute function public.saas_subscription_audit_v1();

create trigger saas_plans_updated_at_v1
  before update on public.saas_plans
  for each row execute function public.set_updated_at();
create trigger saas_plan_entitlements_updated_at_v1
  before update on public.saas_plan_entitlements
  for each row execute function public.set_updated_at();
create trigger saas_subscriptions_updated_at_v1
  before update on public.saas_organization_subscriptions
  for each row execute function public.set_updated_at();

revoke all on function
  public.saas_subscription_event_immutable_v1(),
  public.saas_subscription_audit_v1()
from public, anon, authenticated;
grant execute on function
  public.saas_subscription_event_immutable_v1(),
  public.saas_subscription_audit_v1()
to service_role;

-- Platform-operator diagnostic view only. Future customer-facing surfaces
-- require their own tenant-bound authorization and explicit grants.
create view public.saas_commercial_readiness_v1
with (security_invoker = true)
as
select
  o.id as organization_id,
  s.id as subscription_id,
  s.status as subscription_status,
  p.code as plan_code,
  case
    when s.id is null then 'unmanaged_legacy'
    when s.status in ('active','trialing')
      and cardinality(d.entitled_but_disabled) = 0
      and cardinality(d.enabled_but_not_entitled) = 0
      then 'managed_healthy'
    else 'managed_attention'
  end as readiness,
  d.entitled_but_disabled,
  d.enabled_but_not_entitled
from public.organizations o
left join public.saas_organization_subscriptions s
  on s.organization_id = o.id
left join public.saas_plans p on p.id = s.plan_id
cross join lateral (
  select
    array(
      select e.capability_code
      from public.saas_plan_entitlements e
      left join public.organization_capabilities oc
        on oc.organization_id = o.id and oc.capability_code = e.capability_code
      where s.id is not null and e.plan_id = s.plan_id and e.allowed = true
        and oc.enabled is distinct from true
      order by e.capability_code
    ) as entitled_but_disabled,
    array(
      select oc.capability_code
      from public.organization_capabilities oc
      where s.id is not null and oc.organization_id = o.id
        and oc.enabled = true
        and not exists (
          select 1 from public.saas_plan_entitlements e
          where e.plan_id = s.plan_id
            and e.capability_code = oc.capability_code
            and e.allowed = true
        )
      order by oc.capability_code
    ) as enabled_but_not_entitled
) d;

revoke all on public.saas_commercial_readiness_v1 from public, anon, authenticated;
grant select on public.saas_commercial_readiness_v1 to service_role;

-- NEVER auto-populate plans, subscriptions, events, invoices or provider
-- references. Existing organizations, workspaces and capabilities are intact.
commit;
