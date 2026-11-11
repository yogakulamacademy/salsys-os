-- KB-06E: UNAPPLIED DRAFT ONLY. Requires KB-01B, 06A, 06B and 06C.
-- Operator-registered exact policy text for owner read-only inspection.
-- No source text/approval is supplied or asserted by this schema.
-- NEVER apply to Production/Recovery; do not seed a policy or enable grants.
begin;

create table public.knowledge_discovery_policy_documents (
  policy_version text primary key
    check(length(btrim(policy_version)) between 1 and 100),
  policy_text text not null
    check(octet_length(convert_to(policy_text, 'UTF8')) between 40 and 16000),
  policy_sha256 text not null
    check(policy_sha256 ~ '^[a-f0-9]{64}$'
      and policy_sha256=encode(sha256(convert_to(policy_text,'UTF8')),'hex')),
  -- Operator-supplied pointer only, NOT independent evidence of legal approval.
  source_reference text not null check(length(btrim(source_reference)) between 1 and 500),
  recorded_at timestamptz not null default clock_timestamp()
);
alter table public.knowledge_discovery_policy_documents enable row level security;
revoke all on public.knowledge_discovery_policy_documents
  from public,anon,authenticated,service_role;
grant all on public.knowledge_discovery_policy_documents to service_role;

create or replace function public.kb_discovery_policy_document_immutable_v1()
returns trigger language plpgsql security invoker
set search_path=pg_catalog,pg_temp as $fn$
begin
  raise exception 'kb_policy_document_append_only' using errcode='42501';
end;
$fn$;
revoke all on function public.kb_discovery_policy_document_immutable_v1()
  from public,anon,authenticated;
create trigger kb_discovery_policy_document_immutable
before update or delete on public.knowledge_discovery_policy_documents
for each row execute function public.kb_discovery_policy_document_immutable_v1();

-- The function is the ONLY authenticated read route. It checks the strict
-- KB-06B live auth.sessions and exact tenant-session binding before looking
-- up anything. No tenant may name another tenant's org or use an unbound JWT.
-- SECURITY DEFINER can read the operator-only document/control tables; do
-- not widen EXECUTE grants or expose direct table SELECT. No write occurs.
create or replace function public.get_knowledge_discovery_policy_preview_v1(
  p_organization_id uuid
) returns jsonb
language plpgsql stable security definer
set search_path=public,auth,pg_temp
as $fn$
declare
  v_doc record;
begin
  if p_organization_id is null
    or public.kb_discovery_consent_actor_v1(p_organization_id) is null then
    raise exception 'kb_policy_preview_session_denied' using errcode='42501';
  end if;

  select d.policy_version,d.policy_sha256,d.policy_text,d.source_reference,
         d.recorded_at,c.approved_at
    into v_doc
    from public.knowledge_discovery_consent_control c
    join public.knowledge_discovery_policy_documents d
      on d.policy_version=c.approved_policy_version
      and d.policy_sha256=c.approved_policy_sha256
   where c.singleton=true
     and c.approved_at is not null
     and c.approved_at<=clock_timestamp()
     and encode(sha256(convert_to(d.policy_text,'UTF8')),'hex')=d.policy_sha256
     and octet_length(convert_to(d.policy_text,'UTF8'))<=16000
   limit 1;

  if not found then
    return jsonb_build_object('ok',false,'reason','policy_not_registered_or_mismatch');
  end if;

  return jsonb_build_object(
    'ok',true,
    'policyVersion',v_doc.policy_version,
    'policySha256',v_doc.policy_sha256,
    'policyText',v_doc.policy_text,
    'sourceReference',v_doc.source_reference,
    'recordedAt',to_char(v_doc.recorded_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'registryRecordedAt',to_char(v_doc.approved_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
end;
$fn$;

revoke all on function public.get_knowledge_discovery_policy_preview_v1(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_knowledge_discovery_policy_preview_v1(uuid)
  to authenticated;

commit;
