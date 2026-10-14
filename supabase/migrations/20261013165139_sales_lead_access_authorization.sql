begin;

-- =============================================================================
-- 059_sales_lead_access_authorization.sql
--
-- Aligns day-to-day Sales lead access with functional workspace RBAC.
--
-- - Sales owner/admin/manager may access and work every lead in the organization.
-- - Sales member may access and work only leads assigned to that user.
-- - Sales viewer / users without Sales access are denied.
-- - service_role remains supported for trusted backend operations.
-- - Existing lead PII masking rules are intentionally unchanged here.
-- =============================================================================

create or replace function public.can_access_lead(
  p_lead_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
  select exists (
    select 1
    from public.leads l
    where l.id = p_lead_id
      and (
        auth.role() = 'service_role'
        or (
          auth.uid() is not null
          and public.is_organization_member(l.organization_id)
          and (
            public.workspace_role(l.organization_id, 'sales')
              in ('owner', 'admin', 'manager')
            or (
              public.workspace_role(l.organization_id, 'sales') = 'member'
              and l.owner_user_id = auth.uid()
            )
          )
        )
      )
  );
$function$;

revoke all on function public.can_access_lead(uuid)
  from public, anon;

grant execute on function public.can_access_lead(uuid)
  to authenticated, service_role;

comment on function public.can_access_lead(uuid) is
  'Sales workspace lead-access gate: owner/admin/manager may access all organization leads; member may access assigned leads; viewer/no Sales access denied.';


-- =============================================================================
-- LEADS READ POLICY
-- Security-invoker lead views inherit this row boundary.
-- =============================================================================

drop policy if exists leads_read on public.leads;

create policy leads_read
on public.leads
for select
to authenticated
using (
  public.can_access_lead(id)
);


-- =============================================================================
-- LEAD FIELD UPDATE RPC
-- Sales owner/admin/manager receive privileged operational access.
-- Sales member may update safe fields on assigned leads only.
-- Commercial-field filtering remains identical to the previous behavior.
-- =============================================================================

create or replace function public.update_crm_lead_fields(
  p_lead_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_current public.leads%rowtype;
  v_new public.leads%rowtype;
  v_organization_id uuid;
  v_sales_role text;
  v_privileged boolean := false;

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
  if p_lead_id is null then
    raise exception 'Lead ID is required';
  end if;

  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Lead patch must be a JSON object';
  end if;

  select *
    into v_current
  from public.leads l
  where l.id = p_lead_id
  for update;

  if not found then
    raise exception 'Lead not found';
  end if;

  v_organization_id := v_current.organization_id;

  if v_organization_id is null then
    raise exception 'Lead organization is missing';
  end if;

  if auth.role() = 'service_role' then
    v_privileged := true;
  else
    if auth.uid() is null then
      raise exception 'Not authenticated';
    end if;

    if not public.is_organization_member(v_organization_id) then
      raise exception 'Not authorized to update CRM leads for this organization';
    end if;

    v_sales_role := public.workspace_role(
      v_organization_id,
      'sales'
    );

    if v_sales_role in ('owner', 'admin', 'manager') then
      v_privileged := true;
    elsif v_sales_role = 'member' then
      if v_current.owner_user_id is distinct from auth.uid() then
        raise exception 'Not authorized to update this lead';
      end if;
    else
      raise exception 'Not authorized to update CRM leads for this organization';
    end if;
  end if;

  if p_patch = '{}'::jsonb then
    return jsonb_build_object(
      'ok', true,
      'lead_id', p_lead_id,
      'organization_id', v_organization_id,
      'updated', false,
      'ignored_privileged_fields', '[]'::jsonb
    );
  end if;

  v_known_keys := v_safe_keys || v_privileged_keys;

  select array_agg(k order by k)
    into v_invalid_keys
  from jsonb_object_keys(p_patch) as keys(k)
  where not (k = any(v_known_keys));

  if coalesce(array_length(v_invalid_keys, 1), 0) > 0 then
    raise exception
      'Lead patch contains blocked field(s): %',
      array_to_string(v_invalid_keys, ', ');
  end if;

  v_effective_patch := p_patch;

  if not v_privileged then
    select array_agg(k order by k)
      into v_ignored_keys
    from jsonb_object_keys(p_patch) as keys(k)
    where k = any(v_privileged_keys);

    v_effective_patch :=
      v_effective_patch
      - 'potential_value'
      - 'potential_currency'
      - 'potential_value_source';
  end if;

  if v_privileged then
    if v_effective_patch ? 'potential_value'
       and v_effective_patch -> 'potential_value' is not null
       and v_effective_patch -> 'potential_value' <> 'null'::jsonb
       and (v_effective_patch ->> 'potential_value')::numeric < 0
    then
      raise exception 'Potential value cannot be negative';
    end if;

    if v_effective_patch ? 'potential_currency'
       and coalesce(v_effective_patch ->> 'potential_currency', '') <> ''
       and upper(v_effective_patch ->> 'potential_currency') not in ('USD', 'INR')
    then
      raise exception 'Potential currency must be USD or INR';
    end if;

    if v_effective_patch ? 'potential_value_source'
       and coalesce(v_effective_patch ->> 'potential_value_source', '') <> ''
       and (v_effective_patch ->> 'potential_value_source')
         not in ('manual', 'batch_default')
    then
      raise exception 'Invalid potential value source';
    end if;
  end if;

  if v_effective_patch = '{}'::jsonb then
    return jsonb_build_object(
      'ok', true,
      'lead_id', p_lead_id,
      'organization_id', v_organization_id,
      'updated', false,
      'ignored_privileged_fields',
        to_jsonb(coalesce(v_ignored_keys, array[]::text[]))
    );
  end if;

  select *
    into v_new
  from jsonb_populate_record(
    v_current,
    v_effective_patch
  );

  if v_new.interested_course_id is not null
     and not exists (
       select 1
       from public.courses c
       where c.id = v_new.interested_course_id
         and c.organization_id = v_organization_id
     )
  then
    raise exception 'Selected course does not belong to this organization';
  end if;

  if v_new.preferred_batch_id is not null
     and not exists (
       select 1
       from public.course_batches cb
       where cb.id = v_new.preferred_batch_id
         and cb.organization_id = v_organization_id
     )
  then
    raise exception 'Selected batch does not belong to this organization';
  end if;

  if v_new.preferred_batch_id is not null
     and v_new.interested_course_id is not null
     and not exists (
       select 1
       from public.course_batches cb
       where cb.id = v_new.preferred_batch_id
         and cb.organization_id = v_organization_id
         and cb.course_id = v_new.interested_course_id
     )
  then
    raise exception 'Selected batch does not belong to the selected course';
  end if;

  update public.leads
  set
    first_name = v_new.first_name,
    last_name = v_new.last_name,
    display_name = v_new.display_name,
    interested_course_id = v_new.interested_course_id,
    preferred_batch_id = v_new.preferred_batch_id,
    preferred_location = v_new.preferred_location,
    preferred_month = v_new.preferred_month,
    preferred_mode = v_new.preferred_mode,
    country = v_new.country,
    timezone = v_new.timezone,
    language = v_new.language,
    current_contact_channel = v_new.current_contact_channel,
    intent = v_new.intent,
    summary = v_new.summary,
    notes = v_new.notes,
    potential_value = case
      when v_privileged then v_new.potential_value
      else v_current.potential_value
    end,
    potential_currency = case
      when v_privileged then v_new.potential_currency
      else v_current.potential_currency
    end,
    potential_value_source = case
      when v_privileged then v_new.potential_value_source
      else v_current.potential_value_source
    end
  where id = p_lead_id
    and organization_id = v_organization_id;

  return jsonb_build_object(
    'ok', true,
    'lead_id', p_lead_id,
    'organization_id', v_organization_id,
    'updated', true,
    'ignored_privileged_fields',
      to_jsonb(coalesce(v_ignored_keys, array[]::text[]))
  );
end;
$function$;

revoke all on function public.update_crm_lead_fields(uuid, jsonb)
  from public, anon;

grant execute on function public.update_crm_lead_fields(uuid, jsonb)
  to authenticated, service_role;

comment on function public.update_crm_lead_fields(uuid, jsonb) is
  'Updates approved CRM lead fields using Sales workspace authorization. Managers may update privileged fields; members may update safe fields only on assigned leads.';


-- =============================================================================
-- SECURE CONTACT LOOKUP
-- Remove the legacy global CRM-role pre-gate. Row access is determined per lead
-- by can_access_lead(); PII visibility/masking remains governed by the existing
-- can_view_lead_pii() policy and is intentionally unchanged in W5B-1.
-- =============================================================================

create or replace function public.get_admissions_lead_contacts_secure(
  p_lead_ids uuid[] default null::uuid[]
)
returns table(
  lead_id uuid,
  lead_code text,
  lead_name text,
  email text,
  phone text,
  whatsapp text,
  pii_masked boolean
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
begin
  if auth.role() <> 'service_role' and auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  return query
  with accessible_leads as (
    select
      l.id,
      l.lead_code,
      coalesce(
        nullif(btrim(l.display_name), ''),
        nullif(btrim(concat_ws(' ', l.first_name, l.last_name)), ''),
        l.lead_code
      ) as lead_name
    from public.leads l
    where public.can_access_lead(l.id)
      and (
        p_lead_ids is null
        or l.id = any(p_lead_ids)
      )
  ),
  contacts as (
    select
      lc.lead_id,
      max(lc.value) filter (
        where lc.contact_type::text = 'email'
      ) as raw_email,
      max(lc.value) filter (
        where lc.contact_type::text = 'phone'
      ) as raw_phone,
      max(lc.value) filter (
        where lc.contact_type::text = 'whatsapp'
      ) as raw_whatsapp
    from public.lead_contacts lc
    inner join accessible_leads al
      on al.id = lc.lead_id
    group by lc.lead_id
  )
  select
    al.id as lead_id,
    al.lead_code,
    al.lead_name,
    case
      when public.can_view_lead_pii() then c.raw_email
      else public.mask_email(c.raw_email)
    end as email,
    case
      when public.can_view_lead_pii() then c.raw_phone
      else public.mask_phone(c.raw_phone)
    end as phone,
    case
      when public.can_view_lead_pii() then c.raw_whatsapp
      else public.mask_phone(c.raw_whatsapp)
    end as whatsapp,
    not public.can_view_lead_pii() as pii_masked
  from accessible_leads al
  left join contacts c
    on c.lead_id = al.id
  order by al.lead_name;
end;
$function$;

revoke all on function public.get_admissions_lead_contacts_secure(uuid[])
  from public, anon;

grant execute on function public.get_admissions_lead_contacts_secure(uuid[])
  to authenticated, service_role;

comment on function public.get_admissions_lead_contacts_secure(uuid[]) is
  'Returns contact data only for leads allowed by Sales workspace lead access. Existing PII masking rules remain unchanged.';

commit;
