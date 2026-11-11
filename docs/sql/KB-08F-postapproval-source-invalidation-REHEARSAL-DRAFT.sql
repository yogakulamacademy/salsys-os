-- KB-08F: DISPOSABLE-POSTGRES POST-APPROVAL INVALIDATION REHEARSAL.
-- NOT A SUPABASE MIGRATION. NEVER deploy this SQL to any hosted project.
-- Required parent: KB-08E disposable fixture in a random empty database.
-- This is an intentionally PRIVATE mock, not live source re-fetch, Auth,
-- customer evidence, approval authorization, policy, or production retrieval.

do $kb08f_guard$
begin
  if current_database() !~ '^salsys_kb08e_[a-f0-9]{18}$'
     or to_regclass('kb08e_fixture.source_versions') is null
     or to_regclass('kb08e_fixture.approval_audit') is null
     or to_regclass('public.organizations') is not null
     or to_regclass('kb08f_fixture.review_holds') is not null then
    raise exception 'KB08F_DISPOSABLE_PARENT_FIXTURE_REQUIRED';
  end if;
end;
$kb08f_guard$;

-- Revisions exist in this throwaway fixture only, NOT the application schema.
alter table kb08e_fixture.source_versions
  add column revision integer not null default 1 check (revision > 0);

create schema kb08f_fixture;
revoke all on schema kb08f_fixture from public;
grant usage on schema kb08f_fixture to service_role;

create table kb08f_fixture.approved_evidence (
  organization_id uuid not null,
  document_id uuid not null,
  approved_version integer not null,
  source_url text not null,
  source_snapshot_sha256 text not null,
  source_block_id text not null,
  source_quote_sha256 text not null,
  fetched_at timestamptz not null,
  primary key (organization_id,document_id,approved_version),
  foreign key (organization_id,document_id,approved_version)
    references kb08e_fixture.approval_audit(
      organization_id,document_id,approved_version
    ) on delete restrict
);

create table kb08f_fixture.review_holds (
  organization_id uuid not null,
  document_id uuid not null,
  source_revision integer not null check (source_revision > 1),
  prior_document_version integer not null,
  held_document_version integer not null,
  prior_snapshot_sha256 text not null,
  new_snapshot_sha256 text not null,
  reason text not null check (reason in ('source_replaced','source_revoked')),
  detected_at timestamptz not null,
  primary key (organization_id,document_id,source_revision),
  foreign key (organization_id,document_id)
    references kb08e_fixture.documents(organization_id,id) on delete restrict
);

-- No client can directly create an approval binding or suppress/clear a hold.
alter table kb08f_fixture.approved_evidence enable row level security;
alter table kb08f_fixture.review_holds enable row level security;
revoke all on all tables in schema kb08f_fixture
  from public, anon, authenticated, service_role;

-- The parent KB-08E approval RPC inserts the audit AFTER holding document
-- and source locks. Capture source URL, block and fetch time in the SAME
-- transaction as the approval, so a missing binding fails closed.
create function kb08f_fixture.capture_approved_evidence_rehearsal_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $binding$
declare
  v_document kb08e_fixture.documents%rowtype;
  v_source kb08e_fixture.source_versions%rowtype;
begin
  select * into v_document from kb08e_fixture.documents
  where organization_id=new.organization_id and id=new.document_id;
  if not found or v_document.status<>'approved'
     or v_document.version<>new.approved_version
     or v_document.review_packet_sha256<>new.review_packet_sha256 then
    raise exception 'kb08f_inconsistent_approval_audit' using errcode='P0001';
  end if;
  select * into v_source from kb08e_fixture.source_versions
  where organization_id=new.organization_id and id=v_document.source_id;
  if not found or v_source.state<>'active'
     or v_source.snapshot_sha256<>new.source_snapshot_sha256
     or v_source.quote_sha256<>new.source_quote_sha256 then
    raise exception 'kb08f_inconsistent_approval_source' using errcode='P0001';
  end if;

  insert into kb08f_fixture.approved_evidence (
    organization_id,document_id,approved_version,
    source_url,source_snapshot_sha256,source_block_id,
    source_quote_sha256,fetched_at
  ) values (
    new.organization_id,new.document_id,new.approved_version,
    v_source.source_url,v_source.snapshot_sha256,v_source.block_id,
    v_source.quote_sha256,v_source.fetched_at
  );
  return new;
end;
$binding$;

revoke all on function kb08f_fixture.capture_approved_evidence_rehearsal_v1()
  from public, anon, authenticated, service_role;

create trigger kb08f_capture_approved_source_evidence
after insert on kb08e_fixture.approval_audit
for each row execute function kb08f_fixture.capture_approved_evidence_rehearsal_v1();

-- PRIVATE simulation of a fail-closed retrieval predicate. A regular client
-- has no access. This is NOT the application's search_organization_knowledge.
-- An out-of-band privileged source modification without an invalidation
-- event is still screened by binding mismatch (URL, hashes, block and state).
create view kb08f_fixture.synthetic_eligible_knowledge
with (security_invoker = true) as
select
  d.organization_id, d.id as document_id, d.version as document_version,
  d.source_id, s.revision as source_revision
from kb08e_fixture.documents d
join kb08e_fixture.source_versions s
  on s.organization_id=d.organization_id and s.id=d.source_id
join kb08f_fixture.approved_evidence e
  on e.organization_id=d.organization_id
  and e.document_id=d.id and e.approved_version=d.version
where d.status='approved' and s.state='active'
  and e.source_url=s.source_url
  and e.source_snapshot_sha256=s.snapshot_sha256
  and e.source_block_id=s.block_id
  and e.source_quote_sha256=s.quote_sha256
  and s.fetched_at>=e.fetched_at
  and (d.valid_from is null or d.valid_from<=clock_timestamp())
  and (d.valid_until is null or d.valid_until>clock_timestamp());

revoke all on kb08f_fixture.synthetic_eligible_knowledge
  from public, anon, authenticated, service_role;

-- ONLY service_role in this disposable fixture can simulate a new source
-- revision. Caller MUST supply a correct expected revision + prior hash.
-- This does not establish that the caller truly fetched the live website.
create function kb08f_fixture.apply_synthetic_source_revision_v1(
  p_org uuid,
  p_source_id uuid,
  p_expected_revision integer,
  p_expected_snapshot_sha256 text,
  p_new_source_url text,
  p_new_snapshot_sha256 text,
  p_new_block_id text,
  p_new_quote_sha256 text,
  p_new_fetched_at timestamptz,
  p_new_state text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $invalidation$
declare
  v_prior kb08e_fixture.source_versions%rowtype;
  v_now timestamptz:=clock_timestamp();
  v_material_change boolean;
  v_held integer:=0;
  v_new_revision integer;
begin
  if p_org is null or p_source_id is null
     or p_expected_revision is null or p_expected_revision<1
     or p_expected_snapshot_sha256 is null
     or p_expected_snapshot_sha256 !~ '^[a-f0-9]{64}$'
     or p_new_snapshot_sha256 is null
     or p_new_snapshot_sha256 !~ '^[a-f0-9]{64}$'
     or p_new_block_id is null or p_new_block_id !~ '^[a-f0-9]{64}$'
     or p_new_quote_sha256 is null or p_new_quote_sha256 !~ '^[a-f0-9]{64}$'
     or p_new_source_url is null
     or length(p_new_source_url)>2048
     or p_new_source_url !~ '^https://[^[:space:]]+$'
     or p_new_fetched_at is null
     or p_new_fetched_at>v_now
     or p_new_state is null or p_new_state not in ('active','revoked') then
    raise exception 'kb08f_invalid_synthetic_source_event' using errcode='22023';
  end if;

  -- Order matches the KB-08E approve transaction: documents first, then
  -- source. Locks are tenant-scoped and deterministic to limit deadlocks.
  perform 1 from kb08e_fixture.documents d
  where d.organization_id=p_org and d.source_id=p_source_id
  order by d.id for update;

  select * into v_prior from kb08e_fixture.source_versions s
  where s.organization_id=p_org and s.id=p_source_id
  for update;
  if not found then
    raise exception 'kb08f_source_not_found' using errcode='P0002';
  end if;
  if v_prior.revision<>p_expected_revision
     or v_prior.snapshot_sha256<>p_expected_snapshot_sha256 then
    raise exception 'kb08f_stale_source_revision' using errcode='P0001';
  end if;
  if p_new_fetched_at<v_prior.fetched_at then
    raise exception 'kb08f_source_timestamp_regressed' using errcode='P0001';
  end if;

  v_material_change:=
    v_prior.state is distinct from p_new_state or
    v_prior.source_url is distinct from p_new_source_url or
    v_prior.snapshot_sha256 is distinct from p_new_snapshot_sha256 or
    v_prior.block_id is distinct from p_new_block_id or
    v_prior.quote_sha256 is distinct from p_new_quote_sha256;

  if not v_material_change then
    -- A same-content recrawl only refreshes source timing. No new content
    -- is independently verified, so this remains a synthetic claim.
    update kb08e_fixture.source_versions
    set fetched_at=p_new_fetched_at
    where organization_id=p_org and id=p_source_id;
    return jsonb_build_object(
      'ok',true,'material_change',false,'held',0,
      'source_revision',v_prior.revision
    );
  end if;
  if p_new_fetched_at<=v_prior.fetched_at then
    raise exception 'kb08f_source_change_requires_newer_fetch' using errcode='P0001';
  end if;

  update kb08e_fixture.source_versions s
  set source_url=p_new_source_url,
      snapshot_sha256=p_new_snapshot_sha256,
      block_id=p_new_block_id,
      quote_sha256=p_new_quote_sha256,
      fetched_at=p_new_fetched_at,
      state=p_new_state,
      revision=s.revision+1
  where s.organization_id=p_org and s.id=p_source_id
    and s.revision=p_expected_revision
  returning s.revision into v_new_revision;
  if not found then
    raise exception 'kb08f_source_compare_failed' using errcode='P0001';
  end if;

  -- A single statement inserts the hold audit for EVERY affected approved
  -- document. Any failure rolls back the source revision and all holds.
  with invalidated as (
    update kb08e_fixture.documents d
    set status='review',version=d.version+1
    where d.organization_id=p_org and d.source_id=p_source_id
      and d.status='approved'
    returning d.organization_id,d.id,d.version
  )
  insert into kb08f_fixture.review_holds (
    organization_id,document_id,source_revision,prior_document_version,
    held_document_version,prior_snapshot_sha256,new_snapshot_sha256,
    reason,detected_at
  )
  select i.organization_id,i.id,v_new_revision,i.version-1,i.version,
    v_prior.snapshot_sha256,p_new_snapshot_sha256,
    case when p_new_state='revoked'
      then 'source_revoked' else 'source_replaced' end,
    v_now
  from invalidated i;
  get diagnostics v_held = row_count;

  return jsonb_build_object(
    'ok',true,'material_change',true,'held',v_held,
    'source_revision',v_new_revision,
    'manual_review_required',true
  );
end;
$invalidation$;

revoke all on function kb08f_fixture.apply_synthetic_source_revision_v1(
  uuid,uuid,integer,text,text,text,text,text,timestamptz,text
) from public, anon, authenticated, service_role;
grant execute on function kb08f_fixture.apply_synthetic_source_revision_v1(
  uuid,uuid,integer,text,text,text,text,text,timestamptz,text
) to service_role;

comment on function kb08f_fixture.apply_synthetic_source_revision_v1(
  uuid,uuid,integer,text,text,text,text,text,timestamptz,text
) is 'KB-08F DISPOSABLE REHEARSAL: synthetic postapproval source changes force human review; NEVER deploy this prototype.';
