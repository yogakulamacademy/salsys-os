-- AI-proposed knowledge updates (Job 6)
-- The AI never edits knowledge directly. It records a proposal that says
-- what would change, why, the expected effect and the risk, with evidence
-- from real conversations. An organization admin approves (optionally
-- after editing the text) or rejects each one. Approval reuses the normal
-- knowledge lifecycle: new versions supersede old ones and every change is
-- written to knowledge_approvals.

create table if not exists public.ai_knowledge_proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('add', 'update', 'retire')),
  target_document_id uuid,
  title text not null check (length(btrim(title)) between 1 and 180),
  category text not null default 'general' check (length(category) between 1 and 60),
  proposed_content text check (proposed_content is null or length(proposed_content) between 10 and 8000),
  current_excerpt text check (current_excerpt is null or length(current_excerpt) <= 2000),
  why text not null check (length(btrim(why)) between 10 and 1200),
  expected_effect text not null check (length(btrim(expected_effect)) between 10 and 800),
  risk text check (risk is null or length(risk) <= 800),
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array' and jsonb_array_length(evidence) <= 12),
  source text not null check (source in ('shadow_edits', 'unanswered_questions', 'owner_replies', 'other')),
  dedupe_key text not null check (length(dedupe_key) between 8 and 200),
  model text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 600),
  content_was_edited boolean not null default false,
  result_document_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_knowledge_proposals_target_fk foreign key (target_document_id, organization_id)
    references public.knowledge_documents(id, organization_id) on delete cascade,
  constraint ai_knowledge_proposals_result_fk foreign key (result_document_id, organization_id)
    references public.knowledge_documents(id, organization_id) on delete set null (result_document_id),
  constraint ai_knowledge_proposals_shape check (
    (kind = 'add' and target_document_id is null and proposed_content is not null)
    or (kind = 'update' and target_document_id is not null and proposed_content is not null)
    or (kind = 'retire' and target_document_id is not null)
  ),
  constraint ai_knowledge_proposals_decision check (
    (status = 'pending' and decided_at is null)
    or (status <> 'pending' and decided_at is not null)
  ),
  constraint ai_knowledge_proposals_dedupe unique (organization_id, dedupe_key)
);

create index if not exists ai_knowledge_proposals_org_status_idx
  on public.ai_knowledge_proposals (organization_id, status, created_at desc);
create index if not exists ai_knowledge_proposals_target_idx
  on public.ai_knowledge_proposals (target_document_id) where target_document_id is not null;

drop trigger if exists ai_knowledge_proposals_set_updated_at on public.ai_knowledge_proposals;
create trigger ai_knowledge_proposals_set_updated_at
  before update on public.ai_knowledge_proposals
  for each row execute function public.set_updated_at();

alter table public.ai_knowledge_proposals enable row level security;

-- Proposals quote lead messages, so only people who manage AI knowledge see them.
drop policy if exists ai_knowledge_proposals_select_managers on public.ai_knowledge_proposals;
create policy ai_knowledge_proposals_select_managers
  on public.ai_knowledge_proposals for select to authenticated
  using (public.can_manage_organization(organization_id));

revoke all on public.ai_knowledge_proposals from anon, authenticated;
grant select on public.ai_knowledge_proposals to authenticated;
grant all on public.ai_knowledge_proposals to service_role;

-- Records one proposal. Service role only (called by the proposal job).
create or replace function public.record_ai_knowledge_proposal_v1(
  p_organization_id uuid,
  p_kind text,
  p_target_document_id uuid,
  p_title text,
  p_category text,
  p_proposed_content text,
  p_why text,
  p_expected_effect text,
  p_risk text,
  p_evidence jsonb,
  p_source text,
  p_dedupe_key text,
  p_model text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_target record;
  v_excerpt text;
  v_id uuid;
  v_pending int;
begin
  if auth.role() is distinct from 'service_role' and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'AI knowledge proposals are recorded by the system only';
  end if;

  if exists (select 1 from public.ai_knowledge_proposals
             where organization_id = p_organization_id and dedupe_key = p_dedupe_key) then
    return jsonb_build_object('ok', true, 'outcome', 'duplicate');
  end if;

  select count(*) into v_pending from public.ai_knowledge_proposals
  where organization_id = p_organization_id and status = 'pending';
  if v_pending >= 25 then
    return jsonb_build_object('ok', true, 'outcome', 'capped');
  end if;

  if p_kind in ('update', 'retire') then
    select id, status, content into v_target from public.knowledge_documents
    where id = p_target_document_id and organization_id = p_organization_id;
    if not found then
      raise exception 'Target knowledge document was not found';
    end if;
    if v_target.status <> 'approved' then
      return jsonb_build_object('ok', true, 'outcome', 'target_not_live');
    end if;
    -- One open proposal per document at a time.
    if exists (select 1 from public.ai_knowledge_proposals
               where target_document_id = p_target_document_id and status = 'pending') then
      return jsonb_build_object('ok', true, 'outcome', 'target_has_pending');
    end if;
    v_excerpt := left(v_target.content, 2000);
  end if;

  insert into public.ai_knowledge_proposals (
    organization_id, kind, target_document_id, title, category, proposed_content,
    current_excerpt, why, expected_effect, risk, evidence, source, dedupe_key, model
  ) values (
    p_organization_id, p_kind, case when p_kind = 'add' then null else p_target_document_id end,
    btrim(p_title), coalesce(nullif(btrim(coalesce(p_category, '')), ''), 'general'),
    nullif(btrim(coalesce(p_proposed_content, '')), ''),
    v_excerpt,
    btrim(p_why), btrim(p_expected_effect), nullif(btrim(coalesce(p_risk, '')), ''),
    coalesce(p_evidence, '[]'::jsonb), p_source, p_dedupe_key, p_model
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'outcome', 'created', 'proposal_id', v_id);
end;
$function$;

-- Approves or rejects one proposal. Organization admins only.
create or replace function public.decide_ai_knowledge_proposal_v1(
  p_proposal_id uuid,
  p_decision text,
  p_edited_content text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_p public.ai_knowledge_proposals%rowtype;
  v_target public.knowledge_documents%rowtype;
  v_actor uuid := auth.uid();
  v_now timestamptz := now();
  v_content text;
  v_edited boolean := false;
  v_doc uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if p_decision not in ('approve', 'reject') then
    raise exception 'Decision must be approve or reject';
  end if;

  select * into v_p from public.ai_knowledge_proposals where id = p_proposal_id for update;
  if not found then
    raise exception 'Proposal was not found';
  end if;

  if auth.role() is distinct from 'service_role' and not public.can_manage_organization(v_p.organization_id) then
    raise exception 'Only organization admins can decide AI knowledge proposals';
  end if;

  if v_p.status <> 'pending' then
    return jsonb_build_object('ok', true, 'outcome', 'already_decided', 'status', v_p.status);
  end if;

  if p_decision = 'reject' then
    update public.ai_knowledge_proposals
    set status = 'rejected', decided_by = v_actor, decided_at = v_now, decision_note = left(v_note, 600)
    where id = v_p.id;
    return jsonb_build_object('ok', true, 'outcome', 'rejected');
  end if;

  if v_p.target_document_id is not null then
    select * into v_target from public.knowledge_documents
    where id = v_p.target_document_id and organization_id = v_p.organization_id for update;
    if not found or v_target.status <> 'approved' then
      update public.ai_knowledge_proposals
      set status = 'expired', decided_by = v_actor, decided_at = v_now,
          decision_note = 'The knowledge it would change is no longer live.'
      where id = v_p.id;
      return jsonb_build_object('ok', true, 'outcome', 'expired');
    end if;
  end if;

  if v_p.kind = 'retire' then
    update public.knowledge_documents set status = 'archived'
    where id = v_target.id and organization_id = v_p.organization_id;
    insert into public.knowledge_approvals (organization_id, document_id, action, reviewer_id, note)
    values (v_p.organization_id, v_target.id, 'archived', v_actor,
            left('Retired from AI proposal: ' || v_p.why, 1000));
    v_doc := v_target.id;
  else
    v_content := nullif(btrim(coalesce(p_edited_content, '')), '');
    if v_content is not null and v_content <> v_p.proposed_content then
      v_edited := true;
    else
      v_content := v_p.proposed_content;
    end if;
    if length(v_content) < 10 or length(v_content) > 8000 then
      raise exception 'Knowledge content must be between 10 and 8000 characters';
    end if;

    insert into public.knowledge_documents (
      organization_id, source_id, title, category, content, status, version,
      supersedes_document_id, approved_by, approved_at, created_by, metadata
    ) values (
      v_p.organization_id,
      case when v_p.kind = 'update' then v_target.source_id else null end,
      v_p.title, v_p.category, v_content, 'approved',
      case when v_p.kind = 'update' then v_target.version + 1 else 1 end,
      case when v_p.kind = 'update' then v_target.id else null end,
      v_actor, v_now, v_actor,
      jsonb_build_object('entry_mode', 'ai_proposal', 'proposal_id', v_p.id, 'edited_by_reviewer', v_edited)
    )
    returning id into v_doc;

    insert into public.knowledge_chunks (organization_id, document_id, chunk_index, content, metadata)
    values (v_p.organization_id, v_doc, 0, v_content, jsonb_build_object('source', 'document_content_v1'));

    insert into public.knowledge_approvals (organization_id, document_id, action, reviewer_id, note)
    values (v_p.organization_id, v_doc, 'approved', v_actor,
            left('Approved AI proposal' || case when v_edited then ' (edited)' else '' end || ': ' || v_p.why, 1000));

    if v_p.kind = 'update' then
      update public.knowledge_documents set status = 'superseded'
      where id = v_target.id and organization_id = v_p.organization_id;
      insert into public.knowledge_approvals (organization_id, document_id, action, reviewer_id, note)
      values (v_p.organization_id, v_target.id, 'superseded', v_actor, 'Replaced by an approved AI proposal.');
    end if;
  end if;

  update public.ai_knowledge_proposals
  set status = 'approved', decided_by = v_actor, decided_at = v_now, decision_note = left(v_note, 600),
      content_was_edited = v_edited, result_document_id = v_doc
  where id = v_p.id;

  return jsonb_build_object('ok', true, 'outcome', 'approved', 'document_id', v_doc, 'edited', v_edited);
end;
$function$;

revoke all on function public.record_ai_knowledge_proposal_v1(uuid, text, uuid, text, text, text, text, text, text, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.record_ai_knowledge_proposal_v1(uuid, text, uuid, text, text, text, text, text, text, jsonb, text, text, text) to service_role;
revoke all on function public.decide_ai_knowledge_proposal_v1(uuid, text, text, text) from public, anon;
grant execute on function public.decide_ai_knowledge_proposal_v1(uuid, text, text, text) to authenticated, service_role;

comment on table public.ai_knowledge_proposals is
  'AI-proposed changes to organization knowledge (add, update, retire) with why, expected effect, risk and conversation evidence. Nothing changes until an admin approves.';
