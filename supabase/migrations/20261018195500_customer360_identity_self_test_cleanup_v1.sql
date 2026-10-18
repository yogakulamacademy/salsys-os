-- R4 Customer 360 closeout hygiene
-- Remove only isolated identity self-test Person rows that have no identifiers,
-- no linked leads and no linked sessions. No production customer evidence is touched.

delete from public.persons p
using public.organizations o
where o.id = p.organization_id
  and o.slug = 'salsysos'
  and coalesce(p.metadata->>'source_system','') = 'identity_self_test'
  and coalesce(p.metadata->>'created_by','') = 'smart_identity_ambiguous_isolation'
  and not exists (
    select 1
    from public.person_identifiers pi
    where pi.organization_id = p.organization_id
      and pi.person_id = p.id
  )
  and not exists (
    select 1
    from public.person_leads pl
    where pl.organization_id = p.organization_id
      and pl.person_id = p.id
  )
  and not exists (
    select 1
    from public.person_sessions ps
    where ps.organization_id = p.organization_id
      and ps.person_id = p.id
  );
