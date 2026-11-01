begin;

-- =============================================================================
-- PA-1 — Human-Approved Identity Merge & Conflict Resolution V1
--
-- Scope:
-- - one-candidate identity conflicts only;
-- - manager/admin human approval required;
-- - same-tenant, transactional merge;
-- - preserve the losing Person as a merged audit shell;
-- - transfer canonical identifiers, Lead links and Session links;
-- - preserve historical evaluation/conflict evidence;
-- - fail closed around active privacy/legal/ad-activation dependencies;
-- - record a durable merge audit.
--
-- This migration deliberately does NOT implement probabilistic or automatic
-- Person merging. Ambiguous/multi-candidate conflicts remain review-only.
-- =============================================================================

create table if not exists public.person_merge_audit_v1 (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  initiating_conflict_id uuid not null references public.identity_resolution_conflicts(id) on delete restrict,
  source_person_id uuid not null references public.persons(id) on delete restrict,
  target_person_id uuid not null references public.persons(id) on delete restrict,
  reviewed_by uuid,
  moved_identifier_count integer not null default 0,
  moved_lead_count integer not null default 0,
  moved_session_count integer not null default 0,
  moved_consent_receipt_count integer not null default 0,
  resolved_conflict_count integer not null default 0,
  preflight jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint person_merge_audit_v1_distinct_people_check
    check (source_person_id <> target_person_id),
  constraint person_merge_audit_v1_counts_check
    check (
      moved_identifier_count >= 0
      and moved_lead_count >= 0
      and moved_session_count >= 0
      and moved_consent_receipt_count >= 0
      and resolved_conflict_count >= 0
    ),
  constraint person_merge_audit_v1_preflight_object_check
    check (jsonb_typeof(preflight) = 'object')
);

create unique index if not exists uq_person_merge_audit_v1_conflict
  on public.person_merge_audit_v1 (organization_id, initiating_conflict_id);

create index if not exists idx_person_merge_audit_v1_source
  on public.person_merge_audit_v1 (organization_id, source_person_id, created_at desc);

create index if not exists idx_person_merge_audit_v1_target
  on public.person_merge_audit_v1 (organization_id, target_person_id, created_at desc);

alter table public.person_merge_audit_v1 enable row level security;

revoke all on table public.person_merge_audit_v1 from public, anon, authenticated;

comment on table public.person_merge_audit_v1 is
  'Durable audit for explicit human-approved canonical Person merges. No direct authenticated writes are allowed.';

create or replace function public.merge_identity_resolution_conflict_v1(
  p_conflict_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_conflict public.identity_resolution_conflicts%rowtype;
  v_target_person public.persons%rowtype;
  v_source_person public.persons%rowtype;
  v_target_person_id uuid;
  v_source_person_id uuid;
  v_user_id uuid := auth.uid();
  v_is_service_role boolean := coalesce(auth.jwt()->>'role', '') = 'service_role';
  v_now timestamptz := now();
  v_identifier_count integer := 0;
  v_lead_count integer := 0;
  v_session_count integer := 0;
  v_consent_count integer := 0;
  v_resolved_conflict_count integer := 0;
  v_source_privacy_blockers integer := 0;
  v_target_active_privacy_blockers integer := 0;
  v_active_ad_blockers integer := 0;
  v_preflight jsonb;
begin
  if p_conflict_id is null then
    raise exception 'Identity conflict ID is required';
  end if;

  select *
  into v_conflict
  from public.identity_resolution_conflicts c
  where c.id = p_conflict_id
  for update;

  if not found then
    raise exception 'Identity conflict not found';
  end if;

  if not v_is_service_role then
    if v_user_id is null then
      raise exception 'Authentication is required';
    end if;

    if not public.can_administer_organization_crm(v_conflict.organization_id) then
      raise exception 'Manager or administrator access is required to merge identity';
    end if;
  end if;

  if v_conflict.status <> 'open' then
    return jsonb_build_object(
      'conflict_id', v_conflict.id,
      'status', v_conflict.status,
      'changed', false
    );
  end if;

  if v_conflict.person_id is null then
    raise exception 'Current Person is missing from this identity conflict';
  end if;

  if coalesce(cardinality(v_conflict.candidate_person_ids), 0) <> 1 then
    raise exception 'Only one-candidate identity conflicts can be merged in PA-1 V1';
  end if;

  v_target_person_id := v_conflict.person_id;
  v_source_person_id := v_conflict.candidate_person_ids[1];

  if v_source_person_id is null or v_source_person_id = v_target_person_id then
    raise exception 'A distinct candidate Person is required for merge';
  end if;

  -- Pair-scoped advisory lock keeps two reviewers from merging the same pair
  -- in opposite directions concurrently.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'pa1-person-merge:' || v_conflict.organization_id::text || ':' ||
      least(v_source_person_id::text, v_target_person_id::text) || ':' ||
      greatest(v_source_person_id::text, v_target_person_id::text),
      0
    )
  );

  select *
  into v_target_person
  from public.persons p
  where p.organization_id = v_conflict.organization_id
    and p.id = v_target_person_id
  for update;

  if not found then
    raise exception 'Current Person was not found in the conflict organization';
  end if;

  select *
  into v_source_person
  from public.persons p
  where p.organization_id = v_conflict.organization_id
    and p.id = v_source_person_id
  for update;

  if not found then
    raise exception 'Candidate Person was not found in the conflict organization';
  end if;

  if v_target_person.status <> 'active' then
    raise exception 'The surviving Person must be active';
  end if;

  if v_source_person.status = 'merged'
     and v_source_person.metadata->>'merged_into_person_id' = v_target_person_id::text then
    update public.identity_resolution_conflicts c
    set
      status = 'resolved',
      resolution_action = 'merged_after_human_review',
      resolved_person_id = v_target_person_id,
      resolved_at = coalesce(c.resolved_at, v_now),
      resolved_by = case when v_is_service_role then c.resolved_by else coalesce(c.resolved_by, v_user_id) end,
      metadata = coalesce(c.metadata, '{}'::jsonb) || jsonb_build_object(
        'merge_version', 'pa1-human-approved-identity-merge-v1',
        'reviewed_at', v_now,
        'source_person_id', v_source_person_id,
        'target_person_id', v_target_person_id
      )
    where c.id = v_conflict.id;

    return jsonb_build_object(
      'conflict_id', v_conflict.id,
      'status', 'resolved',
      'changed', false,
      'source_person_id', v_source_person_id,
      'target_person_id', v_target_person_id,
      'reason', 'person_pair_already_merged'
    );
  end if;

  if v_source_person.status <> 'active' then
    raise exception 'The candidate Person must be active';
  end if;

  -- Historical consent receipts can be safely re-associated below while
  -- preserving their original subject_key and exact decision evidence.
  -- Other privacy/legal workflow records are not rewritten by PA-1 V1.
  select
    (select count(*) from public.privacy_data_subject_requests d
      where d.organization_id = v_conflict.organization_id
        and d.person_id = v_source_person_id)
    +
    (select count(*) from public.privacy_erasure_jobs e
      where e.organization_id = v_conflict.organization_id
        and e.person_id = v_source_person_id)
    +
    (select count(*) from public.privacy_export_runs x
      where x.organization_id = v_conflict.organization_id
        and x.person_id = v_source_person_id)
    +
    (select count(*) from public.privacy_legal_holds h
      where h.organization_id = v_conflict.organization_id
        and h.person_id = v_source_person_id)
    +
    (select count(*) from public.privacy_search_tombstones t
      where t.organization_id = v_conflict.organization_id
        and t.person_id = v_source_person_id)
    +
    (select count(*) from public.privacy_subject_restrictions r
      where r.organization_id = v_conflict.organization_id
        and r.person_id = v_source_person_id)
  into v_source_privacy_blockers;

  select
    (select count(*) from public.privacy_data_subject_requests d
      where d.organization_id = v_conflict.organization_id
        and d.person_id = v_target_person_id
        and d.status in ('received','verifying','in_progress'))
    +
    (select count(*) from public.privacy_erasure_jobs e
      where e.organization_id = v_conflict.organization_id
        and e.person_id = v_target_person_id
        and e.status in ('planned','held','ready'))
    +
    (select count(*) from public.privacy_legal_holds h
      where h.organization_id = v_conflict.organization_id
        and h.person_id = v_target_person_id
        and h.active = true)
    +
    (select count(*) from public.privacy_subject_restrictions r
      where r.organization_id = v_conflict.organization_id
        and r.person_id = v_target_person_id
        and r.active = true)
  into v_target_active_privacy_blockers;

  select
    (select count(*) from public.ad_activation_outbox o
      where o.organization_id = v_conflict.organization_id
        and o.person_id in (v_source_person_id, v_target_person_id)
        and o.status in ('queued','processing','retry'))
    +
    (select count(*) from public.ad_audience_memberships m
      where m.organization_id = v_conflict.organization_id
        and m.person_id in (v_source_person_id, v_target_person_id)
        and m.status = 'active')
  into v_active_ad_blockers;

  v_preflight := jsonb_build_object(
    'version', 'pa1-human-approved-identity-merge-v1',
    'source_privacy_blockers', v_source_privacy_blockers,
    'target_active_privacy_blockers', v_target_active_privacy_blockers,
    'active_ad_blockers', v_active_ad_blockers,
    'source_identifier_count', (
      select count(*) from public.person_identifiers pi
      where pi.organization_id = v_conflict.organization_id
        and pi.person_id = v_source_person_id
    ),
    'source_lead_count', (
      select count(*) from public.person_leads pl
      where pl.organization_id = v_conflict.organization_id
        and pl.person_id = v_source_person_id
    ),
    'source_session_count', (
      select count(*) from public.person_sessions ps
      where ps.organization_id = v_conflict.organization_id
        and ps.person_id = v_source_person_id
    ),
    'source_consent_receipt_count', (
      select count(*) from public.privacy_consent_receipts r
      where r.organization_id = v_conflict.organization_id
        and r.person_id = v_source_person_id
    )
  );

  if v_source_privacy_blockers > 0 then
    raise exception 'Merge blocked: candidate Person has privacy/legal workflow records requiring dedicated review';
  end if;

  if v_target_active_privacy_blockers > 0 then
    raise exception 'Merge blocked: surviving Person has an active privacy/legal workflow';
  end if;

  if v_active_ad_blockers > 0 then
    raise exception 'Merge blocked: Person pair has active ad activation or audience state';
  end if;

  -- Canonical identity ownership. The organization-scoped unique indexes on
  -- identifiers, Lead links and Session links protect against contradictory
  -- duplicate ownership inside this transaction.
  update public.person_identifiers pi
  set
    person_id = v_target_person_id,
    metadata = coalesce(pi.metadata, '{}'::jsonb) || jsonb_build_object(
      'identity_merge_source_person_id', v_source_person_id,
      'identity_merge_conflict_id', v_conflict.id,
      'identity_merge_version', 'pa1-human-approved-identity-merge-v1',
      'identity_merged_at', v_now
    ),
    updated_at = v_now
  where pi.organization_id = v_conflict.organization_id
    and pi.person_id = v_source_person_id;
  get diagnostics v_identifier_count = row_count;

  update public.person_leads pl
  set
    person_id = v_target_person_id,
    evidence = coalesce(pl.evidence, '{}'::jsonb) || jsonb_build_object(
      'identity_merge_source_person_id', v_source_person_id,
      'identity_merge_conflict_id', v_conflict.id,
      'identity_merge_version', 'pa1-human-approved-identity-merge-v1',
      'identity_merged_at', v_now
    ),
    updated_at = v_now
  where pl.organization_id = v_conflict.organization_id
    and pl.person_id = v_source_person_id;
  get diagnostics v_lead_count = row_count;

  update public.person_sessions ps
  set
    person_id = v_target_person_id,
    evidence = coalesce(ps.evidence, '{}'::jsonb) || jsonb_build_object(
      'identity_merge_source_person_id', v_source_person_id,
      'identity_merge_conflict_id', v_conflict.id,
      'identity_merge_version', 'pa1-human-approved-identity-merge-v1',
      'identity_merged_at', v_now
    ),
    updated_at = v_now
  where ps.organization_id = v_conflict.organization_id
    and ps.person_id = v_source_person_id;
  get diagnostics v_session_count = row_count;

  -- Consent receipts keep their captured subject_key/decision/source untouched.
  -- Only the canonical Person association changes, with merge provenance added.
  update public.privacy_consent_receipts r
  set
    person_id = v_target_person_id,
    metadata = coalesce(r.metadata, '{}'::jsonb) || jsonb_build_object(
      'identity_merge_source_person_id', v_source_person_id,
      'identity_merge_conflict_id', v_conflict.id,
      'identity_merge_version', 'pa1-human-approved-identity-merge-v1',
      'identity_merged_at', v_now
    )
  where r.organization_id = v_conflict.organization_id
    and r.person_id = v_source_person_id;
  get diagnostics v_consent_count = row_count;

  update public.persons p
  set
    status = 'merged',
    metadata = coalesce(p.metadata, '{}'::jsonb) || jsonb_build_object(
      'merged_into_person_id', v_target_person_id,
      'merged_at', v_now,
      'merge_conflict_id', v_conflict.id,
      'merge_version', 'pa1-human-approved-identity-merge-v1'
    ),
    updated_at = v_now
  where p.organization_id = v_conflict.organization_id
    and p.id = v_source_person_id;

  update public.persons p
  set
    metadata = coalesce(p.metadata, '{}'::jsonb) || jsonb_build_object(
      'last_identity_merge_source_person_id', v_source_person_id,
      'last_identity_merge_conflict_id', v_conflict.id,
      'last_identity_merge_at', v_now,
      'last_identity_merge_version', 'pa1-human-approved-identity-merge-v1'
    ),
    updated_at = v_now
  where p.organization_id = v_conflict.organization_id
    and p.id = v_target_person_id;

  update public.identity_resolution_conflicts c
  set
    status = 'resolved',
    resolution_action = 'merged_after_human_review',
    resolved_person_id = v_target_person_id,
    resolved_at = v_now,
    resolved_by = case when v_is_service_role then null else v_user_id end,
    metadata = coalesce(c.metadata, '{}'::jsonb) || jsonb_build_object(
      'merge_version', 'pa1-human-approved-identity-merge-v1',
      'reviewed_at', v_now,
      'source_person_id', v_source_person_id,
      'target_person_id', v_target_person_id,
      'initiating_conflict_id', v_conflict.id
    )
  where c.organization_id = v_conflict.organization_id
    and c.status = 'open'
    and (
      (c.person_id = v_target_person_id and v_source_person_id = any(c.candidate_person_ids))
      or
      (c.person_id = v_source_person_id and v_target_person_id = any(c.candidate_person_ids))
    );
  get diagnostics v_resolved_conflict_count = row_count;

  insert into public.person_merge_audit_v1 (
    organization_id,
    initiating_conflict_id,
    source_person_id,
    target_person_id,
    reviewed_by,
    moved_identifier_count,
    moved_lead_count,
    moved_session_count,
    moved_consent_receipt_count,
    resolved_conflict_count,
    preflight
  ) values (
    v_conflict.organization_id,
    v_conflict.id,
    v_source_person_id,
    v_target_person_id,
    case when v_is_service_role then null else v_user_id end,
    v_identifier_count,
    v_lead_count,
    v_session_count,
    v_consent_count,
    v_resolved_conflict_count,
    v_preflight
  );

  return jsonb_build_object(
    'conflict_id', v_conflict.id,
    'status', 'resolved',
    'changed', true,
    'source_person_id', v_source_person_id,
    'target_person_id', v_target_person_id,
    'moved_identifier_count', v_identifier_count,
    'moved_lead_count', v_lead_count,
    'moved_session_count', v_session_count,
    'moved_consent_receipt_count', v_consent_count,
    'resolved_conflict_count', v_resolved_conflict_count
  );
end;
$function$;

revoke all on function public.merge_identity_resolution_conflict_v1(uuid)
  from public, anon;
grant execute on function public.merge_identity_resolution_conflict_v1(uuid)
  to authenticated, service_role;

comment on function public.merge_identity_resolution_conflict_v1(uuid) is
  'Human-approved, one-candidate Person merge. Requires CRM manager/admin access, transfers canonical identity/journey ownership, preserves a merged source audit shell, and fails closed around privacy/legal/ad blockers.';

commit;
