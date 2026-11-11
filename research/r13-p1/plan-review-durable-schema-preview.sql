-- R13-P1 RESEARCH-ONLY PostgreSQL review schema.
-- Runs ONLY in the disposable local PostgreSQL test from CI.
-- NOT A SUPABASE MIGRATION. NOT APPROVED FOR HOSTED INSTALLATION.
-- P0 PR #654 is not yet reviewed/merged. No live plans, invoices, tenants,
-- capability changes, provider integration, purchase flow or self-serve signup.
begin;

create schema r13_review_preview;
revoke all on schema r13_review_preview from public, anon, authenticated;
grant usage on schema r13_review_preview to service_role;

create table r13_review_preview.requests (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid not null,
  last_actor_user_id uuid not null,
  reviewer_user_id uuid,
  status text not null default 'draft'
    check (status in ('draft', 'under_review', 'reviewed_for_design', 'rejected')),
  revision integer not null default 1 check (revision >= 1),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  snapshot_sha256 text not null check (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  rationale text not null check (char_length(btrim(rationale)) between 10 and 2048),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint r13_review_preview_reviewer_is_independent check (
    reviewer_user_id is null or reviewer_user_id <> author_user_id
  )
);

-- This is the proposed price book, not a pricing table in production.
-- Each draft request has four immutable price entries, denominated in paise.
-- A later design must add currency versions/effective windows after review.
create table r13_review_preview.price_versions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references r13_review_preview.requests(id) on delete restrict,
  tier_code text not null check (tier_code in ('free','basic','growth','pro')),
  currency text not null check (currency = 'INR'),
  billing_period text not null check (billing_period = 'month'),
  amount_minor bigint not null check (amount_minor >= 0),
  setup_min_minor bigint not null check (setup_min_minor >= 0),
  setup_max_minor bigint not null check (setup_max_minor >= setup_min_minor),
  setup_optional boolean not null default false,
  created_at timestamptz not null default now(),
  constraint r13_review_preview_unique_tier_per_request unique(request_id,tier_code)
);

create table r13_review_preview.events (
  id bigint generated always as identity primary key,
  request_id uuid not null references r13_review_preview.requests(id) on delete restrict,
  revision integer not null,
  action text not null check (action in ('created','submitted','reviewed_for_design','rejected')),
  actor_user_id uuid not null,
  snapshot_sha256 text not null,
  occurred_at timestamptz not null default now(),
  constraint r13_review_preview_unique_event_revision unique(request_id,revision)
);

-- Only the trusted internal service role has narrow operator privileges.
-- No external/client role may read or mutate these experimental tables.
alter table r13_review_preview.requests enable row level security;
alter table r13_review_preview.price_versions enable row level security;
alter table r13_review_preview.events enable row level security;
revoke all on all tables in schema r13_review_preview from public, anon, authenticated;
revoke all on all sequences in schema r13_review_preview from public, anon, authenticated;
grant select,insert,update on r13_review_preview.requests to service_role;
grant select,insert on r13_review_preview.price_versions to service_role;
grant select on r13_review_preview.events to service_role;

create function r13_review_preview.block_immutable_event()
returns trigger language plpgsql
set search_path = pg_catalog
as $fn$
begin
  raise exception 'R13-P1 review evidence is append-only' using errcode='55000';
end;
$fn$;

create trigger r13_review_events_no_update_delete
before update or delete on r13_review_preview.events
for each row execute function r13_review_preview.block_immutable_event();
create trigger r13_review_events_no_truncate
before truncate on r13_review_preview.events
for each statement execute function r13_review_preview.block_immutable_event();

-- A price proposal is immutable after insertion. Any revision creates a NEW
-- request and price version set; customer subscriptions are never modified.
create function r13_review_preview.guard_price_write()
returns trigger language plpgsql
set search_path = pg_catalog
as $fn$
declare request_status text;
begin
  if tg_op in ('UPDATE','DELETE','TRUNCATE') then
    raise exception 'R13-P1 price versions are immutable' using errcode='55000';
  end if;
  select status into request_status
  from r13_review_preview.requests where id = new.request_id for update;
  if request_status is distinct from 'draft' then
    raise exception 'R13-P1 prices can only be proposed for a draft' using errcode='55000';
  end if;
  return new;
end;
$fn$;

create trigger r13_review_prices_insert_guard
before insert on r13_review_preview.price_versions
for each row execute function r13_review_preview.guard_price_write();
create trigger r13_review_prices_update_delete_guard
before update or delete on r13_review_preview.price_versions
for each row execute function r13_review_preview.guard_price_write();
create trigger r13_review_prices_truncate_guard
before truncate on r13_review_preview.price_versions
for each statement execute function r13_review_preview.guard_price_write();

-- Atomic compare-and-swap state transitions; no published/active state exists.
-- The database enforces independent reviewer IDs and immutable snapshots.
-- Only a trusted server-side identity/session verifier may call this API
-- in any future real implementation; passing a UUID is NOT authentication.
create function r13_review_preview.guard_request_transition()
returns trigger language plpgsql
set search_path = pg_catalog
as $fn$
declare price_count integer;
begin
  if new.id <> old.id
     or new.author_user_id <> old.author_user_id
     or new.snapshot is distinct from old.snapshot
     or new.snapshot_sha256 <> old.snapshot_sha256
     or new.rationale <> old.rationale
     or new.created_at <> old.created_at then
    raise exception 'R13-P1 proposal snapshot and authorship are immutable'
      using errcode='55000';
  end if;
  if new.revision <> old.revision + 1 then
    raise exception 'R13-P1 revision must advance exactly once' using errcode='55000';
  end if;
  if old.status='draft' and new.status='under_review'
     and new.reviewer_user_id is null
     and new.last_actor_user_id=old.author_user_id then
    select count(*) into price_count from r13_review_preview.price_versions
      where request_id=old.id;
    if price_count <> 4 then
      raise exception 'R13-P1 all four tier prices are required' using errcode='55000';
    end if;
  elsif old.status='under_review'
        and new.status in ('reviewed_for_design','rejected')
        and new.reviewer_user_id is not null
        and new.reviewer_user_id <> old.author_user_id
        and new.last_actor_user_id = new.reviewer_user_id then
    null;
  else
    raise exception 'R13-P1 invalid proposal transition' using errcode='55000';
  end if;
  new.updated_at := now();
  return new;
end;
$fn$;
create trigger r13_review_request_guard
before update on r13_review_preview.requests
for each row execute function r13_review_preview.guard_request_transition();

-- Dedicated, non-exposed schema; narrowly scoped trigger writer; all client
-- EXECUTE rights revoked. A production migration must receive independent
-- SECURITY DEFINER review. This trigger does not accept dynamic SQL or caller
-- arguments, and its search_path excludes untrusted schemas.
create function r13_review_preview.write_audit_event()
returns trigger language plpgsql security definer
set search_path = pg_catalog
as $fn$
declare event_action text;
begin
  if tg_op='INSERT' then
    event_action:='created';
  elsif new.status='under_review' then
    event_action:='submitted';
  else
    event_action:=new.status;
  end if;
  insert into r13_review_preview.events(
    request_id, revision, action, actor_user_id, snapshot_sha256
  ) values (
    new.id, new.revision, event_action, new.last_actor_user_id, new.snapshot_sha256
  );
  return new;
end;
$fn$;
create trigger r13_review_request_audit_insert
after insert on r13_review_preview.requests
for each row execute function r13_review_preview.write_audit_event();
create trigger r13_review_request_audit_update
after update on r13_review_preview.requests
for each row execute function r13_review_preview.write_audit_event();

-- Invoker-only helper can be called only by service_role after trusted server
-- session validation. UUID parameters alone MUST NEVER establish identity.
create function r13_review_preview.submit_request(
  _request_id uuid, _author_user_id uuid, _expected_revision integer
) returns boolean language plpgsql security invoker
set search_path = pg_catalog
as $fn$
declare changed_id uuid;
begin
  update r13_review_preview.requests
     set status='under_review', revision=revision+1,
         last_actor_user_id=_author_user_id
   where id=_request_id and author_user_id=_author_user_id
     and revision=_expected_revision and status='draft'
  returning id into changed_id;
  return changed_id is not null;
end;
$fn$;

create function r13_review_preview.review_request(
  _request_id uuid, _reviewer_user_id uuid, _expected_revision integer,
  _decision text
) returns boolean language plpgsql security invoker
set search_path = pg_catalog
as $fn$
declare changed_id uuid;
begin
  if _decision not in ('approve','reject') or _decision is null then
    raise exception 'R13-P1 invalid review decision' using errcode='22023';
  end if;
  update r13_review_preview.requests
     set status=case when _decision='approve' then 'reviewed_for_design'
                     else 'rejected' end,
         revision=revision+1,
         reviewer_user_id=_reviewer_user_id,
         last_actor_user_id=_reviewer_user_id
   where id=_request_id and revision=_expected_revision
     and status='under_review'
     and author_user_id <> _reviewer_user_id
  returning id into changed_id;
  return changed_id is not null;
end;
$fn$;

revoke all on all functions in schema r13_review_preview from public, anon, authenticated;
grant execute on function
  r13_review_preview.submit_request(uuid,uuid,integer),
  r13_review_preview.review_request(uuid,uuid,integer,text)
to service_role;

-- Explicit no-activation contract: no SaaS subscription, customer payment,
-- organization lifecycle, runtime capability, provider or invoice write.
commit;
