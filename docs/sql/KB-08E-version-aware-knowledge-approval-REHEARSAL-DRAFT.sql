-- KB-08E: DISPOSABLE-POSTGRES REHEARSAL ONLY; NOT A SUPABASE MIGRATION.
-- This script refuses databases outside a random local fixture prefix.
-- It models version-aware document/source CAS and atomic human-approval audit.
-- It does not verify a real website, consent, Supabase Auth, or legal retention.
-- NEVER deploy or call this prototype against Production, Recovery, or staging.

do $kb08e_guard$
begin
  if current_database() !~ '^salsys_kb08e_[a-f0-9]{18}$'
     or to_regclass('public.organizations') is not null
     or to_regclass('public.knowledge_documents') is not null then
    raise exception 'KB08E_DISPOSABLE_EMPTY_DATABASE_REQUIRED';
  end if;
end;
$kb08e_guard$;

create schema kb08e_fixture;
revoke all on schema kb08e_fixture from public;
grant usage on schema kb08e_fixture to authenticated;

create table kb08e_fixture.organization_admins (
  organization_id uuid not null,
  actor_id uuid not null,
  role text not null check (role in ('owner','admin','member')),
  active boolean not null default true,
  primary key (organization_id, actor_id)
);

create table kb08e_fixture.source_versions (
  organization_id uuid not null,
  id uuid not null,
  source_url text not null,
  snapshot_sha256 text not null check (snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  block_id text not null check (block_id ~ '^[a-f0-9]{64}$'),
  quote_sha256 text not null check (quote_sha256 ~ '^[a-f0-9]{64}$'),
  fetched_at timestamptz not null,
  state text not null check (state in ('active','superseded','revoked')),
  primary key (organization_id,id)
);

create table kb08e_fixture.documents (
  organization_id uuid not null,
  id uuid not null,
  source_id uuid not null,
  version integer not null check (version > 0),
  status text not null check (status in ('draft','review','approved','archived','superseded')),
  review_packet_sha256 text not null check (review_packet_sha256 ~ '^[a-f0-9]{64}$'),
  reviewed_at timestamptz not null,
  valid_from timestamptz,
  valid_until timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  primary key (organization_id,id),
  foreign key (organization_id,source_id)
    references kb08e_fixture.source_versions(organization_id,id) on delete restrict
);

create table kb08e_fixture.approval_audit (
  organization_id uuid not null,
  document_id uuid not null,
  approved_version integer not null,
  actor_id uuid not null,
  source_snapshot_sha256 text not null,
  source_quote_sha256 text not null,
  review_packet_sha256 text not null,
  approved_at timestamptz not null,
  primary key (organization_id,document_id,approved_version),
  foreign key (organization_id,document_id)
    references kb08e_fixture.documents(organization_id,id) on delete restrict
);

-- Defense in depth. The mock grants NO direct table API access. This private
-- schema is not configured as an exposed Supabase Data API schema.
alter table kb08e_fixture.organization_admins enable row level security;
alter table kb08e_fixture.source_versions enable row level security;
alter table kb08e_fixture.documents enable row level security;
alter table kb08e_fixture.approval_audit enable row level security;
revoke all on all tables in schema kb08e_fixture from public, anon, authenticated, service_role;

create function kb08e_fixture.approve_knowledge_cas_rehearsal_v1(
  p_organization_id uuid,
  p_document_id uuid,
  p_expected_version integer,
  p_expected_source_url text,
  p_expected_snapshot_sha256 text,
  p_expected_block_id text,
  p_expected_quote_sha256 text,
  p_expected_fetched_at timestamptz,
  p_expected_review_packet_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $kb08e$
declare
  v_actor uuid := auth.uid();
  v_doc kb08e_fixture.documents%rowtype;
  v_source kb08e_fixture.source_versions%rowtype;
  v_next_version integer;
  v_now timestamptz;
begin
  -- The disposable fixture supplies test JWT claims via auth.uid().
  -- Production integration MUST independently validate authenticated session,
  -- reviewer identity/role, owner consent, retention and evidence legitimacy.
  if v_actor is null
     or current_setting('request.jwt.claim.role',true) is distinct from 'authenticated'
     or not exists (
       select 1 from kb08e_fixture.organization_admins a
       where a.organization_id=p_organization_id and a.actor_id=v_actor
         and a.active=true and a.role in ('owner','admin')
     ) then
    raise exception 'kb08e_not_authorized' using errcode='42501';
  end if;

  if p_document_id is null or p_organization_id is null
     or p_expected_version is null or p_expected_version < 1
     or p_expected_source_url is null or length(p_expected_source_url)>2048
     or p_expected_snapshot_sha256 is null
     or p_expected_snapshot_sha256 !~ '^[a-f0-9]{64}$'
     or p_expected_block_id is null or p_expected_block_id !~ '^[a-f0-9]{64}$'
     or p_expected_quote_sha256 is null
     or p_expected_quote_sha256 !~ '^[a-f0-9]{64}$'
     or p_expected_review_packet_sha256 is null
     or p_expected_review_packet_sha256 !~ '^[a-f0-9]{64}$'
     or p_expected_fetched_at is null then
    raise exception 'kb08e_invalid_precondition' using errcode='22023';
  end if;

  -- Tenant-bound document lock is acquired BEFORE the source lock, and
  -- the version/status are compared while locked. Competing approvers wait
  -- and recheck the committed result. No id-only cross-tenant lookup.
  select * into v_doc from kb08e_fixture.documents d
  where d.organization_id=p_organization_id and d.id=p_document_id
  for update;
  if not found then
    raise exception 'kb08e_document_not_found' using errcode='P0002';
  end if;
  if v_doc.version<>p_expected_version then
    raise exception 'kb08e_document_version_stale' using errcode='P0001';
  end if;
  if v_doc.status<>'draft' then
    raise exception 'kb08e_document_not_draft' using errcode='P0001';
  end if;

  -- Lock CURRENT stored source evidence in the same transaction. The hash
  -- and fetch-time comparison is a local DB CAS, NOT a fresh website fetch.
  select * into v_source from kb08e_fixture.source_versions s
  where s.organization_id=p_organization_id and s.id=v_doc.source_id
  for update;
  if not found then
    raise exception 'kb08e_current_source_missing' using errcode='P0001';
  end if;
  v_now:=clock_timestamp();
  if v_source.state<>'active'
     or v_source.source_url is distinct from p_expected_source_url
     or v_source.snapshot_sha256 is distinct from p_expected_snapshot_sha256
     or v_source.block_id is distinct from p_expected_block_id
     or v_source.quote_sha256 is distinct from p_expected_quote_sha256
     or v_source.fetched_at is distinct from p_expected_fetched_at
     or v_doc.review_packet_sha256 is distinct from p_expected_review_packet_sha256
     or v_source.fetched_at>v_doc.reviewed_at
     or v_doc.reviewed_at>v_now
     or v_source.fetched_at>v_now then
    raise exception 'kb08e_source_evidence_stale' using errcode='P0001';
  end if;
  if (v_doc.valid_from is not null and v_doc.valid_from>v_now)
     or (v_doc.valid_until is not null and v_doc.valid_until<=v_now) then
    raise exception 'kb08e_document_outside_validity' using errcode='P0001';
  end if;

  -- This UPDATE and its audit INSERT are one PostgreSQL statement/
  -- transaction. If the audit write fails, approval rolls back as well.
  update kb08e_fixture.documents d
  set status='approved',version=d.version+1,
      approved_by=v_actor,approved_at=v_now
  where d.organization_id=p_organization_id and d.id=p_document_id
    and d.version=p_expected_version and d.status='draft'
  returning d.version into v_next_version;
  if not found then
    raise exception 'kb08e_approval_compare_failed' using errcode='P0001';
  end if;

  insert into kb08e_fixture.approval_audit (
    organization_id,document_id,approved_version,actor_id,
    source_snapshot_sha256,source_quote_sha256,review_packet_sha256,approved_at
  ) values (
    p_organization_id,p_document_id,v_next_version,v_actor,
    v_source.snapshot_sha256,v_source.quote_sha256,
    v_doc.review_packet_sha256,v_now
  );

  return jsonb_build_object(
    'ok',true,'status','approved','document_id',p_document_id,
    'document_version',v_next_version
  );
end;
$kb08e$;

revoke all on function kb08e_fixture.approve_knowledge_cas_rehearsal_v1(
  uuid,uuid,integer,text,text,text,text,timestamptz,text
) from public, anon, authenticated, service_role;
grant execute on function kb08e_fixture.approve_knowledge_cas_rehearsal_v1(
  uuid,uuid,integer,text,text,text,text,timestamptz,text
) to authenticated;

comment on function kb08e_fixture.approve_knowledge_cas_rehearsal_v1(
  uuid,uuid,integer,text,text,text,text,timestamptz,text
) is 'KB-08E LOCAL POSTGRES REHEARSAL ONLY. NOT a production RPC; needs real Auth, independent evidence, consent and release review.';
