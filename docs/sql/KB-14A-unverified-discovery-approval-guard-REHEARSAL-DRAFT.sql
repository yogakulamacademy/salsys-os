-- KB-14A: UNVERIFIED DISCOVERY DOCUMENT PUBLICATION HOLD.
-- DISPOSABLE LOCAL POSTGRES ONLY. NOT A SUPABASE MIGRATION.
-- This candidate accompanies KB-11A/B/13B in a randomly named throwaway DB.
-- No protected main merge, hosted SQL execution or production permission.
do $kb14_guard$
begin
  if current_database() !~ '^salsys_kb11a_[a-f0-9]{18}$'
     or to_regprocedure('public.create_discovery_review_draft_with_current_consent_v1(uuid,uuid,text,text,text)') is null
     or to_regclass('public.test_knowledge_admins') is null
     or to_regclass('public.knowledge_documents') is null
     or to_regclass('public.knowledge_sources') is null
     or to_regclass('public.knowledge_approvals') is null
     or to_regclass('public.leads') is not null
     or to_regclass('public.contacts') is not null then
    raise exception 'KB14A_LOCAL_DISPOSABLE_FIXTURE_REQUIRED' using errcode='42501';
  end if;
end;
$kb14_guard$;

-- Even a privileged direct UPDATE or the already-deployed generic
-- approve_knowledge_document_v1 must not publish an unverified
-- discovered-page draft. The trigger is installed on the document table,
-- not just the optional Next.js "Approve" form, avoiding RPC bypass.
-- Explicit archive is allowed; actual deletion/retention and future
-- human evidence publication require an independent approved design.
create function public.kb14a_hold_discovery_document_publish_v1()
returns trigger
language plpgsql volatile security invoker
set search_path = ''
as $kb14_document$
declare
  v_unverified boolean;
begin
  -- KB-15A: With SECURITY INVOKER a source can be hidden by RLS, even
  -- when its FK still exists. The old "EXISTS marker" check would silently
  -- return false in that case, permitting a forged approved document with
  -- blank metadata. Fail closed on any non-NULL linked source not visible
  -- to the current invoker, including the old source on a rebinding UPDATE.
  -- This is only an uninstalled local prototype, not reviewed Auth/RLS DDL.
  if new.source_id is not null and not exists (
    select 1 from public.knowledge_sources s
    where s.id=new.source_id and s.organization_id=new.organization_id
  ) then
    raise exception 'kb_discovery_linked_source_unreadable'
      using errcode='42501';
  end if;
  if tg_op='UPDATE' then
    if old.source_id is not null and not exists (
      select 1 from public.knowledge_sources s
      where s.id=old.source_id and s.organization_id=old.organization_id
    ) then
      raise exception 'kb_discovery_previous_source_unreadable'
        using errcode='42501';
    end if;
  end if;

  v_unverified :=
    coalesce(new.metadata->>'entry_mode','')='discovery_manual_review'
    or coalesce(new.metadata->>'manual_review_required','')='true'
    or coalesce(new.metadata->>'source_text_verified','')='false'
    or exists (
      select 1 from public.knowledge_sources s
      where s.id=new.source_id and s.organization_id=new.organization_id
        and (
          s.metadata->>'entry_mode'='discovery_manual_review'
          or s.metadata->>'source_text_verified'='false'
        )
    );

  if tg_op='UPDATE' then
    v_unverified := v_unverified
      or coalesce(old.metadata->>'entry_mode','')='discovery_manual_review'
      or coalesce(old.metadata->>'manual_review_required','')='true'
      or coalesce(old.metadata->>'source_text_verified','')='false'
      or exists (
        select 1 from public.knowledge_sources s
        where s.id=old.source_id and s.organization_id=old.organization_id
          and (
            s.metadata->>'entry_mode'='discovery_manual_review'
            or s.metadata->>'source_text_verified'='false'
          )
      );
  end if;

  if v_unverified then
    if tg_op='UPDATE' and (
      old.organization_id is distinct from new.organization_id
      or old.source_id is distinct from new.source_id
      or old.metadata is distinct from new.metadata
    ) then
      raise exception 'kb_discovery_unverified_provenance_immutable'
        using errcode='42501';
    end if;
    if new.status not in ('draft','archived')
       or (tg_op='UPDATE' and old.status='archived' and new.status<>'archived') then
      raise exception 'kb_discovery_unverified_publication_denied'
        using errcode='42501';
    end if;
  end if;
  return new;
end;
$kb14_document$;

revoke all on function public.kb14a_hold_discovery_document_publish_v1()
  from public,anon,authenticated,service_role;

create trigger kb14a_hold_unverified_discovery_document
before insert or update on public.knowledge_documents
for each row execute function public.kb14a_hold_discovery_document_publish_v1();

-- The other half of provenance is on the source. Its status may still be
-- disabled/archived for containment, but a privileged source metadata edit
-- must not erase the discovery marker to defeat the document trigger.
create function public.kb14a_hold_discovery_source_provenance_v1()
returns trigger
language plpgsql volatile security invoker
set search_path = ''
as $kb14_source$
begin
  if (
      coalesce(old.metadata->>'entry_mode','')='discovery_manual_review'
      or coalesce(old.metadata->>'source_text_verified','')='false'
    ) and (
      old.organization_id is distinct from new.organization_id
      or old.metadata is distinct from new.metadata
      or old.source_uri is distinct from new.source_uri
      or old.source_type is distinct from new.source_type
    ) then
    raise exception 'kb_discovery_unverified_source_immutable'
      using errcode='42501';
  end if;
  return new;
end;
$kb14_source$;

revoke all on function public.kb14a_hold_discovery_source_provenance_v1()
  from public,anon,authenticated,service_role;

create trigger kb14a_hold_unverified_discovery_source
before update on public.knowledge_sources
for each row execute function public.kb14a_hold_discovery_source_provenance_v1();

-- These table triggers are an UNINSTALLED stop-gap prototype, not
-- owner-approved source verification or production retrieval hardening.
-- A previous already-approved unverified document still needs an independent
-- retrieval isolation, source invalidation and incident review.
