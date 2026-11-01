-- AI Knowledge final closeout
-- Make document lifecycle mutations atomic so retrieval state, indexing, and
-- approval history can never diverge after a partial server-action failure.
-- Retrieval semantics are intentionally unchanged.

create or replace function public.create_knowledge_document_v1(
  p_organization_id uuid,
  p_title text,
  p_category text,
  p_content text,
  p_approve boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_category text := coalesce(nullif(btrim(coalesce(p_category, '')), ''), 'general');
  v_content text := nullif(btrim(coalesce(p_content, '')), '');
  v_document_id uuid;
  v_actor uuid := auth.uid();
  v_now timestamptz := now();
begin
  if p_organization_id is null then
    raise exception 'Organization ID is required';
  end if;

  if auth.role() <> 'service_role'
     and not public.can_manage_organization(p_organization_id) then
    raise exception 'Only organization admins can manage AI knowledge';
  end if;

  if v_title is null then
    raise exception 'Knowledge title is required';
  end if;

  if length(v_title) > 180 then
    raise exception 'Knowledge title must be 180 characters or fewer';
  end if;

  if v_content is null or length(v_content) < 10 then
    raise exception 'Knowledge content must be at least 10 characters';
  end if;

  insert into public.knowledge_documents (
    organization_id,
    title,
    category,
    content,
    status,
    approved_by,
    approved_at,
    created_by,
    metadata
  )
  values (
    p_organization_id,
    v_title,
    v_category,
    v_content,
    case when coalesce(p_approve, false) then 'approved' else 'draft' end,
    case when coalesce(p_approve, false) then v_actor else null end,
    case when coalesce(p_approve, false) then v_now else null end,
    v_actor,
    jsonb_build_object('entry_mode', 'manual')
  )
  returning id into v_document_id;

  insert into public.knowledge_chunks (
    organization_id,
    document_id,
    chunk_index,
    content,
    metadata
  )
  values (
    p_organization_id,
    v_document_id,
    0,
    v_content,
    jsonb_build_object('source', 'document_content_v1')
  );

  if coalesce(p_approve, false) then
    insert into public.knowledge_approvals (
      organization_id,
      document_id,
      action,
      reviewer_id,
      note
    )
    values (
      p_organization_id,
      v_document_id,
      'approved',
      v_actor,
      'Approved during manual knowledge creation.'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'document_id', v_document_id,
    'status', case when coalesce(p_approve, false) then 'approved' else 'draft' end
  );
end;
$function$;

create or replace function public.approve_knowledge_document_v1(
  p_organization_id uuid,
  p_document_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_status text;
  v_content text;
  v_actor uuid := auth.uid();
  v_now timestamptz := now();
begin
  if p_organization_id is null or p_document_id is null then
    raise exception 'Organization and knowledge document are required';
  end if;

  if auth.role() <> 'service_role'
     and not public.can_manage_organization(p_organization_id) then
    raise exception 'Only organization admins can manage AI knowledge';
  end if;

  select status, content
  into v_status, v_content
  from public.knowledge_documents
  where organization_id = p_organization_id
    and id = p_document_id
  for update;

  if not found then
    raise exception 'Knowledge document was not found';
  end if;

  if v_status = 'approved' then
    return jsonb_build_object(
      'ok', true,
      'document_id', p_document_id,
      'status', 'approved',
      'already_approved', true
    );
  end if;

  if v_status in ('archived', 'superseded') then
    raise exception 'Archived or superseded knowledge cannot be approved';
  end if;

  if not exists (
    select 1
    from public.knowledge_chunks
    where organization_id = p_organization_id
      and document_id = p_document_id
  ) then
    insert into public.knowledge_chunks (
      organization_id,
      document_id,
      chunk_index,
      content,
      metadata
    )
    values (
      p_organization_id,
      p_document_id,
      0,
      v_content,
      jsonb_build_object('source', 'document_content_v1')
    );
  end if;

  update public.knowledge_documents
  set status = 'approved',
      approved_by = v_actor,
      approved_at = v_now
  where organization_id = p_organization_id
    and id = p_document_id;

  insert into public.knowledge_approvals (
    organization_id,
    document_id,
    action,
    reviewer_id,
    note
  )
  values (
    p_organization_id,
    p_document_id,
    'approved',
    v_actor,
    'Approved from the Knowledge workspace.'
  );

  return jsonb_build_object(
    'ok', true,
    'document_id', p_document_id,
    'status', 'approved',
    'already_approved', false
  );
end;
$function$;

create or replace function public.archive_knowledge_document_v1(
  p_organization_id uuid,
  p_document_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_status text;
  v_actor uuid := auth.uid();
begin
  if p_organization_id is null or p_document_id is null then
    raise exception 'Organization and knowledge document are required';
  end if;

  if auth.role() <> 'service_role'
     and not public.can_manage_organization(p_organization_id) then
    raise exception 'Only organization admins can manage AI knowledge';
  end if;

  select status
  into v_status
  from public.knowledge_documents
  where organization_id = p_organization_id
    and id = p_document_id
  for update;

  if not found then
    raise exception 'Knowledge document was not found';
  end if;

  if v_status = 'archived' then
    return jsonb_build_object(
      'ok', true,
      'document_id', p_document_id,
      'status', 'archived',
      'already_archived', true
    );
  end if;

  update public.knowledge_documents
  set status = 'archived'
  where organization_id = p_organization_id
    and id = p_document_id;

  insert into public.knowledge_approvals (
    organization_id,
    document_id,
    action,
    reviewer_id,
    note
  )
  values (
    p_organization_id,
    p_document_id,
    'archived',
    v_actor,
    'Archived from the Knowledge workspace.'
  );

  return jsonb_build_object(
    'ok', true,
    'document_id', p_document_id,
    'status', 'archived',
    'already_archived', false
  );
end;
$function$;

revoke all on function public.create_knowledge_document_v1(uuid, text, text, text, boolean) from public, anon;
revoke all on function public.approve_knowledge_document_v1(uuid, uuid) from public, anon;
revoke all on function public.archive_knowledge_document_v1(uuid, uuid) from public, anon;

grant execute on function public.create_knowledge_document_v1(uuid, text, text, text, boolean) to authenticated, service_role;
grant execute on function public.approve_knowledge_document_v1(uuid, uuid) to authenticated, service_role;
grant execute on function public.archive_knowledge_document_v1(uuid, uuid) to authenticated, service_role;

comment on function public.create_knowledge_document_v1(uuid, text, text, text, boolean) is
  'Atomically creates one tenant knowledge document, its retrieval chunk, and approval history when approved at creation.';
comment on function public.approve_knowledge_document_v1(uuid, uuid) is
  'Atomically ensures retrieval indexing, marks eligible tenant knowledge approved, and records the human approval event.';
comment on function public.archive_knowledge_document_v1(uuid, uuid) is
  'Atomically archives tenant knowledge and records the human archive event so lifecycle state and audit history cannot diverge.';
