-- Improve Organization Knowledge V1 lexical retrieval.
-- The original websearch_to_tsquery('simple', ...) required every conversational token
-- to be present, so a question such as "What is BLUE MANGO CODE?" could fail to
-- match an approved chunk containing "BLUE MANGO CODE". Build a safe OR-prefix
-- tsquery from meaningful query terms instead.

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
  terms as (
    select distinct lower(term) as term
    from params p
    cross join lateral regexp_split_to_table(
      lower(coalesce(p.query_text, '')),
      '[^[:alnum:]_]+'
    ) as term
    where length(term) >= 3
      and term not in (
        'the','and','for','with','this','that','from','your','you','our','are','was',
        'were','what','when','where','which','who','why','how','can','could','would',
        'should','please','tell','about','have','has','had','does','did','will','want',
        'need','know','there','their','they','them','into','just','also'
      )
  ),
  q as (
    select
      case
        when count(t.term) = 0 then null::tsquery
        else to_tsquery(
          'simple',
          string_agg(t.term || ':*', ' | ' order by t.term)
        )
      end as tsq,
      p.result_limit
    from params p
    left join terms t on true
    group by p.result_limit
  ),
  ranked as (
    select
      kc.id as chunk_id,
      kd.id as document_id,
      kd.title,
      kd.category,
      kc.content,
      (
        ts_rank_cd(kc.search_vector, q.tsq)
        + case
            when to_tsvector('simple', coalesce(kd.title, '')) @@ q.tsq then 0.2
            else 0
          end
      )::real as rank,
      kd.valid_until,
      jsonb_build_object(
        'document_version', kd.version,
        'document_updated_at', kd.updated_at,
        'source_id', kd.source_id,
        'chunk_index', kc.chunk_index,
        'document_metadata', kd.metadata,
        'chunk_metadata', kc.metadata
      ) as metadata,
      kd.updated_at,
      kc.chunk_index
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
      and q.tsq is not null
      and kd.status = 'approved'
      and (kd.valid_from is null or kd.valid_from <= now())
      and (kd.valid_until is null or kd.valid_until > now())
      and (ks.id is null or ks.status = 'active')
      and (
        kc.search_vector @@ q.tsq
        or to_tsvector('simple', coalesce(kd.title, '')) @@ q.tsq
      )
  )
  select
    r.chunk_id,
    r.document_id,
    r.title,
    r.category,
    r.content,
    r.rank,
    r.valid_until,
    r.metadata
  from ranked r
  order by r.rank desc, r.updated_at desc, r.chunk_index asc
  limit (select result_limit from q);
$function$;

revoke all on function public.search_organization_knowledge_v1(uuid, text, integer) from public;
grant execute on function public.search_organization_knowledge_v1(uuid, text, integer) to authenticated;
grant execute on function public.search_organization_knowledge_v1(uuid, text, integer) to service_role;

comment on function public.search_organization_knowledge_v1(uuid, text, integer) is
  'Returns approved, currently valid tenant knowledge using meaningful OR-prefix lexical matching so conversational filler words do not suppress relevant facts.';
