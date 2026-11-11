-- AI Knowledge provenance readiness V2
-- Add a source-backed knowledge creation path with explicit validity controls.
-- This is additive: existing V1 lifecycle/retrieval behavior remains unchanged and
-- no autonomous messaging is enabled by this migration.

create or replace function public.create_source_backed_knowledge_document_v2(
  p_organization_id uuid,
  p_title text,
  p_category text,
  p_content text,
  p_source_name text,
  p_source_type text default 'manual',
  p_source_uri text default null,
  p_valid_from timestamptz default null,
  p_valid_until timestamptz default null,
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
  v_source_name text := nullif(btrim(coalesce(p_source_name, '')), '');
  v_source_type text := lower(coalesce(nullif(btrim(coalesce(p_source_type, '')), ''), 'manual'));
  v_source_uri text := nullif(btrim(coalesce(p_source_uri, '')), '');
  v_document_id uuid;
  v_source_id uuid;
  v_actor uuid := auth.uid();
  v_now timestamptz := now();
begin
  if p_organization_id is null then
    raise exception 'Organization ID is required';
  end if;

  -- Privileged function authorization must fail closed when the JWT role or
  -- the tenant-management result is NULL (or otherwise not explicitly true).
  if auth.role() is distinct from 'service_role'
     and public.can_manage_organization(p_organization_id) is distinct from true then
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

  if v_source_name is null then
    raise exception 'Knowledge source name is required';
  end if;

  if length(v_source_name) > 240 then
    raise exception 'Knowledge source name must be 240 characters or fewer';
  end if;

  if v_source_type not in (
    'manual','website','pdf','drive','faq','policy','course','crm_reply','other'
  ) then
    raise exception 'Unsupported knowledge source type';
  end if;

  if v_source_uri is not null then
    if length(v_source_uri) > 2048 then
      raise exception 'Knowledge source URL must be 2048 characters or fewer';
    end if;

    if v_source_uri !~* '^https?://[^[:space:]]+$' then
      raise exception 'Knowledge source URL must use http or https';
    end if;
  end if;

  if p_valid_until is not null
     and p_valid_from is not null
     and p_valid_until <= p_valid_from then
    raise exception 'Knowledge valid until must be later than valid from';
  end if;

  insert into public.knowledge_sources (
    organization_id,
    source_type,
    name,
    source_uri,
    status,
    metadata,
    created_by
  )
  values (
    p_organization_id,
    v_source_type,
    v_source_name,
    v_source_uri,
    'active',
    jsonb_build_object('entry_mode', 'knowledge_workspace_v2'),
    v_actor
  )
  returning id into v_source_id;

  insert into public.knowledge_documents (
    organization_id,
    source_id,
    title,
    category,
    content,
    status,
    valid_from,
    valid_until,
    approved_by,
    approved_at,
    created_by,
    metadata
  )
  values (
    p_organization_id,
    v_source_id,
    v_title,
    v_category,
    v_content,
    case when coalesce(p_approve, false) then 'approved' else 'draft' end,
    p_valid_from,
    p_valid_until,
    case when coalesce(p_approve, false) then v_actor else null end,
    case when coalesce(p_approve, false) then v_now else null end,
    v_actor,
    jsonb_strip_nulls(
      jsonb_build_object(
        'entry_mode', 'knowledge_workspace_v2',
        'source_name', v_source_name,
        'source_type', v_source_type,
        'source_uri', v_source_uri
      )
    )
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
    jsonb_build_object('source', 'document_content_v2')
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
      'Approved during source-backed knowledge creation.'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'document_id', v_document_id,
    'source_id', v_source_id,
    'status', case when coalesce(p_approve, false) then 'approved' else 'draft' end
  );
end;
$function$;

revoke all on function public.create_source_backed_knowledge_document_v2(
  uuid, text, text, text, text, text, text, timestamptz, timestamptz, boolean
) from public, anon;

grant execute on function public.create_source_backed_knowledge_document_v2(
  uuid, text, text, text, text, text, text, timestamptz, timestamptz, boolean
) to authenticated, service_role;

comment on function public.create_source_backed_knowledge_document_v2(
  uuid, text, text, text, text, text, text, timestamptz, timestamptz, boolean
) is
  'Atomically creates a tenant-scoped knowledge source, linked versioned document, retrieval chunk, optional validity window, and approval audit. Source URLs are recorded as provenance only and are never fetched by this function.';
