begin;

-- =============================================================================
-- 008_identity_resolution.sql
--
-- Canonical Person / identity-resolution layer captured from production.
--
-- Identity rules:
-- - deterministic email / telephone identifiers may resolve a Person;
-- - anonymous browser IDs are NOT Person identity;
-- - exact web_session linkage is the attribution boundary;
-- - conflicts never silently merge Persons;
-- - inbound WhatsApp contact changes refresh canonical Person identity
--   in the same database transaction.
-- =============================================================================


-- =============================================================================
-- 1. CANONICAL PERSON TABLES
-- =============================================================================

create table if not exists public.persons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint persons_status_check
    check (status in ('active', 'merged', 'suppressed'))
);

create unique index if not exists uq_persons_org_id
  on public.persons(organization_id, id);

create index if not exists idx_persons_org_status
  on public.persons(organization_id, status);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.persons'::regclass
      and conname = 'persons_organization_fkey'
  ) then
    alter table public.persons
      add constraint persons_organization_fkey
      foreign key (organization_id)
      references public.organizations(id)
      on delete restrict;
  end if;
end
$$;


create table if not exists public.person_identifiers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  person_id uuid not null,
  identifier_type text not null,
  normalized_value text not null,
  verified boolean not null default false,
  source_system text not null default 'crm',
  confidence numeric not null default 1.0000,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint person_identifiers_type_check
    check (nullif(btrim(identifier_type), '') is not null),
  constraint person_identifiers_value_check
    check (nullif(btrim(normalized_value), '') is not null),
  constraint person_identifiers_confidence_check
    check (confidence >= 0 and confidence <= 1),
  constraint person_identifiers_seen_check
    check (last_seen_at >= first_seen_at)
);

create unique index if not exists uq_person_identifier_org_value
  on public.person_identifiers(
    organization_id,
    identifier_type,
    normalized_value
  );

create index if not exists idx_person_identifiers_person
  on public.person_identifiers(organization_id, person_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.person_identifiers'::regclass
      and conname = 'person_identifiers_person_fkey'
  ) then
    alter table public.person_identifiers
      add constraint person_identifiers_person_fkey
      foreign key (organization_id, person_id)
      references public.persons(organization_id, id)
      on delete restrict;
  end if;
end
$$;


create table if not exists public.person_leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  person_id uuid not null,
  lead_id uuid not null,
  resolution_method text not null,
  confidence numeric not null default 1.0000,
  evidence jsonb not null default '{}'::jsonb,
  linked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint person_leads_resolution_check
    check (nullif(btrim(resolution_method), '') is not null),
  constraint person_leads_confidence_check
    check (confidence >= 0 and confidence <= 1)
);

create unique index if not exists uq_person_leads_org_lead
  on public.person_leads(organization_id, lead_id);

create index if not exists idx_person_leads_person
  on public.person_leads(organization_id, person_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.person_leads'::regclass
      and conname = 'person_leads_person_fkey'
  ) then
    alter table public.person_leads
      add constraint person_leads_person_fkey
      foreign key (organization_id, person_id)
      references public.persons(organization_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.person_leads'::regclass
      and conname = 'person_leads_lead_fkey'
  ) then
    alter table public.person_leads
      add constraint person_leads_lead_fkey
      foreign key (organization_id, lead_id)
      references public.leads(organization_id, id)
      on delete restrict;
  end if;
end
$$;


create table if not exists public.person_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  person_id uuid not null,
  web_session_id uuid not null,
  resolution_method text not null,
  confidence numeric not null default 1.0000,
  evidence jsonb not null default '{}'::jsonb,
  linked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint person_sessions_resolution_check
    check (nullif(btrim(resolution_method), '') is not null),
  constraint person_sessions_confidence_check
    check (confidence >= 0 and confidence <= 1)
);

create unique index if not exists uq_person_sessions_org_session
  on public.person_sessions(organization_id, web_session_id);

create index if not exists idx_person_sessions_person
  on public.person_sessions(organization_id, person_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.person_sessions'::regclass
      and conname = 'person_sessions_person_fkey'
  ) then
    alter table public.person_sessions
      add constraint person_sessions_person_fkey
      foreign key (organization_id, person_id)
      references public.persons(organization_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.person_sessions'::regclass
      and conname = 'person_sessions_session_fkey'
  ) then
    alter table public.person_sessions
      add constraint person_sessions_session_fkey
      foreign key (organization_id, web_session_id)
      references public.web_sessions(organization_id, id)
      on delete restrict;
  end if;
end
$$;


create table if not exists public.identity_resolution_conflicts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  lead_id uuid not null,
  person_id uuid,
  conflict_type text not null,
  candidate_person_ids uuid[] not null default array[]::uuid[],
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'open',
  resolution_action text,
  resolved_person_id uuid,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint identity_resolution_conflicts_type_check
    check (nullif(btrim(conflict_type), '') is not null),
  constraint identity_resolution_conflicts_status_check
    check (status in ('open', 'resolved', 'dismissed'))
);

create index if not exists idx_identity_conflicts_lead
  on public.identity_resolution_conflicts(
    organization_id,
    lead_id,
    detected_at desc
  );

create index if not exists idx_identity_conflicts_org_status
  on public.identity_resolution_conflicts(
    organization_id,
    status,
    detected_at desc
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.identity_resolution_conflicts'::regclass
      and conname = 'identity_resolution_conflicts_org_fkey'
  ) then
    alter table public.identity_resolution_conflicts
      add constraint identity_resolution_conflicts_org_fkey
      foreign key (organization_id)
      references public.organizations(id)
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.identity_resolution_conflicts'::regclass
      and conname = 'identity_resolution_conflicts_lead_fkey'
  ) then
    alter table public.identity_resolution_conflicts
      add constraint identity_resolution_conflicts_lead_fkey
      foreign key (organization_id, lead_id)
      references public.leads(organization_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.identity_resolution_conflicts'::regclass
      and conname = 'identity_resolution_conflicts_person_fkey'
  ) then
    alter table public.identity_resolution_conflicts
      add constraint identity_resolution_conflicts_person_fkey
      foreign key (organization_id, person_id)
      references public.persons(organization_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.identity_resolution_conflicts'::regclass
      and conname = 'identity_resolution_conflicts_resolved_person_fkey'
  ) then
    alter table public.identity_resolution_conflicts
      add constraint identity_resolution_conflicts_resolved_person_fkey
      foreign key (organization_id, resolved_person_id)
      references public.persons(organization_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.identity_resolution_conflicts'::regclass
      and conname = 'identity_resolution_conflicts_resolved_by_fkey'
  ) then
    alter table public.identity_resolution_conflicts
      add constraint identity_resolution_conflicts_resolved_by_fkey
      foreign key (resolved_by)
      references public.profiles(id)
      on delete set null;
  end if;
end
$$;


-- Updated-at triggers.
drop trigger if exists persons_set_updated_at
  on public.persons;
create trigger persons_set_updated_at
before update on public.persons
for each row execute function public.set_updated_at();

drop trigger if exists person_identifiers_set_updated_at
  on public.person_identifiers;
create trigger person_identifiers_set_updated_at
before update on public.person_identifiers
for each row execute function public.set_updated_at();

drop trigger if exists person_leads_set_updated_at
  on public.person_leads;
create trigger person_leads_set_updated_at
before update on public.person_leads
for each row execute function public.set_updated_at();

drop trigger if exists person_sessions_set_updated_at
  on public.person_sessions;
create trigger person_sessions_set_updated_at
before update on public.person_sessions
for each row execute function public.set_updated_at();

drop trigger if exists identity_resolution_conflicts_set_updated_at
  on public.identity_resolution_conflicts;
create trigger identity_resolution_conflicts_set_updated_at
before update on public.identity_resolution_conflicts
for each row execute function public.set_updated_at();


-- =============================================================================
-- 2. ORGANIZATION-SCOPED CRM AUTHORIZATION HELPERS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.has_organization_role(p_organization_id uuid, p_roles text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
  select
    auth.role() = 'service_role'
    or exists (
      select 1
      from public.organization_members om
      where om.organization_id = p_organization_id
        and om.user_id = auth.uid()
        and om.active = true
        and om.role = any(p_roles)
    );
$function$;

CREATE OR REPLACE FUNCTION public.is_organization_admin(p_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
  select public.has_organization_role(
    p_organization_id,
    array['admin']::text[]
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_administer_organization_crm(p_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
  select public.has_organization_role(
    p_organization_id,
    array[
      'admin',
      'manager'
    ]::text[]
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_write_organization_crm(p_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
  select public.has_organization_role(
    p_organization_id,
    array[
      'admin',
      'manager',
      'admissions'
    ]::text[]
  );
$function$;

revoke all on function public.has_organization_role(uuid, text[])
  from public, anon;
revoke all on function public.is_organization_admin(uuid)
  from public, anon;
revoke all on function public.can_administer_organization_crm(uuid)
  from public, anon;
revoke all on function public.can_write_organization_crm(uuid)
  from public, anon;

grant execute on function public.has_organization_role(uuid, text[])
  to authenticated, service_role;
grant execute on function public.is_organization_admin(uuid)
  to authenticated, service_role;
grant execute on function public.can_administer_organization_crm(uuid)
  to authenticated, service_role;
grant execute on function public.can_write_organization_crm(uuid)
  to authenticated, service_role;


-- =============================================================================
-- 3. CANONICAL PERSON RESOLVER
-- =============================================================================

CREATE OR REPLACE FUNCTION public.resolve_person_for_lead(p_lead_id uuid, p_source_system text DEFAULT 'crm'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_lead public.leads%rowtype;

  v_person_id uuid;
  v_existing_person_id uuid;

  v_candidate_person_ids uuid[];

  v_candidate_count integer := 0;

  v_person_created boolean := false;

  v_resolution_method text;

  v_conflict_id uuid;

  v_conflict_count integer := 0;

  v_sessions_linked integer := 0;

  v_contact record;

  v_identifier_owner uuid;

begin

  -- =======================================================
  -- REQUIRE LEAD
  -- =======================================================

  if p_lead_id is null then
    raise exception
      'Lead ID is required';
  end if;


  select *
  into v_lead
  from public.leads l
  where l.id = p_lead_id
  for update;


  if not found then
    raise exception
      'Lead not found';
  end if;


  if v_lead.organization_id is null then
    raise exception
      'Lead organization is missing';
  end if;


  -- =======================================================
  -- SERIALIZE RESOLUTION FOR THIS LEAD
  -- =======================================================

  perform pg_advisory_xact_lock(
    hashtext(
      'person-resolution:'
      ||
      v_lead.organization_id::text
      ||
      ':'
      ||
      v_lead.id::text
    )
  );


  -- =======================================================
  -- EXISTING LEAD -> PERSON LINK
  -- =======================================================

  select
    pl.person_id
  into
    v_existing_person_id
  from public.person_leads pl
  where pl.organization_id =
        v_lead.organization_id
    and pl.lead_id =
        v_lead.id
  limit 1;


  if v_existing_person_id is not null then

    v_person_id :=
      v_existing_person_id;

    v_resolution_method :=
      'existing_person_link';

  else

    -- =====================================================
    -- LOCK DETERMINISTIC IDENTIFIERS
    --
    -- Fixed ordering prevents inconsistent concurrent
    -- resolutions for the same email/phone.
    -- =====================================================

    for v_contact in

      select
        lc.contact_type::text as identifier_type,
        lc.normalized_value

      from public.lead_contacts lc

      where lc.organization_id =
            v_lead.organization_id

        and lc.lead_id =
            v_lead.id

        and lc.contact_type::text in (
          'email',
          'phone',
          'whatsapp'
        )

        and nullif(
          btrim(lc.normalized_value),
          ''
        ) is not null

      order by
        lc.contact_type::text,
        lc.normalized_value

    loop

      perform pg_advisory_xact_lock(
        hashtext(
          'person-identifier:'
          ||
          v_lead.organization_id::text
          ||
          ':'
          ||
          v_contact.identifier_type
          ||
          ':'
          ||
          v_contact.normalized_value
        )
      );

    end loop;


    -- =====================================================
    -- DETERMINE CANDIDATE PERSONS
    --
    -- Phone and WhatsApp are treated as the same telephone
    -- identity family for matching.
    -- =====================================================

    select
      array_agg(
        distinct pi.person_id
        order by pi.person_id
      )

    into
      v_candidate_person_ids

    from public.person_identifiers pi

    where pi.organization_id =
          v_lead.organization_id

      and exists (

        select 1

        from public.lead_contacts lc

        where lc.organization_id =
              v_lead.organization_id

          and lc.lead_id =
              v_lead.id

          and (

            (
              lc.contact_type::text = 'email'

              and pi.identifier_type = 'email'

              and pi.normalized_value =
                  lc.normalized_value
            )

            or

            (
              lc.contact_type::text in (
                'phone',
                'whatsapp'
              )

              and pi.identifier_type in (
                'phone',
                'whatsapp'
              )

              and pi.normalized_value =
                  lc.normalized_value
            )

          )
      );


    v_candidate_count :=
      coalesce(
        array_length(
          v_candidate_person_ids,
          1
        ),
        0
      );


    -- =====================================================
    -- EXACTLY ONE DETERMINISTIC PERSON
    -- =====================================================

    if v_candidate_count = 1 then

      v_person_id :=
        v_candidate_person_ids[1];

      v_resolution_method :=
        'deterministic_contact_match';


    -- =====================================================
    -- NO MATCH
    -- =====================================================

    elsif v_candidate_count = 0 then

      insert into public.persons (
        organization_id,
        status,
        metadata
      )
      values (
        v_lead.organization_id,

        'active',

        jsonb_build_object(
          'created_by',
          'identity_resolution',
          'source_system',
          coalesce(
            nullif(
              btrim(p_source_system),
              ''
            ),
            'crm'
          ),
          'lead_id',
          v_lead.id
        )
      )

      returning id
      into v_person_id;


      v_person_created :=
        true;

      v_resolution_method :=
        'new_person';


    -- =====================================================
    -- CONFLICTING DETERMINISTIC IDENTITIES
    --
    -- We deliberately create a new isolated Person rather
    -- than merging multiple candidate Persons.
    -- =====================================================

    else

      insert into public.persons (
        organization_id,
        status,
        metadata
      )
      values (
        v_lead.organization_id,

        'active',

        jsonb_build_object(
          'created_by',
          'identity_resolution_conflict',
          'source_system',
          coalesce(
            nullif(
              btrim(p_source_system),
              ''
            ),
            'crm'
          ),
          'lead_id',
          v_lead.id
        )
      )

      returning id
      into v_person_id;


      v_person_created :=
        true;

      v_resolution_method :=
        'identity_conflict_isolated_person';


      insert into public.identity_resolution_conflicts (
        organization_id,
        lead_id,
        person_id,
        conflict_type,
        candidate_person_ids,
        evidence,
        status,
        metadata
      )
      values (
        v_lead.organization_id,

        v_lead.id,

        v_person_id,

        'deterministic_identifiers_disagree',

        v_candidate_person_ids,

        jsonb_build_object(
          'candidate_person_ids',
          v_candidate_person_ids,
          'source_system',
          p_source_system
        ),

        'open',

        jsonb_build_object(
          'resolution_version',
          'identity-v1'
        )
      )

      returning id
      into v_conflict_id;


      v_conflict_count :=
        v_conflict_count + 1;

    end if;


    -- =====================================================
    -- LINK LEAD -> PERSON
    -- =====================================================

    insert into public.person_leads (
      organization_id,
      person_id,
      lead_id,
      resolution_method,
      confidence,
      evidence
    )
    values (
      v_lead.organization_id,

      v_person_id,

      v_lead.id,

      v_resolution_method,

      case
        when v_resolution_method =
             'deterministic_contact_match'
          then 0.9500

        when v_resolution_method =
             'identity_conflict_isolated_person'
          then 1.0000

        else 1.0000
      end,

      jsonb_build_object(
        'source_system',
        coalesce(
          nullif(
            btrim(p_source_system),
            ''
          ),
          'crm'
        ),
        'resolution_version',
        'identity-v1'
      )
    );

  end if;


  -- =======================================================
  -- SYNCHRONIZE PERSON IDENTIFIERS
  -- =======================================================

  for v_contact in

    select
      lc.id,
      lc.contact_type::text as identifier_type,
      lc.normalized_value,
      lc.verified,
      lc.created_at

    from public.lead_contacts lc

    where lc.organization_id =
          v_lead.organization_id

      and lc.lead_id =
          v_lead.id

      and lc.contact_type::text in (
        'email',
        'phone',
        'whatsapp'
      )

      and nullif(
        btrim(lc.normalized_value),
        ''
      ) is not null

    order by
      lc.contact_type::text,
      lc.normalized_value

  loop

    -- -----------------------------------------------------
    -- Match telephone identifiers across phone/WhatsApp.
    -- -----------------------------------------------------

    select
      pi.person_id
    into
      v_identifier_owner

    from public.person_identifiers pi

    where pi.organization_id =
          v_lead.organization_id

      and (

        (
          v_contact.identifier_type = 'email'

          and pi.identifier_type = 'email'

          and pi.normalized_value =
              v_contact.normalized_value
        )

        or

        (
          v_contact.identifier_type in (
            'phone',
            'whatsapp'
          )

          and pi.identifier_type in (
            'phone',
            'whatsapp'
          )

          and pi.normalized_value =
              v_contact.normalized_value
        )

      )

    limit 1;


    -- -----------------------------------------------------
    -- Identifier is unclaimed: attach to target Person.
    -- -----------------------------------------------------

    if v_identifier_owner is null then

      insert into public.person_identifiers (
        organization_id,
        person_id,
        identifier_type,
        normalized_value,
        verified,
        source_system,
        confidence,
        first_seen_at,
        last_seen_at,
        metadata
      )
      values (
        v_lead.organization_id,

        v_person_id,

        v_contact.identifier_type,

        v_contact.normalized_value,

        v_contact.verified,

        coalesce(
          nullif(
            btrim(p_source_system),
            ''
          ),
          'crm'
        ),

        case
          when v_contact.verified
            then 1.0000
          else 0.9500
        end,

        v_contact.created_at,

        now(),

        jsonb_build_object(
          'lead_contact_id',
          v_contact.id,
          'lead_id',
          v_lead.id
        )
      );


    -- -----------------------------------------------------
    -- Identifier already belongs to this Person.
    -- Refresh metadata/verification.
    -- -----------------------------------------------------

    elsif v_identifier_owner =
          v_person_id then

      update public.person_identifiers

      set
        verified =
          verified
          or v_contact.verified,

        last_seen_at =
          greatest(
            last_seen_at,
            now()
          ),

        metadata =
          metadata
          ||
          jsonb_build_object(
            'latest_lead_contact_id',
            v_contact.id,
            'latest_lead_id',
            v_lead.id
          )

      where organization_id =
            v_lead.organization_id

        and person_id =
            v_person_id

        and (

          (
            v_contact.identifier_type = 'email'

            and identifier_type = 'email'

            and normalized_value =
                v_contact.normalized_value
          )

          or

          (
            v_contact.identifier_type in (
              'phone',
              'whatsapp'
            )

            and identifier_type in (
              'phone',
              'whatsapp'
            )

            and normalized_value =
                v_contact.normalized_value
          )

        );


    -- -----------------------------------------------------
    -- Identifier belongs to another Person.
    -- Do NOT steal or merge it.
    -- -----------------------------------------------------

    else

      if not exists (

        select 1

        from public.identity_resolution_conflicts irc

        where irc.organization_id =
              v_lead.organization_id

          and irc.lead_id =
              v_lead.id

          and irc.status =
              'open'

          and irc.conflict_type =
              'identifier_owned_by_other_person'

          and irc.evidence ->>
              'identifier_type' =
              v_contact.identifier_type

          and irc.evidence ->>
              'normalized_value' =
              v_contact.normalized_value

      ) then

        insert into public.identity_resolution_conflicts (
          organization_id,
          lead_id,
          person_id,
          conflict_type,
          candidate_person_ids,
          evidence,
          status,
          metadata
        )
        values (
          v_lead.organization_id,

          v_lead.id,

          v_person_id,

          'identifier_owned_by_other_person',

          array[
            v_identifier_owner
          ]::uuid[],

          jsonb_build_object(
            'identifier_type',
            v_contact.identifier_type,
            'normalized_value',
            v_contact.normalized_value,
            'existing_person_id',
            v_identifier_owner,
            'source_system',
            p_source_system
          ),

          'open',

          jsonb_build_object(
            'resolution_version',
            'identity-v1'
          )
        );


        v_conflict_count :=
          v_conflict_count + 1;

      end if;

    end if;

  end loop;


  -- =======================================================
  -- SYNCHRONIZE DEFINITIVELY LINKED SESSIONS
  --
  -- web_sessions.lead_id is authoritative here.
  --
  -- We do NOT resolve anonymous sessions by browser ID.
  -- =======================================================

  insert into public.person_sessions (
    organization_id,
    person_id,
    web_session_id,
    resolution_method,
    confidence,
    evidence
  )

  select
    ws.organization_id,

    v_person_id,

    ws.id,

    'lead_session_link',

    1.0000,

    jsonb_build_object(
      'lead_id',
      v_lead.id,
      'anonymous_visitor_id',
      ws.anonymous_visitor_id,
      'session_key',
      ws.session_key,
      'source_system',
      p_source_system
    )

  from public.web_sessions ws

  where ws.organization_id =
        v_lead.organization_id

    and ws.lead_id =
        v_lead.id

  on conflict (
    organization_id,
    web_session_id
  )
  do update set

    person_id =
      excluded.person_id,

    resolution_method =
      excluded.resolution_method,

    confidence =
      excluded.confidence,

    evidence =
      public.person_sessions.evidence
      ||
      jsonb_build_object(
        'reassigned_at',
        now(),
        'latest_lead_id',
        v_lead.id
      ),

    linked_at =
      now(),

    updated_at =
      now();


  get diagnostics
    v_sessions_linked =
      row_count;


  -- =======================================================
  -- RETURN
  -- =======================================================

  return jsonb_build_object(
    'ok',
      true,

    'organization_id',
      v_lead.organization_id,

    'lead_id',
      v_lead.id,

    'person_id',
      v_person_id,

    'person_created',
      v_person_created,

    'resolution_method',
      v_resolution_method,

    'candidate_person_count',
      v_candidate_count,

    'conflict_count',
      v_conflict_count,

    'sessions_linked',
      v_sessions_linked
  );

end;
$function$;

revoke all on function public.resolve_person_for_lead(uuid, text)
  from public, anon, authenticated;
grant execute on function public.resolve_person_for_lead(uuid, text)
  to service_role;


-- =============================================================================
-- 4. TELEPHONE / WHATSAPP IDENTITY SAFETY
-- =============================================================================

CREATE OR REPLACE FUNCTION public.validate_lead_telephone_identity(p_lead_id uuid, p_normalized_value text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_organization_id uuid;
  v_person_id uuid;
  v_digits text;

  v_conflicting_lead_id uuid;
  v_conflicting_person_id uuid;
begin

  if p_lead_id is null then
    raise exception
      'Lead ID is required';
  end if;


  -- Authoritative tenant from the lead.

  select
    l.organization_id
  into
    v_organization_id

  from public.leads l

  where l.id = p_lead_id;


  if not found
     or v_organization_id is null
  then
    raise exception
      'Lead or lead organization could not be resolved';
  end if;


  -- One canonical telephone representation.

  v_digits :=
    regexp_replace(
      coalesce(
        p_normalized_value,
        ''
      ),
      '[^0-9]',
      '',
      'g'
    );


  if length(v_digits) < 8
     or length(v_digits) > 15
  then
    raise exception
      'Telephone identity must contain 8 to 15 digits';
  end if;


  -- The lead must already participate in the canonical
  -- Person graph at this stage of the production system.

  select
    pl.person_id
  into
    v_person_id

  from public.person_leads pl

  where pl.organization_id =
        v_organization_id

    and pl.lead_id =
        p_lead_id

  limit 1;


  if v_person_id is null then
    raise exception
      'Canonical Person is missing for this lead';
  end if;


  -- -------------------------------------------------------
  -- LEAD CONTACT CONFLICT
  --
  -- phone and WhatsApp are the same telephone family.
  -- -------------------------------------------------------

  select
    lc.lead_id
  into
    v_conflicting_lead_id

  from public.lead_contacts lc

  where lc.organization_id =
        v_organization_id

    and lc.lead_id <>
        p_lead_id

    and lc.contact_type::text in (
      'phone',
      'whatsapp'
    )

    and regexp_replace(
      coalesce(
        lc.normalized_value,
        ''
      ),
      '[^0-9]',
      '',
      'g'
    ) = v_digits

  limit 1;


  if v_conflicting_lead_id is not null then
    raise exception
      'This telephone identity already belongs to another CRM lead';
  end if;


  -- -------------------------------------------------------
  -- PERSON IDENTIFIER CONFLICT
  -- -------------------------------------------------------

  select
    pi.person_id
  into
    v_conflicting_person_id

  from public.person_identifiers pi

  where pi.organization_id =
        v_organization_id

    and pi.person_id <>
        v_person_id

    and pi.identifier_type in (
      'phone',
      'whatsapp'
    )

    and regexp_replace(
      coalesce(
        pi.normalized_value,
        ''
      ),
      '[^0-9]',
      '',
      'g'
    ) = v_digits

  limit 1;


  if v_conflicting_person_id is not null then
    raise exception
      'This telephone identity belongs to another canonical Person';
  end if;


  return jsonb_build_object(
    'ok',
      true,

    'organization_id',
      v_organization_id,

    'lead_id',
      p_lead_id,

    'person_id',
      v_person_id,

    'normalized_digits',
      v_digits
  );

end;
$function$;

CREATE OR REPLACE FUNCTION public.attach_lead_whatsapp_identity(p_lead_id uuid, p_value text, p_normalized_value text, p_verified boolean DEFAULT false, p_source_system text DEFAULT 'whatsapp_template'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_organization_id uuid;
  v_person_id uuid;

  v_contact_id uuid;

  v_conflicting_lead_id uuid;
  v_conflicting_person_id uuid;

  v_digits text;
  v_source_system text;

  v_resolution jsonb;
begin

  if p_lead_id is null then
    raise exception
      'Lead ID is required';
  end if;


  -- =======================================================
  -- AUTHORITATIVE LEAD / TENANT
  -- =======================================================

  select
    l.organization_id
  into
    v_organization_id

  from public.leads l

  where l.id = p_lead_id

  for update;


  if not found
     or v_organization_id is null
  then
    raise exception
      'Lead or lead organization could not be resolved';
  end if;


  -- =======================================================
  -- NORMALIZE WHATSAPP ID
  -- =======================================================

  v_digits :=
    regexp_replace(
      coalesce(
        p_normalized_value,
        ''
      ),
      '[^0-9]',
      '',
      'g'
    );


  if length(v_digits) < 8
     or length(v_digits) > 15
  then
    raise exception
      'WhatsApp identity must contain 8 to 15 digits';
  end if;


  v_source_system :=
    coalesce(
      nullif(
        btrim(p_source_system),
        ''
      ),
      'whatsapp_template'
    );


  -- =======================================================
  -- ENSURE THIS LEAD ALREADY HAS A CANONICAL PERSON
  --
  -- If not, create/resolve it inside this transaction.
  -- =======================================================

  select
    pl.person_id
  into
    v_person_id

  from public.person_leads pl

  where pl.organization_id =
        v_organization_id

    and pl.lead_id =
        p_lead_id

  limit 1;


  if v_person_id is null then

    perform public.resolve_person_for_lead(
      p_lead_id,
      v_source_system
    );


    select
      pl.person_id
    into
      v_person_id

    from public.person_leads pl

    where pl.organization_id =
          v_organization_id

      and pl.lead_id =
          p_lead_id

    limit 1;

  end if;


  if v_person_id is null then
    raise exception
      'Canonical Person could not be resolved';
  end if;


  -- =======================================================
  -- DUPLICATE LEAD SAFETY
  --
  -- phone and whatsapp belong to the same telephone family.
  -- Compare digits rather than relying on + formatting.
  -- =======================================================

  select
    lc.lead_id
  into
    v_conflicting_lead_id

  from public.lead_contacts lc

  where lc.organization_id =
        v_organization_id

    and lc.lead_id <>
        p_lead_id

    and lc.contact_type::text in (
      'phone',
      'whatsapp'
    )

    and regexp_replace(
      coalesce(
        lc.normalized_value,
        ''
      ),
      '[^0-9]',
      '',
      'g'
    ) = v_digits

  limit 1;


  if v_conflicting_lead_id is not null then
    raise exception
      'This telephone identity already belongs to another CRM lead';
  end if;


  -- =======================================================
  -- CANONICAL PERSON CONFLICT SAFETY
  -- =======================================================

  select
    pi.person_id
  into
    v_conflicting_person_id

  from public.person_identifiers pi

  where pi.organization_id =
        v_organization_id

    and pi.person_id <>
        v_person_id

    and pi.identifier_type in (
      'phone',
      'whatsapp'
    )

    and regexp_replace(
      coalesce(
        pi.normalized_value,
        ''
      ),
      '[^0-9]',
      '',
      'g'
    ) = v_digits

  limit 1;


  if v_conflicting_person_id is not null then
    raise exception
      'This telephone identity belongs to another canonical Person';
  end if;


  -- =======================================================
  -- EXISTING WHATSAPP CONTACT ON THIS LEAD
  -- =======================================================

  select
    lc.id
  into
    v_contact_id

  from public.lead_contacts lc

  where lc.organization_id =
        v_organization_id

    and lc.lead_id =
        p_lead_id

    and lc.contact_type::text =
        'whatsapp'

  order by
    lc.is_primary desc,
    lc.created_at asc

  limit 1

  for update;


  -- =======================================================
  -- CREATE OR UPDATE WHATSAPP CONTACT
  -- =======================================================

  if v_contact_id is null then

    insert into public.lead_contacts (
      organization_id,
      lead_id,
      contact_type,
      value,
      normalized_value,
      is_primary,
      verified
    )
    values (
      v_organization_id,
      p_lead_id,
      'whatsapp',
      coalesce(
        nullif(
          btrim(p_value),
          ''
        ),
        v_digits
      ),
      v_digits,
      true,
      coalesce(
        p_verified,
        false
      )
    )

    returning id
    into v_contact_id;

  else

    update public.lead_contacts
    set
      value =
        coalesce(
          nullif(
            btrim(p_value),
            ''
          ),
          value
        ),

      normalized_value =
        v_digits,

      is_primary =
        true,

      verified =
        verified
        or coalesce(
          p_verified,
          false
        )

    where id =
          v_contact_id

      and organization_id =
          v_organization_id

      and lead_id =
          p_lead_id;

  end if;


  -- =======================================================
  -- REFRESH CANONICAL PERSON IDENTIFIERS
  --
  -- Same transaction as lead_contacts write.
  -- Any failure rolls the contact write back.
  -- =======================================================

  select
    public.resolve_person_for_lead(
      p_lead_id,
      v_source_system
    )
  into
    v_resolution;


  return jsonb_build_object(
    'ok',
      true,

    'organization_id',
      v_organization_id,

    'lead_id',
      p_lead_id,

    'person_id',
      v_person_id,

    'lead_contact_id',
      v_contact_id,

    'normalized_whatsapp_id',
      v_digits,

    'person_resolution',
      v_resolution
  );

end;
$function$;

revoke all on function public.validate_lead_telephone_identity(uuid, text)
  from public, anon, authenticated;
grant execute on function public.validate_lead_telephone_identity(uuid, text)
  to service_role;

revoke all on function public.attach_lead_whatsapp_identity(uuid, text, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.attach_lead_whatsapp_identity(uuid, text, text, boolean, text)
  to service_role;


-- =============================================================================
-- 5. EXACT-SESSION VISITOR ATTRIBUTION
-- =============================================================================

CREATE OR REPLACE FUNCTION public.attach_visitor_journey_to_lead(p_lead_id uuid, p_anonymous_visitor_id text, p_session_key text DEFAULT NULL::text)
 RETURNS lead_attribution
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare

    v_result public.lead_attribution;

    v_organization_id uuid;

    v_visitor_id text :=
        nullif(
            trim(p_anonymous_visitor_id),
            ''
        );

    v_session_key text :=
        nullif(
            trim(p_session_key),
            ''
        );

    v_session_id uuid;

    v_prior_lead_ids uuid[];

    v_prior_lead_id uuid;

begin

    /* -----------------------------------------------------
       Resolve authoritative lead organization
       ----------------------------------------------------- */

    select l.organization_id
    into v_organization_id
    from public.leads l
    where l.id = p_lead_id;


    if v_organization_id is null then

        raise exception
            'Lead not found or organization missing';

    end if;


    if v_visitor_id is null then

        raise exception
            'anonymous visitor id is required';

    end if;



    /* =====================================================
       EXACT SESSION MODE

       When session_key exists, ONLY that exact current
       session belongs to this conversion/resolved lead.

       It is allowed to replace an older lead_id because the
       exact session is now authoritative.
       ===================================================== */

    if v_session_key is not null then

        select ws.id
        into v_session_id

        from public.web_sessions ws

        where ws.organization_id =
              v_organization_id

          and ws.session_key =
              v_session_key

          and ws.anonymous_visitor_id =
              v_visitor_id

        order by ws.started_at desc

        limit 1;


        if v_session_id is not null then

            /* ------------------------------------------------
               Remember previous lead owners of touchpoints.

               Their attribution must be recalculated after
               those touchpoints move to the new lead.
               ------------------------------------------------ */

            select
                array_agg(
                    distinct t.lead_id
                )

            into v_prior_lead_ids

            from public.touchpoints t

            where t.organization_id =
                  v_organization_id

              and t.web_session_id =
                  v_session_id

              and t.lead_id is not null

              and t.lead_id <>
                  p_lead_id;


            /* ------------------------------------------------
               Exact current session becomes authoritative.
               ------------------------------------------------ */

            update public.web_sessions

            set lead_id =
                p_lead_id

            where id =
                  v_session_id

              and organization_id =
                  v_organization_id;


            /* ------------------------------------------------
               All browser touchpoints from that exact session
               move with the session.

               Historical sessions are untouched.
               ------------------------------------------------ */

            update public.touchpoints

            set lead_id =
                p_lead_id

            where organization_id =
                  v_organization_id

              and web_session_id =
                  v_session_id;

        end if;



    /* =====================================================
       NO SESSION KEY

       A browser/device identifier is not a permanent human
       identity. Without an exact session key, do not attach
       any web session or touchpoint to this lead.
       ===================================================== */

    else

        null;

    end if;


    /* =====================================================
       Rebuild current lead attribution
       ===================================================== */

    select *
    into v_result

    from public.refresh_lead_attribution_internal(
        p_lead_id
    );



    /* =====================================================
       Rebuild attribution for leads that lost touchpoints
       ===================================================== */

    foreach v_prior_lead_id
        in array coalesce(
            v_prior_lead_ids,
            array[]::uuid[]
        )

    loop

        if exists (
            select 1
            from public.leads l
            where l.id =
                  v_prior_lead_id

              and l.organization_id =
                  v_organization_id
        ) then

            perform
                public.refresh_lead_attribution_internal(
                    v_prior_lead_id
                );

        end if;

    end loop;


    return v_result;

end;
$function$;

CREATE OR REPLACE FUNCTION public.link_web_sessions_from_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin

  if new.organization_id is null then
    raise exception
      'Visitor identity organization is required';
  end if;


  -- =======================================================
  -- EXACT SESSION ONLY
  --
  -- anonymous_visitor_id represents a browser/device,
  -- not a permanent human identity.
  --
  -- Therefore visitor_identity_links may only attach the
  -- exact session represented by last_session_key.
  -- Historical sessions from the same browser are untouched.
  -- =======================================================

  if nullif(
    btrim(new.last_session_key),
    ''
  ) is null then

    return new;

  end if;


  update public.web_sessions
  set
    lead_id = new.lead_id

  where organization_id =
        new.organization_id

    and anonymous_visitor_id =
        new.anonymous_visitor_id

    and session_key =
        new.last_session_key

    and (
      lead_id is null
      or lead_id = new.lead_id
    );


  return new;

end;
$function$;

revoke all on function public.attach_visitor_journey_to_lead(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.attach_visitor_journey_to_lead(uuid, text, text)
  to service_role;

revoke all on function public.link_web_sessions_from_identity()
  from public, anon, authenticated;
grant execute on function public.link_web_sessions_from_identity()
  to service_role;


drop trigger if exists trg_link_web_sessions_from_identity
  on public.visitor_identity_links;

create trigger trg_link_web_sessions_from_identity
after insert or update of lead_id, anonymous_visitor_id, organization_id
on public.visitor_identity_links
for each row
execute function public.link_web_sessions_from_identity();


-- =============================================================================
-- 6. CRM LEAD WRITERS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_crm_lead(p_organization_id uuid, p_first_name text, p_last_name text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_course_id uuid DEFAULT NULL::uuid, p_preferred_batch_id uuid DEFAULT NULL::uuid, p_preferred_location text DEFAULT NULL::text, p_preferred_month date DEFAULT NULL::date, p_preferred_mode text DEFAULT NULL::text, p_country text DEFAULT NULL::text, p_timezone text DEFAULT NULL::text, p_lead_creation_channel contact_channel DEFAULT 'website'::contact_channel, p_current_contact_channel contact_channel DEFAULT 'website'::contact_channel, p_first_touch_source text DEFAULT NULL::text, p_first_touch_medium text DEFAULT NULL::text, p_first_touch_campaign text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS leads
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_lead public.leads;
  v_touchpoint_id uuid;

  v_batch_course_id uuid;
  v_course_id uuid := p_course_id;

begin

  -- =======================================================
  -- REQUIRE TENANT
  -- =======================================================

  if p_organization_id is null then
    raise exception
      'Organization is required to create CRM leads';
  end if;


  -- =======================================================
  -- TENANT-SCOPED AUTHORIZATION
  -- =======================================================

  if auth.role() <> 'service_role' then

    if auth.uid() is null then
      raise exception
        'Not authenticated';
    end if;

    if not public.can_administer_organization_crm(
      p_organization_id
    ) then
      raise exception
        'Not authorized to create CRM leads for this organization';
    end if;

  end if;


  -- =======================================================
  -- VALIDATE BATCH
  -- =======================================================

  if p_preferred_batch_id is not null then

    select
      cb.course_id
    into
      v_batch_course_id

    from public.course_batches cb

    where cb.id =
          p_preferred_batch_id

      and cb.organization_id =
          p_organization_id

      and cb.active = true;


    if v_batch_course_id is null then
      raise exception
        'Selected batch does not exist, is inactive, or belongs to another organization';
    end if;


    if v_course_id is null then

      v_course_id :=
        v_batch_course_id;

    elsif v_course_id <>
          v_batch_course_id then

      raise exception
        'Selected batch does not belong to the selected course';

    end if;

  end if;


  -- =======================================================
  -- VALIDATE COURSE
  -- =======================================================

  if v_course_id is not null
     and not exists (
       select 1
       from public.courses c
       where c.id =
             v_course_id
         and c.organization_id =
             p_organization_id
     )
  then
    raise exception
      'Selected course does not belong to this organization';
  end if;


  -- =======================================================
  -- CREATE LEAD
  -- =======================================================

  insert into public.leads (
    organization_id,
    first_name,
    last_name,
    display_name,
    interested_course_id,
    preferred_batch_id,
    preferred_location,
    preferred_month,
    preferred_mode,
    country,
    timezone,
    lead_creation_channel,
    current_contact_channel,
    owner_user_id,
    notes
  )
  values (
    p_organization_id,

    nullif(trim(p_first_name), ''),

    nullif(trim(p_last_name), ''),

    nullif(
      trim(
        concat_ws(
          ' ',
          p_first_name,
          p_last_name
        )
      ),
      ''
    ),

    v_course_id,

    p_preferred_batch_id,

    nullif(
      trim(p_preferred_location),
      ''
    ),

    p_preferred_month,

    nullif(
      trim(p_preferred_mode),
      ''
    ),

    nullif(
      trim(p_country),
      ''
    ),

    nullif(
      trim(p_timezone),
      ''
    ),

    p_lead_creation_channel,

    p_current_contact_channel,

    case
      when auth.role() = 'service_role'
        then null
      else auth.uid()
    end,

    nullif(
      trim(p_notes),
      ''
    )
  )

  returning *
  into v_lead;


  -- =======================================================
  -- CONTACTS
  -- =======================================================

  if nullif(
    trim(p_email),
    ''
  ) is not null then

    insert into public.lead_contacts (
      organization_id,
      lead_id,
      contact_type,
      value,
      normalized_value,
      is_primary
    )
    values (
      p_organization_id,
      v_lead.id,
      'email',
      trim(p_email),
      lower(trim(p_email)),
      true
    );

  end if;


  if nullif(
    trim(p_phone),
    ''
  ) is not null then

    insert into public.lead_contacts (
      organization_id,
      lead_id,
      contact_type,
      value,
      normalized_value,
      is_primary
    )
    values (
      p_organization_id,
      v_lead.id,
      'phone',
      trim(p_phone),

      regexp_replace(
        p_phone,
        '[^0-9+]',
        '',
        'g'
      ),

      nullif(
        trim(p_email),
        ''
      ) is null
    );

  end if;


  -- =======================================================
  -- CANONICAL PERSON RESOLUTION
  --
  -- Runs in the SAME transaction as lead creation.
  -- Failure here rolls back the entire lead creation.
  -- =======================================================

  perform public.resolve_person_for_lead(
    v_lead.id,
    'crm_manual'
  );


  -- =======================================================
  -- ATTRIBUTION
  -- =======================================================

  if
    p_first_touch_source is not null
    or p_first_touch_campaign is not null
  then

    insert into public.touchpoints (
      organization_id,
      lead_id,
      occurred_at,
      source,
      medium,
      campaign_name,
      channel,
      event_type,
      utm_source,
      utm_medium,
      utm_campaign
    )
    values (
      p_organization_id,
      v_lead.id,
      now(),
      p_first_touch_source,
      p_first_touch_medium,
      p_first_touch_campaign,
      p_lead_creation_channel,
      'lead_created',
      p_first_touch_source,
      p_first_touch_medium,
      p_first_touch_campaign
    )

    returning id
    into v_touchpoint_id;


    insert into public.lead_attribution (
      lead_id,
      first_touchpoint_id,
      last_touchpoint_id,
      lead_creation_touchpoint_id,
      first_touch_source,
      first_touch_medium,
      first_touch_campaign,
      last_touch_source,
      last_touch_medium,
      last_touch_campaign
    )
    values (
      v_lead.id,
      v_touchpoint_id,
      v_touchpoint_id,
      v_touchpoint_id,
      p_first_touch_source,
      p_first_touch_medium,
      p_first_touch_campaign,
      p_first_touch_source,
      p_first_touch_medium,
      p_first_touch_campaign
    );

  else

    insert into public.lead_attribution (
      lead_id
    )
    values (
      v_lead.id
    );

  end if;


  -- =======================================================
  -- AUDIT
  -- =======================================================

  insert into public.activities (
    lead_id,
    activity_type,
    channel,
    actor_type,
    actor_id,
    title,
    details
  )
  values (
    v_lead.id,
    'lead_created',
    p_lead_creation_channel,
    'human',

    case
      when auth.role() = 'service_role'
        then 'service_role'
      else auth.uid()::text
    end,

    'Lead created',
    'Created manually in CRM'
  );


  return v_lead;

end;
$function$;

CREATE OR REPLACE FUNCTION public.update_crm_lead_fields(p_lead_id uuid, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_current public.leads%rowtype;
  v_new public.leads%rowtype;

  v_organization_id uuid;

  v_privileged boolean := false;
  v_is_admissions boolean := false;

  v_safe_keys constant text[] := array[
    'first_name',
    'last_name',
    'display_name',
    'interested_course_id',
    'preferred_batch_id',
    'preferred_location',
    'preferred_month',
    'preferred_mode',
    'country',
    'timezone',
    'language',
    'current_contact_channel',
    'intent',
    'summary',
    'notes'
  ];

  v_privileged_keys constant text[] := array[
    'potential_value',
    'potential_currency',
    'potential_value_source'
  ];

  v_known_keys text[];
  v_invalid_keys text[];
  v_ignored_keys text[];
  v_effective_patch jsonb;

begin

  -- =======================================================
  -- INPUT VALIDATION
  -- =======================================================

  if p_lead_id is null then
    raise exception
      'Lead ID is required';
  end if;

  if p_patch is null
     or jsonb_typeof(p_patch) <> 'object'
  then
    raise exception
      'Lead patch must be a JSON object';
  end if;


  -- =======================================================
  -- LOCK + RESOLVE AUTHORITATIVE TENANT
  --
  -- This happens BEFORE any early return so every caller
  -- must be authorized against the lead organization.
  -- =======================================================

  select *
  into v_current
  from public.leads l
  where l.id = p_lead_id
  for update;

  if not found then
    raise exception
      'Lead not found';
  end if;

  v_organization_id :=
    v_current.organization_id;

  if v_organization_id is null then
    raise exception
      'Lead organization is missing';
  end if;


  -- =======================================================
  -- TENANT-SCOPED AUTHORIZATION
  -- =======================================================

  if auth.role() = 'service_role' then

    v_privileged := true;

  else

    if auth.uid() is null then
      raise exception
        'Not authenticated';
    end if;


    -- Admin / manager INSIDE this organization.

    if public.can_administer_organization_crm(
      v_organization_id
    ) then

      v_privileged := true;


    -- Admissions INSIDE this organization.

    elsif public.has_organization_role(
      v_organization_id,
      array['admissions']::text[]
    ) then

      v_is_admissions := true;

      -- Preserve current employee behaviour:
      -- admissions may only modify their assigned lead.

      if v_current.owner_user_id is distinct from auth.uid() then
        raise exception
          'Not authorized to update this lead';
      end if;

    else

      raise exception
        'Not authorized to update CRM leads for this organization';

    end if;

  end if;


  -- =======================================================
  -- EMPTY PATCH
  -- Authorization has already succeeded.
  -- =======================================================

  if p_patch = '{}'::jsonb then

    return jsonb_build_object(
      'ok', true,
      'lead_id', p_lead_id,
      'organization_id', v_organization_id,
      'updated', false,
      'ignored_privileged_fields', '[]'::jsonb
    );

  end if;


  -- =======================================================
  -- REJECT UNKNOWN / DANGEROUS KEYS
  -- =======================================================

  v_known_keys :=
    v_safe_keys
    ||
    v_privileged_keys;


  select
    array_agg(k order by k)
  into
    v_invalid_keys
  from jsonb_object_keys(p_patch) as keys(k)
  where not (
    k = any(v_known_keys)
  );


  if coalesce(
    array_length(
      v_invalid_keys,
      1
    ),
    0
  ) > 0 then

    raise exception
      'Lead patch contains blocked field(s): %',
      array_to_string(
        v_invalid_keys,
        ', '
      );

  end if;


  -- =======================================================
  -- COMMERCIAL FIELD PROTECTION
  --
  -- Admissions can update normal lead fields but cannot
  -- change commercial/potential-value fields.
  -- =======================================================

  v_effective_patch :=
    p_patch;


  if not v_privileged then

    select
      array_agg(k order by k)
    into
      v_ignored_keys
    from jsonb_object_keys(p_patch) as keys(k)
    where k = any(v_privileged_keys);


    v_effective_patch :=
      v_effective_patch
      - 'potential_value'
      - 'potential_currency'
      - 'potential_value_source';

  end if;


  -- =======================================================
  -- COMMERCIAL VALIDATION
  -- =======================================================

  if v_privileged then

    if
      v_effective_patch ? 'potential_value'
      and
      v_effective_patch -> 'potential_value'
        is not null
      and
      v_effective_patch -> 'potential_value'
        <> 'null'::jsonb
      and
      (
        v_effective_patch
          ->> 'potential_value'
      )::numeric < 0
    then

      raise exception
        'Potential value cannot be negative';

    end if;


    if
      v_effective_patch ? 'potential_currency'
      and
      coalesce(
        v_effective_patch
          ->> 'potential_currency',
        ''
      ) <> ''
      and
      upper(
        v_effective_patch
          ->> 'potential_currency'
      ) not in (
        'USD',
        'INR'
      )
    then

      raise exception
        'Potential currency must be USD or INR';

    end if;


    if
      v_effective_patch ? 'potential_value_source'
      and
      coalesce(
        v_effective_patch
          ->> 'potential_value_source',
        ''
      ) <> ''
      and
      (
        v_effective_patch
          ->> 'potential_value_source'
      ) not in (
        'manual',
        'batch_default'
      )
    then

      raise exception
        'Invalid potential value source';

    end if;

  end if;


  -- =======================================================
  -- NOTHING LEFT AFTER PERMISSION FILTERING
  -- =======================================================

  if v_effective_patch = '{}'::jsonb then

    return jsonb_build_object(
      'ok', true,
      'lead_id', p_lead_id,
      'organization_id', v_organization_id,
      'updated', false,

      'ignored_privileged_fields',
        to_jsonb(
          coalesce(
            v_ignored_keys,
            array[]::text[]
          )
        )
    );

  end if;


  -- =======================================================
  -- TYPE-SAFE PATCH
  -- =======================================================

  select *
  into v_new
  from jsonb_populate_record(
    v_current,
    v_effective_patch
  );


  -- =======================================================
  -- CROSS-TENANT COURSE VALIDATION
  -- =======================================================

  if v_new.interested_course_id is not null
     and not exists (
       select 1
       from public.courses c
       where c.id =
             v_new.interested_course_id
         and c.organization_id =
             v_organization_id
     )
  then

    raise exception
      'Selected course does not belong to this organization';

  end if;


  -- =======================================================
  -- CROSS-TENANT BATCH VALIDATION
  -- =======================================================

  if v_new.preferred_batch_id is not null
     and not exists (
       select 1
       from public.course_batches cb
       where cb.id =
             v_new.preferred_batch_id
         and cb.organization_id =
             v_organization_id
     )
  then

    raise exception
      'Selected batch does not belong to this organization';

  end if;


  -- If both are supplied, they must agree.

  if v_new.preferred_batch_id is not null
     and v_new.interested_course_id is not null
     and not exists (
       select 1
       from public.course_batches cb
       where cb.id =
             v_new.preferred_batch_id
         and cb.organization_id =
             v_organization_id
         and cb.course_id =
             v_new.interested_course_id
     )
  then

    raise exception
      'Selected batch does not belong to the selected course';

  end if;


  -- =======================================================
  -- UPDATE APPROVED FIELDS ONLY
  -- =======================================================

  update public.leads
  set
    first_name =
      v_new.first_name,

    last_name =
      v_new.last_name,

    display_name =
      v_new.display_name,

    interested_course_id =
      v_new.interested_course_id,

    preferred_batch_id =
      v_new.preferred_batch_id,

    preferred_location =
      v_new.preferred_location,

    preferred_month =
      v_new.preferred_month,

    preferred_mode =
      v_new.preferred_mode,

    country =
      v_new.country,

    timezone =
      v_new.timezone,

    language =
      v_new.language,

    current_contact_channel =
      v_new.current_contact_channel,

    intent =
      v_new.intent,

    summary =
      v_new.summary,

    notes =
      v_new.notes,

    potential_value =
      case
        when v_privileged
          then v_new.potential_value
        else v_current.potential_value
      end,

    potential_currency =
      case
        when v_privileged
          then v_new.potential_currency
        else v_current.potential_currency
      end,

    potential_value_source =
      case
        when v_privileged
          then v_new.potential_value_source
        else v_current.potential_value_source
      end

  where id =
        p_lead_id
    and organization_id =
        v_organization_id;


  return jsonb_build_object(
    'ok', true,
    'lead_id', p_lead_id,
    'organization_id', v_organization_id,
    'updated', true,

    'ignored_privileged_fields',
      to_jsonb(
        coalesce(
          v_ignored_keys,
          array[]::text[]
        )
      )
  );

end;
$function$;

revoke all on function public.create_crm_lead(
  uuid, text, text, text, text, uuid, uuid, text, date, text,
  text, text, public.contact_channel, public.contact_channel,
  text, text, text, text
) from public, anon;

grant execute on function public.create_crm_lead(
  uuid, text, text, text, text, uuid, uuid, text, date, text,
  text, text, public.contact_channel, public.contact_channel,
  text, text, text, text
) to authenticated, service_role;


revoke all on function public.update_crm_lead_fields(uuid, jsonb)
  from public, anon;

grant execute on function public.update_crm_lead_fields(uuid, jsonb)
  to authenticated, service_role;


-- =============================================================================
-- 7. WEBSITE INGEST -> PERSON RESOLUTION
-- =============================================================================

CREATE OR REPLACE FUNCTION public.resolve_person_after_lead_ingest()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
begin

  if new.lead_id is null then
    return new;
  end if;


  -- Only process successfully handled ingest records.

  if new.status is distinct from 'processed' then
    return new;
  end if;


  perform public.resolve_person_for_lead(
    new.lead_id,
    coalesce(
      nullif(
        btrim(new.source_system),
        ''
      ),
      'lead_ingest'
    )
  );


  return new;

end;
$function$;

CREATE OR REPLACE FUNCTION public.ingest_website_lead(p_external_event_id text, p_site text DEFAULT NULL::text, p_form_name text DEFAULT NULL::text, p_first_name text DEFAULT NULL::text, p_last_name text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_course_code text DEFAULT NULL::text, p_preferred_location text DEFAULT NULL::text, p_preferred_month date DEFAULT NULL::date, p_preferred_mode text DEFAULT NULL::text, p_country text DEFAULT NULL::text, p_timezone text DEFAULT NULL::text, p_message text DEFAULT NULL::text, p_anonymous_visitor_id text DEFAULT NULL::text, p_session_key text DEFAULT NULL::text, p_first_touch jsonb DEFAULT '{}'::jsonb, p_session_touch jsonb DEFAULT '{}'::jsonb, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare

    v_existing_event public.lead_ingest_events;

    v_email_norm text :=
        lower(
            nullif(
                trim(p_email),
                ''
            )
        );

    v_phone_norm text :=
        nullif(
            regexp_replace(
                coalesce(p_phone, ''),
                '[^0-9+]',
                '',
                'g'
            ),
            ''
        );

    v_email_lead uuid;
    v_phone_lead uuid;

    v_lead public.leads;

    v_course_id uuid;

    v_matched_existing boolean := false;

    v_conversation_id uuid;

    v_now timestamptz := now();

    v_source text :=
        nullif(
            trim(
                coalesce(
                    p_session_touch ->> 'source',
                    p_first_touch ->> 'source'
                )
            ),
            ''
        );

    v_medium text :=
        nullif(
            trim(
                coalesce(
                    p_session_touch ->> 'medium',
                    p_first_touch ->> 'medium'
                )
            ),
            ''
        );

    v_campaign text :=
        nullif(
            trim(
                coalesce(
                    p_session_touch ->> 'campaign',
                    p_first_touch ->> 'campaign'
                )
            ),
            ''
        );

    v_touchpoint_id uuid;

    -- Tenant resolution
    v_organization_id uuid;
    v_site_host text;

begin

    -- ========================================================
    -- 1. VALIDATE EXTERNAL EVENT
    -- ========================================================

    if nullif(
        trim(p_external_event_id),
        ''
    ) is null then

        raise exception
            'external_event_id is required';

    end if;


    -- ========================================================
    -- 2. NORMALIZE WEBSITE HOSTNAME
    --
    -- Supports:
    --
    -- yogakulam.com
    -- www.yogakulam.com
    -- https://www.yogakulam.com
    -- https://www.yogakulam.com/some/page
    -- ========================================================

    v_site_host :=
        lower(
            trim(
                coalesce(
                    p_site,
                    ''
                )
            )
        );

    v_site_host :=
        regexp_replace(
            v_site_host,
            '^https?://',
            ''
        );

    v_site_host :=
        split_part(
            v_site_host,
            '/',
            1
        );

    v_site_host :=
        split_part(
            v_site_host,
            ':',
            1
        );


    -- ========================================================
    -- 3. RESOLVE ORGANIZATION FROM REGISTERED WEBSITE
    -- ========================================================

    if nullif(
        v_site_host,
        ''
    ) is not null then

        select
            os.organization_id
        into
            v_organization_id

        from public.organization_sites os

        where lower(os.hostname) =
              v_site_host

          and os.status =
              'active'

        limit 1;

    end if;


    -- ========================================================
    -- 4. FALLBACK TO TRACKED SESSION
    --
    -- Useful for an older form integration that sends the
    -- session but not the website hostname.
    --
    -- Only accepts the fallback when exactly one organization
    -- owns the supplied session key.
    -- ========================================================

    if v_organization_id is null
       and nullif(
           trim(p_session_key),
           ''
       ) is not null then

        select
            min(ws.organization_id)
        into
            v_organization_id

        from public.web_sessions ws

        where ws.session_key =
              trim(p_session_key)

        having count(
            distinct
            ws.organization_id
        ) = 1;

    end if;


    -- ========================================================
    -- 5. SECOND FALLBACK TO VISITOR
    --
    -- Again, only if the visitor currently belongs to exactly
    -- one organization.
    -- ========================================================

    if v_organization_id is null
       and nullif(
           trim(p_anonymous_visitor_id),
           ''
       ) is not null then

        select
            min(ws.organization_id)
        into
            v_organization_id

        from public.web_sessions ws

        where ws.anonymous_visitor_id =
              trim(p_anonymous_visitor_id)

        having count(
            distinct
            ws.organization_id
        ) = 1;

    end if;


    if v_organization_id is null then

        raise exception
            'Unable to resolve organization for website lead capture';

    end if;


    -- ========================================================
    -- 6. ORGANIZATION-SCOPED IDEMPOTENCY LOCK
    -- ========================================================

    perform pg_advisory_xact_lock(
        hashtext(
            'website:'
            || v_organization_id::text
            || ':'
            || trim(
                p_external_event_id
            )
        )
    );


    -- ========================================================
    -- 7. TENANT-SCOPED IDEMPOTENCY CHECK
    -- ========================================================

    select *
    into v_existing_event

    from public.lead_ingest_events lie

    where lie.organization_id =
          v_organization_id

      and lie.source_system =
          'website'

      and lie.external_event_id =
          trim(
              p_external_event_id
          )

    limit 1;


    if found then

        select *
        into v_lead

        from public.leads l

        where l.id =
              v_existing_event.lead_id

          and l.organization_id =
              v_organization_id;


        return jsonb_build_object(
            'ok',
                true,

            'duplicate_event',
                true,

            'created',
                false,

            'matched_existing',
                v_existing_event.matched_existing,

            'lead_id',
                v_lead.id,

            'lead_code',
                v_lead.lead_code,

            'organization_id',
                v_organization_id
        );

    end if;


    -- ========================================================
    -- 8. TENANT-SCOPED CONTACT MATCHING
    -- ========================================================

    if v_email_norm is not null then

        select lc.lead_id
        into v_email_lead

        from public.lead_contacts lc

        where lc.organization_id =
              v_organization_id

          and lc.contact_type =
              'email'

          and lc.normalized_value =
              v_email_norm

        limit 1;

    end if;


    if v_phone_norm is not null then

        select lc.lead_id
        into v_phone_lead

        from public.lead_contacts lc

        where lc.organization_id =
              v_organization_id

          and lc.contact_type in (
              'phone',
              'whatsapp'
          )

          and lc.normalized_value =
              v_phone_norm

        limit 1;

    end if;


    if v_email_lead is not null
       and v_phone_lead is not null
       and v_email_lead <>
           v_phone_lead then

        raise exception
            'Email and phone belong to different existing leads';

    end if;


    -- ========================================================
    -- 9. TENANT-SCOPED COURSE LOOKUP
    -- ========================================================

    if nullif(
        trim(p_course_code),
        ''
    ) is not null then

        select c.id
        into v_course_id

        from public.courses c

        where c.organization_id =
              v_organization_id

          and c.code =
              trim(
                  p_course_code
              )

          and c.active =
              true

        limit 1;

    end if;


    -- ========================================================
    -- 10. UPDATE EXISTING LEAD
    -- ========================================================

    if coalesce(
        v_email_lead,
        v_phone_lead
    ) is not null then

        v_matched_existing :=
            true;


        update public.leads

        set
            first_name =
                coalesce(
                    nullif(
                        trim(
                            p_first_name
                        ),
                        ''
                    ),
                    first_name
                ),

            last_name =
                coalesce(
                    nullif(
                        trim(
                            p_last_name
                        ),
                        ''
                    ),
                    last_name
                ),

            display_name =
                coalesce(
                    nullif(
                        trim(
                            concat_ws(
                                ' ',
                                nullif(
                                    trim(
                                        p_first_name
                                    ),
                                    ''
                                ),
                                nullif(
                                    trim(
                                        p_last_name
                                    ),
                                    ''
                                )
                            )
                        ),
                        ''
                    ),
                    display_name
                ),

            interested_course_id =
                coalesce(
                    v_course_id,
                    interested_course_id
                ),

            preferred_location =
                coalesce(
                    nullif(
                        trim(
                            p_preferred_location
                        ),
                        ''
                    ),
                    preferred_location
                ),

            preferred_month =
                coalesce(
                    p_preferred_month,
                    preferred_month
                ),

            preferred_mode =
                coalesce(
                    nullif(
                        trim(
                            p_preferred_mode
                        ),
                        ''
                    ),
                    preferred_mode
                ),

            country =
                coalesce(
                    nullif(
                        trim(
                            p_country
                        ),
                        ''
                    ),
                    country
                ),

            timezone =
                coalesce(
                    nullif(
                        trim(
                            p_timezone
                        ),
                        ''
                    ),
                    timezone
                ),

            current_contact_channel =
                'website',

            first_contacted_at =
                coalesce(
                    first_contacted_at,
                    v_now
                ),

            last_contacted_at =
                v_now,

            last_inbound_at =
                v_now,

            notes =
                case

                    when nullif(
                        trim(
                            p_message
                        ),
                        ''
                    ) is null
                    then notes

                    when notes is null
                         or trim(notes) = ''
                    then left(
                        trim(
                            p_message
                        ),
                        4000
                    )

                    else notes

                end,

            metadata =
                metadata
                ||
                jsonb_build_object(
                    'last_website_submission',
                    jsonb_build_object(
                        'event_id',
                            trim(
                                p_external_event_id
                            ),

                        'site',
                            nullif(
                                trim(
                                    p_site
                                ),
                                ''
                            ),

                        'form_name',
                            nullif(
                                trim(
                                    p_form_name
                                ),
                                ''
                            ),

                        'received_at',
                            v_now,

                        'organization_id',
                            v_organization_id
                    )
                )

        where id =
              coalesce(
                  v_email_lead,
                  v_phone_lead
              )

          and organization_id =
              v_organization_id

        returning *
        into v_lead;


    -- ========================================================
    -- 11. CREATE NEW TENANT-OWNED LEAD
    -- ========================================================

    else

        insert into public.leads(
            organization_id,

            first_name,
            last_name,
            display_name,

            interested_course_id,

            preferred_location,
            preferred_month,
            preferred_mode,

            country,
            timezone,

            lead_creation_channel,
            current_contact_channel,

            first_contacted_at,
            last_contacted_at,
            last_inbound_at,

            notes,
            metadata
        )
        values (
            v_organization_id,

            nullif(
                trim(
                    p_first_name
                ),
                ''
            ),

            nullif(
                trim(
                    p_last_name
                ),
                ''
            ),

            coalesce(
                nullif(
                    trim(
                        concat_ws(
                            ' ',
                            nullif(
                                trim(
                                    p_first_name
                                ),
                                ''
                            ),
                            nullif(
                                trim(
                                    p_last_name
                                ),
                                ''
                            )
                        )
                    ),
                    ''
                ),

                nullif(
                    v_email_norm,
                    ''
                ),

                nullif(
                    v_phone_norm,
                    ''
                ),

                'Website Lead'
            ),

            v_course_id,

            nullif(
                trim(
                    p_preferred_location
                ),
                ''
            ),

            p_preferred_month,

            nullif(
                trim(
                    p_preferred_mode
                ),
                ''
            ),

            nullif(
                trim(
                    p_country
                ),
                ''
            ),

            nullif(
                trim(
                    p_timezone
                ),
                ''
            ),

            'website',
            'website',

            v_now,
            v_now,
            v_now,

            nullif(
                left(
                    trim(
                        p_message
                    ),
                    4000
                ),
                ''
            ),

            jsonb_build_object(
                'website_capture',
                jsonb_build_object(
                    'event_id',
                        trim(
                            p_external_event_id
                        ),

                    'site',
                        nullif(
                            trim(
                                p_site
                            ),
                            ''
                        ),

                    'form_name',
                        nullif(
                            trim(
                                p_form_name
                            ),
                            ''
                        ),

                    'received_at',
                        v_now,

                    'organization_id',
                        v_organization_id
                )
            )
            ||
            coalesce(
                p_metadata,
                '{}'::jsonb
            )
        )

        returning *
        into v_lead;

    end if;


    -- ========================================================
    -- 12. TENANT-OWNED CONTACTS
    --
    -- Keep the existing global conflict target TEMPORARILY.
    -- We will migrate contact uniqueness after all writers are
    -- organization-aware.
    -- ========================================================

    if v_email_norm is not null then

        insert into public.lead_contacts(
            organization_id,
            lead_id,
            contact_type,
            value,
            normalized_value,
            is_primary
        )
        values (
            v_organization_id,
            v_lead.id,
            'email',
            trim(
                p_email
            ),
            v_email_norm,
            true
        )

        on conflict (
            organization_id,
            contact_type,
            normalized_value
        )
        do nothing;

    end if;


    if v_phone_norm is not null then

        insert into public.lead_contacts(
            organization_id,
            lead_id,
            contact_type,
            value,
            normalized_value,
            is_primary
        )
        values (
            v_organization_id,
            v_lead.id,
            'phone',
            trim(
                p_phone
            ),
            v_phone_norm,
            v_email_norm is null
        )

        on conflict (
            organization_id,
            contact_type,
            normalized_value
        )
        do nothing;

    end if;


    -- ========================================================
    -- 13. TENANT-OWNED VISITOR IDENTITY
    --
    -- Old global PK remains temporarily.
    -- Guard against accidental cross-organization reassignment.
    -- ========================================================

    if nullif(
        trim(
            p_anonymous_visitor_id
        ),
        ''
    ) is not null then

        if exists (
            select 1

            from public.visitor_identity_links vil

            where vil.anonymous_visitor_id =
                  trim(
                      p_anonymous_visitor_id
                  )

              and vil.organization_id <>
                  v_organization_id
        ) then

            raise exception
                'Anonymous visitor identity belongs to a different organization';

        end if;


        insert into public.visitor_identity_links(
            organization_id,
            anonymous_visitor_id,
            lead_id,
            last_session_key,
            source_system,
            metadata
        )
        values (
            v_organization_id,

            trim(
                p_anonymous_visitor_id
            ),

            v_lead.id,

            nullif(
                trim(
                    p_session_key
                ),
                ''
            ),

            'website',

            jsonb_build_object(
                'last_external_event_id',
                    trim(
                        p_external_event_id
                    )
            )
        )

        on conflict (
            organization_id,
            anonymous_visitor_id
        )
        do update set

            lead_id =
                excluded.lead_id,

            last_session_key =
                excluded.last_session_key,

            source_system =
                excluded.source_system,

            linked_at =
                now(),

            metadata =
                public.visitor_identity_links.metadata
                ||
                excluded.metadata,

            updated_at =
                now()

        where public.visitor_identity_links.organization_id =
              excluded.organization_id;


        perform
            public.attach_visitor_journey_to_lead(
                v_lead.id,

                trim(
                    p_anonymous_visitor_id
                ),

                nullif(
                    trim(
                        p_session_key
                    ),
                    ''
                )
            );

    end if;


    -- ========================================================
    -- 14. TENANT-OWNED LEAD-CREATION TOUCHPOINT
    -- ========================================================

    insert into public.touchpoints(
        organization_id,

        lead_id,
        anonymous_visitor_id,

        occurred_at,

        source,
        medium,
        campaign_name,

        platform,
        channel,

        event_type,

        utm_source,
        utm_medium,
        utm_campaign,

        gclid,
        gbraid,
        wbraid,
        fbclid,

        external_campaign_id,
        external_adset_id,
        external_ad_id,

        metadata
    )
    values (
        v_organization_id,

        v_lead.id,

        nullif(
            trim(
                p_anonymous_visitor_id
            ),
            ''
        ),

        v_now,

        v_source,
        v_medium,
        v_campaign,

        v_source,
        'website',

        'lead_created',

        v_source,
        v_medium,
        v_campaign,

        nullif(
            p_session_touch ->> 'gclid',
            ''
        ),

        nullif(
            p_session_touch ->> 'gbraid',
            ''
        ),

        nullif(
            p_session_touch ->> 'wbraid',
            ''
        ),

        nullif(
            p_session_touch ->> 'fbclid',
            ''
        ),

        nullif(
            p_session_touch ->> 'campaignId',
            ''
        ),

        nullif(
            p_session_touch ->> 'adsetId',
            ''
        ),

        coalesce(
            nullif(
                p_session_touch ->> 'adId',
                ''
            ),

            nullif(
                p_session_touch ->> 'creativeId',
                ''
            )
        ),

        jsonb_build_object(
            'external_event_id',
                trim(
                    p_external_event_id
                ),

            'site',
                nullif(
                    trim(
                        p_site
                    ),
                    ''
                ),

            'form_name',
                nullif(
                    trim(
                        p_form_name
                    ),
                    ''
                ),

            'capture',
                'server',

            'organization_id',
                v_organization_id
        )
        ||
        coalesce(
            p_metadata,
            '{}'::jsonb
        )
    )

    returning id
    into v_touchpoint_id;


    perform
        public.refresh_lead_attribution_internal(
            v_lead.id
        );


    -- ========================================================
    -- 15. WEBSITE CONVERSATION / MESSAGE
    -- ========================================================

    if nullif(
        trim(
            p_message
        ),
        ''
    ) is not null then

        select c.id
        into v_conversation_id

        from public.conversations c

        where c.lead_id =
              v_lead.id

          and c.organization_id =
              v_organization_id

          and c.channel =
              'website'

          and c.status =
              'open'

        order by
            coalesce(
                c.last_message_at,
                c.started_at
            )
            desc

        limit 1;


        if v_conversation_id is null then

            insert into public.conversations(
                organization_id,
                lead_id,
                channel,
                status,
                started_at,
                last_message_at,
                external_conversation_id,
                metadata
            )
            values (
                v_organization_id,
                v_lead.id,
                'website',
                'open',
                v_now,
                v_now,
                null,

                jsonb_build_object(
                    'site',
                        p_site,

                    'form_name',
                        p_form_name,

                    'organization_id',
                        v_organization_id
                )
            )

            returning id
            into v_conversation_id;

        else

            update public.conversations

            set last_message_at =
                v_now

            where id =
                  v_conversation_id
              and organization_id =
                  v_organization_id;

        end if;


        insert into public.messages(
            organization_id,
            conversation_id,
            lead_id,
            external_message_id,
            direction,
            sender_type,
            message_type,
            body,
            status,
            received_at,
            metadata
        )

        select
            v_organization_id,

            v_conversation_id,

            v_lead.id,

            'website:'
            ||
            trim(
                p_external_event_id
            ),

            'inbound',
            'lead',
            'text',

            left(
                trim(
                    p_message
                ),
                8000
            ),

            'received',

            v_now,

            jsonb_build_object(
                'site',
                    p_site,

                'form_name',
                    p_form_name,

                'organization_id',
                    v_organization_id
            )

        where not exists (

            select 1

            from public.messages m

            where m.organization_id =
                  v_organization_id

              and m.external_message_id =
                  'website:'
                  ||
                  trim(
                      p_external_event_id
                  )

              and m.lead_id =
                  v_lead.id
        );

    end if;


    -- ========================================================
    -- 16. ACTIVITY
    -- ========================================================

    insert into public.activities(
        lead_id,
        activity_type,
        channel,
        actor_type,
        actor_id,
        title,
        details,
        metadata,
        occurred_at
    )
    values (
        v_lead.id,

        case

            when v_matched_existing
            then 'website_form_repeat'

            else 'website_lead_created'

        end,

        'website',
        'automation',
        'website-capture',

        case

            when v_matched_existing
            then 'Website enquiry received'

            else 'Website lead created'

        end,

        left(
            coalesce(
                nullif(
                    trim(
                        p_message
                    ),
                    ''
                ),

                coalesce(
                    p_form_name,
                    'Website form submission'
                )
            ),
            500
        ),

        jsonb_build_object(
            'external_event_id',
                trim(
                    p_external_event_id
                ),

            'site',
                p_site,

            'form_name',
                p_form_name,

            'matched_existing',
                v_matched_existing,

            'organization_id',
                v_organization_id
        )
        ||
        coalesce(
            p_metadata,
            '{}'::jsonb
        ),

        v_now
    );


    -- ========================================================
    -- 17. TENANT-OWNED INGEST EVENT
    -- ========================================================

    insert into public.lead_ingest_events(
        organization_id,

        source_system,
        external_event_id,

        lead_id,

        site,
        form_name,

        matched_existing,
        status,

        metadata,
        received_at
    )
    values (
        v_organization_id,

        'website',

        trim(
            p_external_event_id
        ),

        v_lead.id,

        nullif(
            trim(
                p_site
            ),
            ''
        ),

        nullif(
            trim(
                p_form_name
            ),
            ''
        ),

        v_matched_existing,

        'processed',

        jsonb_build_object(
            'anonymous_visitor_id',
                nullif(
                    trim(
                        p_anonymous_visitor_id
                    ),
                    ''
                ),

            'session_key',
                nullif(
                    trim(
                        p_session_key
                    ),
                    ''
                ),

            'organization_id',
                v_organization_id
        )
        ||
        coalesce(
            p_metadata,
            '{}'::jsonb
        ),

        v_now
    );


    -- ========================================================
    -- 18. RETURN
    -- ========================================================

    return jsonb_build_object(
        'ok',
            true,

        'duplicate_event',
            false,

        'created',
            not v_matched_existing,

        'matched_existing',
            v_matched_existing,

        'lead_id',
            v_lead.id,

        'lead_code',
            v_lead.lead_code,

        'touchpoint_id',
            v_touchpoint_id,

        'organization_id',
            v_organization_id
    );

end;
$function$;

revoke all on function public.resolve_person_after_lead_ingest()
  from public, anon, authenticated;
grant execute on function public.resolve_person_after_lead_ingest()
  to service_role;

revoke all on function public.ingest_website_lead(
  text, text, text, text, text, text, text, text, text, date,
  text, text, text, text, text, text, jsonb, jsonb, jsonb
) from public, anon, authenticated;

grant execute on function public.ingest_website_lead(
  text, text, text, text, text, text, text, text, text, date,
  text, text, text, text, text, text, jsonb, jsonb, jsonb
) to service_role;


drop trigger if exists trg_resolve_person_after_lead_ingest
  on public.lead_ingest_events;

create trigger trg_resolve_person_after_lead_ingest
after insert
on public.lead_ingest_events
for each row
execute function public.resolve_person_after_lead_ingest();


-- =============================================================================
-- 8. WHATSAPP WEBHOOK -> PERSON RESOLUTION
-- =============================================================================

CREATE OR REPLACE FUNCTION public.ingest_whatsapp_webhook_event(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_event public.whatsapp_webhook_events%rowtype;

  v_message jsonb;
  v_message_type text;
  v_body text;

  v_wa_id text;
  v_external_message_id text;
  v_phone_number_id text;
  v_profile_name text;
  v_message_at timestamptz;

  v_lead_id uuid;
  v_conversation_id uuid;

  v_claimed_message_id text;
  v_created_lead boolean := false;
begin

  select *
  into v_event
  from public.whatsapp_webhook_events
  where id = p_event_id
  for update;


  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'Webhook event not found',
      'event_id', p_event_id
    );
  end if;


  -- -------------------------------------------------------
  -- REQUIRE TENANT
  -- -------------------------------------------------------

  if v_event.organization_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Webhook event organization is missing',
      'event_id', p_event_id
    );
  end if;


  if v_event.processing_status = 'processed' then
    return jsonb_build_object(
      'ok', true,
      'already_processed', true,
      'event_id', p_event_id
    );
  end if;


  if coalesce(v_event.event_type, '') not like 'message:%' then

    update public.whatsapp_webhook_events
    set
      processing_status = 'ignored',
      processed_at = now(),
      processing_error = null
    where id = p_event_id
      and organization_id = v_event.organization_id;

    return jsonb_build_object(
      'ok', true,
      'ignored', true,
      'event_type', v_event.event_type,
      'event_id', p_event_id
    );

  end if;


  begin

    v_message :=
      coalesce(
        v_event.payload -> 'message',
        '{}'::jsonb
      );


    v_wa_id :=
      regexp_replace(
        coalesce(
          v_event.contact_wa_id,
          v_message ->> 'from',
          ''
        ),
        '[^0-9]',
        '',
        'g'
      );


    v_external_message_id :=
      coalesce(
        v_event.external_message_id,
        v_message ->> 'id'
      );


    v_phone_number_id :=
      coalesce(
        v_event.phone_number_id,
        v_event.payload
          -> 'metadata'
          ->> 'phone_number_id'
      );


    v_profile_name :=
      nullif(
        btrim(
          coalesce(
            v_event.payload
              -> 'contacts'
              -> 0
              -> 'profile'
              ->> 'name',
            ''
          )
        ),
        ''
      );


    v_message_type :=
      coalesce(
        nullif(
          v_message ->> 'type',
          ''
        ),
        'unknown'
      );


    if v_wa_id = '' then
      raise exception
        'WhatsApp contact wa_id is missing';
    end if;


    if
      v_external_message_id is null
      or btrim(v_external_message_id) = ''
    then
      raise exception
        'WhatsApp external message id is missing';
    end if;


    -- Tenant-scoped lock.
    perform pg_advisory_xact_lock(
      hashtextextended(
        v_event.organization_id::text
        || ':'
        || v_wa_id,
        0
      )
    );


    -- -------------------------------------------------------
    -- MESSAGE BODY
    -- -------------------------------------------------------

    v_body :=
      case v_message_type

        when 'text' then
          coalesce(
            v_message -> 'text' ->> 'body',
            '[Text message]'
          )

        when 'button' then
          coalesce(
            v_message -> 'button' ->> 'text',
            v_message -> 'button' ->> 'payload',
            '[Button reply]'
          )

        when 'interactive' then
          coalesce(
            v_message
              -> 'interactive'
              -> 'button_reply'
              ->> 'title',

            v_message
              -> 'interactive'
              -> 'button_reply'
              ->> 'id',

            v_message
              -> 'interactive'
              -> 'list_reply'
              ->> 'title',

            v_message
              -> 'interactive'
              -> 'list_reply'
              ->> 'id',

            '[Interactive reply]'
          )

        when 'image' then
          coalesce(
            nullif(
              v_message
                -> 'image'
                ->> 'caption',
              ''
            ),
            '[Image]'
          )

        when 'video' then
          coalesce(
            nullif(
              v_message
                -> 'video'
                ->> 'caption',
              ''
            ),
            '[Video]'
          )

        when 'document' then
          coalesce(
            nullif(
              v_message
                -> 'document'
                ->> 'caption',
              ''
            ),
            nullif(
              v_message
                -> 'document'
                ->> 'filename',
              ''
            ),
            '[Document]'
          )

        when 'audio' then
          '[Audio message]'

        when 'sticker' then
          '[Sticker]'

        when 'location' then
          concat(
            '[Location: ',
            coalesce(
              v_message
                -> 'location'
                ->> 'latitude',
              '?'
            ),
            ', ',
            coalesce(
              v_message
                -> 'location'
                ->> 'longitude',
              '?'
            ),
            ']'
          )

        when 'reaction' then
          concat(
            '[Reaction: ',
            coalesce(
              v_message
                -> 'reaction'
                ->> 'emoji',
              ''
            ),
            ']'
          )

        else
          concat(
            '[WhatsApp ',
            v_message_type,
            ' message]'
          )

      end;


    v_message_at :=
      case

        when
          coalesce(
            v_message ->> 'timestamp',
            ''
          ) ~ '^[0-9]+$'

          then to_timestamp(
            (
              v_message ->> 'timestamp'
            )::double precision
          )

        else
          coalesce(
            v_event.received_at,
            now()
          )

      end;


    -- -------------------------------------------------------
    -- EXISTING LEAD LOOKUP
    -- TENANT SCOPED
    -- -------------------------------------------------------

    select lc.lead_id
    into v_lead_id
    from public.lead_contacts lc
    where
      lc.organization_id =
        v_event.organization_id

      and regexp_replace(
        coalesce(
          lc.normalized_value,
          ''
        ),
        '[^0-9]',
        '',
        'g'
      ) =
        v_wa_id

      and lc.contact_type in (
        'whatsapp'::public.contact_type,
        'phone'::public.contact_type
      )

    order by
      case
        when lc.contact_type =
          'whatsapp'::public.contact_type
          then 0
        else 1
      end,

      lc.created_at asc

    limit 1;


    -- -------------------------------------------------------
    -- CREATE NEW TENANT-SCOPED LEAD
    -- -------------------------------------------------------

    if v_lead_id is null then

      select created.id
      into v_lead_id
      from public.create_crm_lead(

        p_organization_id =>
          v_event.organization_id,

        p_first_name =>
          coalesce(
            v_profile_name,
            'WhatsApp Lead'
          ),

        p_last_name => null,

        p_email => null,

        p_phone =>
          '+' || v_wa_id,

        p_course_id => null,

        p_preferred_batch_id => null,

        p_preferred_location => null,

        p_preferred_month => null,

        p_preferred_mode => null,

        p_country => null,

        p_timezone => null,

        p_lead_creation_channel =>
          'whatsapp'::public.contact_channel,

        p_current_contact_channel =>
          'whatsapp'::public.contact_channel,

        p_first_touch_source => null,

        p_first_touch_medium => null,

        p_first_touch_campaign => null,

        p_notes =>
          'Created automatically from an inbound WhatsApp Cloud API message.'

      ) as created;


      v_created_lead := true;

    end if;


    if v_lead_id is null then
      raise exception
        'Unable to resolve/create CRM lead for WhatsApp wa_id %',
        v_wa_id;
    end if;


    -- -------------------------------------------------------
    -- FIRST TOUCHPOINT
    -- -------------------------------------------------------

    if v_created_lead then

      insert into public.touchpoints (
        organization_id,
        lead_id,
        occurred_at,
        source,
        medium,
        campaign_name,
        channel,
        event_type,
        utm_source,
        utm_medium,
        utm_campaign
      )
      values (
        v_event.organization_id,
        v_lead_id,
        v_message_at,
        'whatsapp',
        'messaging',
        null,
        'whatsapp'::public.contact_channel,
        'lead_created',
        'whatsapp',
        'messaging',
        null
      );

    end if;


    -- -------------------------------------------------------
    -- WHATSAPP CONTACT IDENTITY
    -- -------------------------------------------------------

    insert into public.lead_contacts (
      organization_id,
      lead_id,
      contact_type,
      value,
      normalized_value,
      is_primary,
      verified,
      metadata
    )
    values (
      v_event.organization_id,
      v_lead_id,
      'whatsapp'::public.contact_type,
      '+' || v_wa_id,
      v_wa_id,
      false,
      true,

      jsonb_build_object(
        'source',
        'whatsapp_cloud_api',

        'wa_id',
        v_wa_id,

        'profile_name',
        v_profile_name
      )
    )

    on conflict (
      organization_id,
      contact_type,
      normalized_value
    )

    do update set
      value =
        excluded.value,

      verified =
        true,

      metadata =
        coalesce(
          public.lead_contacts.metadata,
          '{}'::jsonb
        )
        || excluded.metadata

    returning lead_id
    into v_lead_id;


    -- -------------------------------------------------------
    -- CANONICAL PERSON IDENTITY
    -- -------------------------------------------------------

    perform public.resolve_person_for_lead(
      v_lead_id,
      'whatsapp_webhook'
    );


    -- -------------------------------------------------------
    -- CONVERSATION
    -- TENANT SCOPED
    -- -------------------------------------------------------

    select c.id
    into v_conversation_id
    from public.conversations c
    where
      c.organization_id =
        v_event.organization_id

      and c.channel =
        'whatsapp'::public.contact_channel

      and c.external_conversation_id =
        v_wa_id

      and c.external_account_id
        is not distinct from
        v_phone_number_id

    order by c.started_at asc

    limit 1;


    if v_conversation_id is null then

      insert into public.conversations (
        organization_id,
        lead_id,
        channel,
        external_conversation_id,
        external_account_id,
        status,
        started_at,
        last_message_at
      )
      values (
        v_event.organization_id,
        v_lead_id,
        'whatsapp'::public.contact_channel,
        v_wa_id,
        v_phone_number_id,
        'open',
        v_message_at,
        v_message_at
      )
      returning id
      into v_conversation_id;

    end if;


    -- -------------------------------------------------------
    -- TENANT-SCOPED IDEMPOTENCY CLAIM
    -- -------------------------------------------------------

    insert into public.whatsapp_crm_message_links (
      organization_id,
      external_message_id,
      webhook_event_id,
      lead_id,
      conversation_id
    )
    values (
      v_event.organization_id,
      v_external_message_id,
      p_event_id,
      v_lead_id,
      v_conversation_id
    )

    on conflict (
      organization_id,
      external_message_id
    )
    do nothing

    returning external_message_id
    into v_claimed_message_id;


    if v_claimed_message_id is null then

      update public.whatsapp_webhook_events
      set
        processing_status = 'processed',
        processed_at = now(),
        processing_error = null
      where id = p_event_id
        and organization_id =
          v_event.organization_id;


      return jsonb_build_object(
        'ok', true,
        'duplicate_message', true,
        'external_message_id',
          v_external_message_id,
        'lead_id',
          v_lead_id,
        'conversation_id',
          v_conversation_id,
        'event_id',
          p_event_id
      );

    end if;


    -- -------------------------------------------------------
    -- CANONICAL CRM MESSAGE WRITER
    -- log_lead_interaction now derives tenant from lead.
    -- -------------------------------------------------------

    perform public.log_lead_interaction(
      p_lead_id =>
        v_lead_id,

      p_channel =>
        'whatsapp'::public.contact_channel,

      p_direction =>
        'inbound'::public.message_direction,

      p_body =>
        v_body,

      p_conversation_id =>
        v_conversation_id
    );


    update public.conversations
    set
      last_message_at =
        greatest(
          coalesce(
            last_message_at,
            v_message_at
          ),
          v_message_at
        )

    where id =
      v_conversation_id

      and organization_id =
        v_event.organization_id;


    update public.whatsapp_webhook_events
    set
      processing_status = 'processed',
      processed_at = now(),
      processing_error = null

    where id = p_event_id
      and organization_id =
        v_event.organization_id;


    return jsonb_build_object(
      'ok', true,
      'processed', true,
      'event_id',
        p_event_id,
      'organization_id',
        v_event.organization_id,
      'external_message_id',
        v_external_message_id,
      'lead_id',
        v_lead_id,
      'conversation_id',
        v_conversation_id,
      'message_type',
        v_message_type,
      'created_lead',
        v_created_lead
    );


  exception

    when others then

      update public.whatsapp_webhook_events
      set
        processing_status = 'failed',
        processed_at = now(),
        processing_error = sqlerrm

      where id = p_event_id
        and organization_id =
          v_event.organization_id;


      return jsonb_build_object(
        'ok', false,
        'event_id',
          p_event_id,
        'organization_id',
          v_event.organization_id,
        'error',
          sqlerrm
      );

  end;

end;
$function$;

revoke all on function public.ingest_whatsapp_webhook_event(uuid)
  from public, anon, authenticated;
grant execute on function public.ingest_whatsapp_webhook_event(uuid)
  to service_role;


-- =============================================================================
-- 9. IDENTITY TABLE RLS
--
-- These reproduce the current production identity policies.
-- Some still use legacy global CRM role helpers together with tenant membership.
-- The planned role-authority audit will replace those separately.
-- =============================================================================

alter table public.persons enable row level security;
alter table public.person_identifiers enable row level security;
alter table public.person_leads enable row level security;
alter table public.person_sessions enable row level security;
alter table public.identity_resolution_conflicts enable row level security;


drop policy if exists persons_read on public.persons;
create policy persons_read
on public.persons
for select
to authenticated
using (
  public.is_crm_user()
  and public.is_organization_member(organization_id)
);

drop policy if exists persons_insert on public.persons;
create policy persons_insert
on public.persons
for insert
to authenticated
with check (
  public.is_crm_admin()
  and public.is_organization_member(organization_id)
);

drop policy if exists persons_update on public.persons;
create policy persons_update
on public.persons
for update
to authenticated
using (
  public.is_crm_admin()
  and public.is_organization_member(organization_id)
)
with check (
  public.is_crm_admin()
  and public.is_organization_member(organization_id)
);

drop policy if exists persons_delete on public.persons;
create policy persons_delete
on public.persons
for delete
to authenticated
using (
  public.is_crm_admin()
  and public.is_organization_member(organization_id)
);


drop policy if exists person_identifiers_read
  on public.person_identifiers;
create policy person_identifiers_read
on public.person_identifiers
for select
to authenticated
using (
  public.can_view_lead_pii()
  and public.is_organization_member(organization_id)
);

drop policy if exists person_identifiers_insert
  on public.person_identifiers;
create policy person_identifiers_insert
on public.person_identifiers
for insert
to authenticated
with check (
  public.is_crm_admin()
  and public.is_organization_member(organization_id)
);

drop policy if exists person_identifiers_update
  on public.person_identifiers;
create policy person_identifiers_update
on public.person_identifiers
for update
to authenticated
using (
  public.is_crm_admin()
  and public.is_organization_member(organization_id)
)
with check (
  public.is_crm_admin()
  and public.is_organization_member(organization_id)
);

drop policy if exists person_identifiers_delete
  on public.person_identifiers;
create policy person_identifiers_delete
on public.person_identifiers
for delete
to authenticated
using (
  public.is_crm_admin()
  and public.is_organization_member(organization_id)
);


drop policy if exists person_leads_read
  on public.person_leads;
create policy person_leads_read
on public.person_leads
for select
to authenticated
using (
  public.is_organization_member(organization_id)
  and public.can_access_lead(lead_id)
);

drop policy if exists person_leads_insert
  on public.person_leads;
create policy person_leads_insert
on public.person_leads
for insert
to authenticated
with check (
  public.is_crm_admin()
  and public.is_organization_member(organization_id)
);

drop policy if exists person_leads_update
  on public.person_leads;
create policy person_leads_update
on public.person_leads
for update
to authenticated
using (
  public.is_crm_admin()
  and public.is_organization_member(organization_id)
)
with check (
  public.is_crm_admin()
  and public.is_organization_member(organization_id)
);

drop policy if exists person_leads_delete
  on public.person_leads;
create policy person_leads_delete
on public.person_leads
for delete
to authenticated
using (
  public.is_crm_admin()
  and public.is_organization_member(organization_id)
);


drop policy if exists person_sessions_read
  on public.person_sessions;
create policy person_sessions_read
on public.person_sessions
for select
to authenticated
using (
  public.is_organization_member(organization_id)
  and exists (
    select 1
    from public.person_leads pl
    where pl.organization_id = person_sessions.organization_id
      and pl.person_id = person_sessions.person_id
      and public.can_access_lead(pl.lead_id)
  )
);

drop policy if exists person_sessions_insert
  on public.person_sessions;
create policy person_sessions_insert
on public.person_sessions
for insert
to authenticated
with check (
  public.is_crm_admin()
  and public.is_organization_member(organization_id)
);

drop policy if exists person_sessions_update
  on public.person_sessions;
create policy person_sessions_update
on public.person_sessions
for update
to authenticated
using (
  public.is_crm_admin()
  and public.is_organization_member(organization_id)
)
with check (
  public.is_crm_admin()
  and public.is_organization_member(organization_id)
);

drop policy if exists person_sessions_delete
  on public.person_sessions;
create policy person_sessions_delete
on public.person_sessions
for delete
to authenticated
using (
  public.is_crm_admin()
  and public.is_organization_member(organization_id)
);


drop policy if exists identity_resolution_conflicts_read
  on public.identity_resolution_conflicts;
create policy identity_resolution_conflicts_read
on public.identity_resolution_conflicts
for select
to authenticated
using (
  public.can_administer_organization_crm(organization_id)
);

drop policy if exists identity_resolution_conflicts_insert
  on public.identity_resolution_conflicts;
create policy identity_resolution_conflicts_insert
on public.identity_resolution_conflicts
for insert
to authenticated
with check (
  public.can_administer_organization_crm(organization_id)
);

drop policy if exists identity_resolution_conflicts_update
  on public.identity_resolution_conflicts;
create policy identity_resolution_conflicts_update
on public.identity_resolution_conflicts
for update
to authenticated
using (
  public.can_administer_organization_crm(organization_id)
)
with check (
  public.can_administer_organization_crm(organization_id)
);

drop policy if exists identity_resolution_conflicts_delete
  on public.identity_resolution_conflicts;
create policy identity_resolution_conflicts_delete
on public.identity_resolution_conflicts
for delete
to authenticated
using (
  public.is_organization_admin(organization_id)
);


grant select, insert, update, delete
on public.persons,
   public.person_identifiers,
   public.person_leads,
   public.person_sessions,
   public.identity_resolution_conflicts
to authenticated;

grant all
on public.persons,
   public.person_identifiers,
   public.person_leads,
   public.person_sessions,
   public.identity_resolution_conflicts
to service_role;


-- =============================================================================
-- 10. ONE-TIME EXISTING LEAD BACKFILL
--
-- The resolver is idempotent:
-- existing lead->Person links are reused and deterministic identifiers/sessions
-- are refreshed rather than blindly duplicated.
-- =============================================================================

do $$
declare
  r record;
begin
  for r in
    select l.id
    from public.leads l
    order by l.created_at, l.id
  loop
    perform public.resolve_person_for_lead(
      r.id,
      'identity_migration_backfill'
    );
  end loop;
end
$$;


-- =============================================================================
-- 11. FINAL IDENTITY INTEGRITY ASSERTIONS
-- =============================================================================

do $$
begin
  if exists (
    select 1
    from public.leads l
    left join public.person_leads pl
      on pl.organization_id = l.organization_id
     and pl.lead_id = l.id
    where pl.id is null
  ) then
    raise exception
      '008 abort: at least one lead has no canonical Person link';
  end if;

  if exists (
    select 1
    from public.person_leads
    group by organization_id, lead_id
    having count(*) > 1
  ) then
    raise exception
      '008 abort: duplicate Person links exist for a lead';
  end if;

  if exists (
    select 1
    from public.person_leads pl
    join public.persons p
      on p.id = pl.person_id
    join public.leads l
      on l.id = pl.lead_id
    where pl.organization_id <> p.organization_id
       or pl.organization_id <> l.organization_id
  ) then
    raise exception
      '008 abort: Person/Lead organization mismatch';
  end if;

  if exists (
    select 1
    from public.person_identifiers pi
    join public.persons p
      on p.id = pi.person_id
    where pi.organization_id <> p.organization_id
  ) then
    raise exception
      '008 abort: Person identifier organization mismatch';
  end if;

  if exists (
    select 1
    from public.person_sessions ps
    join public.persons p
      on p.id = ps.person_id
    join public.web_sessions ws
      on ws.id = ps.web_session_id
    where ps.organization_id <> p.organization_id
       or ps.organization_id <> ws.organization_id
  ) then
    raise exception
      '008 abort: Person/session organization mismatch';
  end if;
end
$$;

commit;
