begin;

-- =============================================================================
-- Customer Journey / Person 360 / Identity Closeout V1
--
-- Hardens the strongest identity boundary in SalsysOS:
--   * browser/device IDs are routing state, not permanent human identity;
--   * exact-session handoff is atomic;
--   * tenant alignment is enforced by composite foreign keys;
--   * automatic identity matching uses an explicit conservative org policy;
--   * production integrity is observable from one health view.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Explicit conservative identity policy for every organization.
--
-- Existing org-specific policies are preserved. Missing policies are created at
-- a threshold that does not auto-link from a lone unverified email/telephone
-- signal. Verified identifiers, exact-session evidence, or multiple independent
-- signals can still qualify according to the confidence engine.
-- -----------------------------------------------------------------------------

alter table public.identity_resolution_policies
  alter column auto_link_threshold set default 0.9800;

insert into public.identity_resolution_policies (
  organization_id,
  auto_link_threshold,
  ambiguity_margin,
  policy_enabled,
  metadata
)
select
  o.id,
  0.9800,
  0.0800,
  true,
  jsonb_build_object(
    'policy_version', 'customer360-identity-closeout-v1',
    'default_posture', 'conservative_auto_link',
    'weak_single_signal_auto_merge', false
  )
from public.organizations o
where not exists (
  select 1
  from public.identity_resolution_policies p
  where p.organization_id = o.id
);

create or replace function public.ensure_identity_resolution_policy_v1()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
begin
  insert into public.identity_resolution_policies (
    organization_id,
    auto_link_threshold,
    ambiguity_margin,
    policy_enabled,
    metadata
  )
  values (
    new.id,
    0.9800,
    0.0800,
    true,
    jsonb_build_object(
      'policy_version', 'customer360-identity-closeout-v1',
      'default_posture', 'conservative_auto_link',
      'weak_single_signal_auto_merge', false
    )
  )
  on conflict (organization_id) do nothing;

  return new;
end;
$function$;

revoke all on function public.ensure_identity_resolution_policy_v1()
  from public, anon, authenticated;

drop trigger if exists organizations_ensure_identity_resolution_policy_v1
  on public.organizations;
create trigger organizations_ensure_identity_resolution_policy_v1
after insert on public.organizations
for each row
execute function public.ensure_identity_resolution_policy_v1();

create or replace function public.protect_identity_resolution_policy_v1()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
begin
  -- Permit ON DELETE CASCADE while an organization itself is being removed,
  -- but do not let an active organization silently lose its identity policy.
  if exists (
    select 1
    from public.organizations o
    where o.id = old.organization_id
  ) then
    raise exception 'Identity resolution policy cannot be deleted for an active organization';
  end if;

  return old;
end;
$function$;

revoke all on function public.protect_identity_resolution_policy_v1()
  from public, anon, authenticated;

drop trigger if exists identity_resolution_policy_delete_guard_v1
  on public.identity_resolution_policies;
create trigger identity_resolution_policy_delete_guard_v1
before delete on public.identity_resolution_policies
for each row
execute function public.protect_identity_resolution_policy_v1();

-- -----------------------------------------------------------------------------
-- 2. Database-level tenant alignment for visitor routing state.
-- -----------------------------------------------------------------------------

do $block$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.visitor_identity_links'::regclass
      and conname = 'visitor_identity_links_org_lead_fkey_v1'
  ) then
    alter table public.visitor_identity_links
      add constraint visitor_identity_links_org_lead_fkey_v1
      foreign key (organization_id, lead_id)
      references public.leads(organization_id, id)
      on delete cascade;
  end if;
end;
$block$;

-- -----------------------------------------------------------------------------
-- 3. Atomic exact-session identity handoff.
--
-- All authoritative state changes now happen inside one PostgreSQL transaction:
-- exact session validation -> session/touchpoint attachment -> visitor routing
-- update -> Person graph refresh. Any failure rolls the whole handoff back.
-- -----------------------------------------------------------------------------

create or replace function public.attach_exact_session_identity_v1(
  p_organization_id uuid,
  p_lead_id uuid,
  p_anonymous_visitor_id text,
  p_session_key text,
  p_source_system text default 'events-identify-v1',
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_organization_id uuid := p_organization_id;
  v_visitor_id text := nullif(btrim(coalesce(p_anonymous_visitor_id, '')), '');
  v_session_key text := nullif(btrim(coalesce(p_session_key, '')), '');
  v_source_system text := coalesce(nullif(btrim(coalesce(p_source_system, '')), ''), 'events-identify-v1');
  v_session public.web_sessions%rowtype;
  v_attribution public.lead_attribution%rowtype;
  v_person_result jsonb;
  v_person_id uuid;
  v_linked_at timestamptz := now();
begin
  if v_organization_id is null or p_lead_id is null then
    raise exception 'Organization and lead are required';
  end if;

  if v_visitor_id is null or v_session_key is null then
    raise exception 'Anonymous visitor ID and exact session key are required';
  end if;

  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'Identity metadata must be a JSON object';
  end if;

  if not exists (
    select 1
    from public.leads l
    where l.organization_id = v_organization_id
      and l.id = p_lead_id
  ) then
    raise exception 'Lead was not found in the expected organization';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'exact-session-identity:' || v_organization_id::text || ':' || v_session_key,
      0
    )
  );

  select ws.*
  into v_session
  from public.web_sessions ws
  where ws.organization_id = v_organization_id
    and ws.session_key = v_session_key
    and ws.anonymous_visitor_id = v_visitor_id
  order by ws.started_at desc
  limit 1
  for update;

  if v_session.id is null then
    raise exception 'Matching exact session was not found for this organization and visitor';
  end if;

  select *
  into v_attribution
  from public.attach_visitor_journey_to_lead(
    p_lead_id,
    v_visitor_id,
    v_session_key
  );

  insert into public.visitor_identity_links (
    organization_id,
    anonymous_visitor_id,
    lead_id,
    last_session_key,
    source_system,
    linked_at,
    metadata
  )
  values (
    v_organization_id,
    v_visitor_id,
    p_lead_id,
    v_session_key,
    v_source_system,
    v_linked_at,
    jsonb_build_object(
      'identity_scope', 'exact_session',
      'atomic_handoff_version', 'v1'
    ) || coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (organization_id, anonymous_visitor_id)
  do update set
    lead_id = excluded.lead_id,
    last_session_key = excluded.last_session_key,
    source_system = excluded.source_system,
    linked_at = excluded.linked_at,
    updated_at = now(),
    metadata = coalesce(public.visitor_identity_links.metadata, '{}'::jsonb)
      || excluded.metadata;

  v_person_result := public.resolve_person_for_lead(
    p_lead_id,
    v_source_system
  );

  select pl.person_id
  into v_person_id
  from public.person_leads pl
  where pl.organization_id = v_organization_id
    and pl.lead_id = p_lead_id
  limit 1;

  if v_person_id is null then
    raise exception 'Person graph was not resolved for the identified lead';
  end if;

  if not exists (
    select 1
    from public.person_sessions ps
    where ps.organization_id = v_organization_id
      and ps.person_id = v_person_id
      and ps.web_session_id = v_session.id
  ) then
    raise exception 'Exact session was not reconciled into the resolved Person graph';
  end if;

  return jsonb_build_object(
    'ok', true,
    'organization_id', v_organization_id,
    'lead_id', p_lead_id,
    'person_id', v_person_id,
    'anonymous_visitor_id', v_visitor_id,
    'session_key', v_session_key,
    'web_session_id', v_session.id,
    'linked_at', v_linked_at,
    'attribution', to_jsonb(v_attribution),
    'person_resolution', v_person_result,
    'identity_scope', 'exact_session',
    'atomic', true
  );
end;
$function$;

revoke all on function public.attach_exact_session_identity_v1(
  uuid, uuid, text, text, text, jsonb
) from public, anon, authenticated;

grant execute on function public.attach_exact_session_identity_v1(
  uuid, uuid, text, text, text, jsonb
) to service_role;

-- -----------------------------------------------------------------------------
-- 4. Customer 360 / identity integrity health.
--
-- Historical reuse of one browser visitor ID by different people is NOT an
-- integrity error. Only the current visitor routing row must match its exact
-- last_session_key. Permanent identity lives in Person/identifier/session links.
-- -----------------------------------------------------------------------------

create or replace view public.v_customer360_identity_integrity_health_v1
with (security_invoker = true)
as
select
  m.*,
  (
    m.leads_not_exactly_one_person
    + m.orphan_persons
    + m.person_lead_tenant_mismatches
    + m.identifier_tenant_mismatches
    + m.identifiers_shared_across_persons
    + m.person_session_tenant_mismatches
    + m.lead_sessions_missing_person_session
    + m.person_session_wrong_lead_person
    + m.visitor_link_tenant_mismatches
    + m.visitor_current_session_mismatches
    + m.open_identity_conflicts
    + m.missing_identity_policy
    + m.persons_missing_person360
    + m.persons_missing_operational360
    + m.persons_missing_complete_journey
    + m.leads_missing_journey_intelligence
    + m.journey_person_tenant_mismatches
    + m.duplicate_canonical_journey_keys
  )::bigint as integrity_issue_count,
  case
    when (
      m.leads_not_exactly_one_person
      + m.orphan_persons
      + m.person_lead_tenant_mismatches
      + m.identifier_tenant_mismatches
      + m.identifiers_shared_across_persons
      + m.person_session_tenant_mismatches
      + m.lead_sessions_missing_person_session
      + m.person_session_wrong_lead_person
      + m.visitor_link_tenant_mismatches
      + m.visitor_current_session_mismatches
      + m.open_identity_conflicts
      + m.missing_identity_policy
      + m.persons_missing_person360
      + m.persons_missing_operational360
      + m.persons_missing_complete_journey
      + m.leads_missing_journey_intelligence
      + m.journey_person_tenant_mismatches
      + m.duplicate_canonical_journey_keys
    ) = 0 then 'healthy'
    else 'degraded'
  end as health_status
from (
  select
    o.id as organization_id,
    o.name as organization_name,
    (select count(*) from public.leads l where l.organization_id=o.id)::bigint as lead_count,
    (select count(*) from public.persons p where p.organization_id=o.id)::bigint as person_count,
    (select count(*) from public.person_identifiers pi where pi.organization_id=o.id)::bigint as identifier_count,
    (select count(*) from public.person_sessions ps where ps.organization_id=o.id)::bigint as person_session_count,
    (select count(*) from public.visitor_identity_links vil where vil.organization_id=o.id)::bigint as visitor_routing_count,

    (select count(*) from (
      select l.id
      from public.leads l
      left join public.person_leads pl
        on pl.organization_id=l.organization_id and pl.lead_id=l.id
      where l.organization_id=o.id
      group by l.id
      having count(pl.id) <> 1
    ) x)::bigint as leads_not_exactly_one_person,

    (select count(*)
     from public.persons p
     where p.organization_id=o.id
       and not exists (
         select 1 from public.person_leads pl
         where pl.organization_id=p.organization_id and pl.person_id=p.id
       ))::bigint as orphan_persons,

    (select count(*)
     from public.person_leads pl
     join public.leads l on l.id=pl.lead_id
     join public.persons p on p.id=pl.person_id
     where pl.organization_id=o.id
       and (l.organization_id<>pl.organization_id or p.organization_id<>pl.organization_id))::bigint
      as person_lead_tenant_mismatches,

    (select count(*)
     from public.person_identifiers pi
     join public.persons p on p.id=pi.person_id
     where pi.organization_id=o.id and p.organization_id<>pi.organization_id)::bigint
      as identifier_tenant_mismatches,

    (select count(*) from (
      select pi.identifier_type,pi.normalized_value
      from public.person_identifiers pi
      where pi.organization_id=o.id
      group by pi.identifier_type,pi.normalized_value
      having count(distinct pi.person_id)>1
    ) x)::bigint as identifiers_shared_across_persons,

    (select count(*)
     from public.person_sessions ps
     join public.persons p on p.id=ps.person_id
     join public.web_sessions ws on ws.id=ps.web_session_id
     where ps.organization_id=o.id
       and (p.organization_id<>ps.organization_id or ws.organization_id<>ps.organization_id))::bigint
      as person_session_tenant_mismatches,

    (select count(*)
     from public.web_sessions ws
     where ws.organization_id=o.id
       and ws.lead_id is not null
       and not exists (
         select 1
         from public.person_leads pl
         join public.person_sessions ps
           on ps.organization_id=pl.organization_id and ps.person_id=pl.person_id
         where pl.organization_id=ws.organization_id
           and pl.lead_id=ws.lead_id
           and ps.web_session_id=ws.id
       ))::bigint as lead_sessions_missing_person_session,

    (select count(*)
     from public.person_sessions ps
     join public.web_sessions ws on ws.id=ps.web_session_id
     where ps.organization_id=o.id
       and ws.lead_id is not null
       and not exists (
         select 1 from public.person_leads pl
         where pl.organization_id=ps.organization_id
           and pl.person_id=ps.person_id
           and pl.lead_id=ws.lead_id
       ))::bigint as person_session_wrong_lead_person,

    (select count(*)
     from public.visitor_identity_links vil
     join public.leads l on l.id=vil.lead_id
     where vil.organization_id=o.id and l.organization_id<>vil.organization_id)::bigint
      as visitor_link_tenant_mismatches,

    (select count(*)
     from public.visitor_identity_links vil
     where vil.organization_id=o.id
       and vil.last_session_key is not null
       and not exists (
         select 1
         from public.web_sessions ws
         where ws.organization_id=vil.organization_id
           and ws.session_key=vil.last_session_key
           and ws.anonymous_visitor_id=vil.anonymous_visitor_id
           and ws.lead_id=vil.lead_id
       ))::bigint as visitor_current_session_mismatches,

    (select count(*)
     from public.identity_resolution_conflicts c
     where c.organization_id=o.id and c.status='open')::bigint as open_identity_conflicts,

    (case when exists (
      select 1 from public.identity_resolution_policies p where p.organization_id=o.id
    ) then 0 else 1 end)::bigint as missing_identity_policy,

    (select count(*)
     from public.persons p
     where p.organization_id=o.id
       and not exists (
         select 1 from public.v_person_360 v
         where v.organization_id=p.organization_id and v.person_id=p.id
       ))::bigint as persons_missing_person360,

    (select count(*)
     from public.persons p
     where p.organization_id=o.id
       and not exists (
         select 1 from public.v_person_360_operational v
         where v.organization_id=p.organization_id and v.person_id=p.id
       ))::bigint as persons_missing_operational360,

    (select count(*)
     from public.persons p
     where p.organization_id=o.id
       and not exists (
         select 1 from public.v_person_journey_complete v
         where v.organization_id=p.organization_id and v.person_id=p.id
       ))::bigint as persons_missing_complete_journey,

    (select count(*)
     from public.leads l
     where l.organization_id=o.id
       and not exists (
         select 1 from public.v_lead_journey_intelligence v
         where v.organization_id=l.organization_id and v.lead_id=l.id
       ))::bigint as leads_missing_journey_intelligence,

    (select count(*)
     from public.v_person_journey_complete v
     join public.persons p on p.id=v.person_id
     where v.organization_id=o.id and p.organization_id<>v.organization_id)::bigint
      as journey_person_tenant_mismatches,

    (select count(*) from (
      select v.person_id,v.journey_event_key
      from public.v_person_journey_canonical v
      where v.organization_id=o.id
      group by v.person_id,v.journey_event_key
      having count(*)>1
    ) x)::bigint as duplicate_canonical_journey_keys

  from public.organizations o
) m;

comment on view public.v_customer360_identity_integrity_health_v1 is
  'Tenant-scoped Customer 360 / Person identity integrity health. Shared historical browser IDs are allowed; only exact current-session routing is authoritative.';

grant select on public.v_customer360_identity_integrity_health_v1
  to authenticated, service_role;

commit;
