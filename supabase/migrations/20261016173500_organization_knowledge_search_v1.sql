-- Tenant-safe lexical retrieval for approved organization knowledge.
-- V1 intentionally uses PostgreSQL full-text search. Semantic/vector retrieval remains a later DI/OpenSearch step.

create or replace function public.search_organization_knowledge_v1(
  p_organization_id uuid,
  p_query text,
  p_limit integer default 8
)
returns table (
  chunk_id uuid,
  document_id uuid,
  title text,
  category text,
  content text,
  rank real,
  valid_until timestamptz,
  metadata jsonb
)
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
  with params as (
    select
      nullif(btrim(coalesce(p_query, '')), '') as query_text,
      greatest(1, least(coalesce(p_limit, 8), 20)) as result_limit
  ),
  q as (
    select websearch_to_tsquery('simple', query_text) as tsq, result_limit
    from params
    where query_text is not null
  )
  select
    kc.id as chunk_id,
    kd.id as document_id,
    kd.title,
    kd.category,
    kc.content,
    ts_rank_cd(kc.search_vector, q.tsq)::real as rank,
    kd.valid_until,
    jsonb_build_object(
      'document_version', kd.version,
      'document_updated_at', kd.updated_at,
      'source_id', kd.source_id,
      'chunk_index', kc.chunk_index,
      'document_metadata', kd.metadata,
      'chunk_metadata', kc.metadata
    ) as metadata
  from q
  join public.knowledge_chunks kc
    on kc.organization_id = p_organization_id
  join public.knowledge_documents kd
    on kd.id = kc.document_id
   and kd.organization_id = kc.organization_id
  left join public.knowledge_sources ks
    on ks.id = kd.source_id
   and ks.organization_id = kd.organization_id
  where public.is_organization_member(p_organization_id)
    and kd.status = 'approved'
    and (kd.valid_from is null or kd.valid_from <= now())
    and (kd.valid_until is null or kd.valid_until > now())
    and (ks.id is null or ks.status = 'active')
    and kc.search_vector @@ q.tsq
  order by
    ts_rank_cd(kc.search_vector, q.tsq) desc,
    kd.updated_at desc,
    kc.chunk_index asc
  limit (select result_limit from q);
$function$;

revoke all on function public.search_organization_knowledge_v1(uuid, text, integer) from public;
grant execute on function public.search_organization_knowledge_v1(uuid, text, integer) to authenticated;
grant execute on function public.search_organization_knowledge_v1(uuid, text, integer) to service_role;

comment on function public.search_organization_knowledge_v1(uuid, text, integer) is
  'Returns only approved, currently valid knowledge chunks for the caller organization, ranked by PostgreSQL full-text relevance.';
