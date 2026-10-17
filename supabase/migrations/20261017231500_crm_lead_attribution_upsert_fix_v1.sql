begin;

create or replace function public.create_crm_lead(
  p_organization_id uuid,
  p_first_name text,
  p_last_name text default null,
  p_email text default null,
  p_phone text default null,
  p_course_id uuid default null,
  p_preferred_batch_id uuid default null,
  p_preferred_location text default null,
  p_preferred_month date default null,
  p_preferred_mode text default null,
  p_country text default null,
  p_timezone text default null,
  p_lead_creation_channel public.contact_channel default 'website',
  p_current_contact_channel public.contact_channel default 'website',
  p_first_touch_source text default null,
  p_first_touch_medium text default null,
  p_first_touch_campaign text default null,
  p_notes text default null
)
returns public.leads
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_lead public.leads%rowtype;
  v_touchpoint_id uuid;
  v_batch_course_id uuid;
  v_course_id uuid := p_course_id;
begin
  if p_organization_id is null then
    raise exception 'Organization is required to create CRM leads';
  end if;

  if auth.role() <> 'service_role' then
    if auth.uid() is null then
      raise exception 'Not authenticated';
    end if;

    if not public.can_manage_sales_workspace(p_organization_id) then
      raise exception 'Not authorized to create CRM leads for this organization';
    end if;
  end if;

  if p_preferred_batch_id is not null then
    select cb.course_id into v_batch_course_id
    from public.course_batches cb
    where cb.id=p_preferred_batch_id
      and cb.organization_id=p_organization_id
      and cb.active=true;

    if v_batch_course_id is null then
      raise exception 'Selected batch does not exist, is inactive, or belongs to another organization';
    end if;

    if v_course_id is null then
      v_course_id := v_batch_course_id;
    elsif v_course_id <> v_batch_course_id then
      raise exception 'Selected batch does not belong to the selected course';
    end if;
  end if;

  if v_course_id is not null
     and not exists (
       select 1 from public.courses c
       where c.id=v_course_id and c.organization_id=p_organization_id
     ) then
    raise exception 'Selected course does not belong to this organization';
  end if;

  insert into public.leads(
    organization_id,first_name,last_name,display_name,interested_course_id,preferred_batch_id,
    preferred_location,preferred_month,preferred_mode,country,timezone,lead_creation_channel,
    current_contact_channel,owner_user_id,notes
  ) values(
    p_organization_id,
    nullif(trim(p_first_name),''),
    nullif(trim(p_last_name),''),
    nullif(trim(concat_ws(' ',p_first_name,p_last_name)),''),
    v_course_id,
    p_preferred_batch_id,
    nullif(trim(p_preferred_location),''),
    p_preferred_month,
    nullif(trim(p_preferred_mode),''),
    nullif(trim(p_country),''),
    nullif(trim(p_timezone),''),
    p_lead_creation_channel,
    p_current_contact_channel,
    case when auth.role()='service_role' then null else auth.uid() end,
    nullif(trim(p_notes),'')
  ) returning * into v_lead;

  if nullif(trim(p_email),'') is not null then
    insert into public.lead_contacts(
      organization_id,lead_id,contact_type,value,normalized_value,is_primary
    ) values(
      p_organization_id,v_lead.id,'email',trim(p_email),lower(trim(p_email)),true
    );
  end if;

  if nullif(trim(p_phone),'') is not null then
    insert into public.lead_contacts(
      organization_id,lead_id,contact_type,value,normalized_value,is_primary
    ) values(
      p_organization_id,v_lead.id,'phone',trim(p_phone),regexp_replace(p_phone,'[^0-9+]','','g'),
      nullif(trim(p_email),'') is null
    );
  end if;

  perform public.resolve_person_for_lead(v_lead.id,'crm_manual');

  if p_first_touch_source is not null or p_first_touch_campaign is not null then
    insert into public.touchpoints(
      organization_id,lead_id,occurred_at,source,medium,campaign_name,channel,event_type,
      utm_source,utm_medium,utm_campaign,metadata
    ) values(
      p_organization_id,v_lead.id,now(),p_first_touch_source,p_first_touch_medium,p_first_touch_campaign,
      p_lead_creation_channel,'lead_created',p_first_touch_source,p_first_touch_medium,p_first_touch_campaign,
      jsonb_build_object('created_by','create_crm_lead_v2')
    ) returning id into v_touchpoint_id;

    insert into public.lead_attribution(
      lead_id,first_touchpoint_id,last_touchpoint_id,lead_creation_touchpoint_id,
      first_touch_source,first_touch_medium,first_touch_campaign,
      last_touch_source,last_touch_medium,last_touch_campaign,
      lead_creation_source,lead_creation_medium,lead_creation_campaign,
      updated_at
    ) values(
      v_lead.id,v_touchpoint_id,v_touchpoint_id,v_touchpoint_id,
      p_first_touch_source,p_first_touch_medium,p_first_touch_campaign,
      p_first_touch_source,p_first_touch_medium,p_first_touch_campaign,
      p_first_touch_source,p_first_touch_medium,p_first_touch_campaign,
      now()
    )
    on conflict (lead_id) do update set
      first_touchpoint_id=coalesce(public.lead_attribution.first_touchpoint_id,excluded.first_touchpoint_id),
      last_touchpoint_id=excluded.last_touchpoint_id,
      lead_creation_touchpoint_id=coalesce(public.lead_attribution.lead_creation_touchpoint_id,excluded.lead_creation_touchpoint_id),
      first_touch_source=coalesce(public.lead_attribution.first_touch_source,excluded.first_touch_source),
      first_touch_medium=coalesce(public.lead_attribution.first_touch_medium,excluded.first_touch_medium),
      first_touch_campaign=coalesce(public.lead_attribution.first_touch_campaign,excluded.first_touch_campaign),
      last_touch_source=excluded.last_touch_source,
      last_touch_medium=excluded.last_touch_medium,
      last_touch_campaign=excluded.last_touch_campaign,
      lead_creation_source=coalesce(public.lead_attribution.lead_creation_source,excluded.lead_creation_source),
      lead_creation_medium=coalesce(public.lead_attribution.lead_creation_medium,excluded.lead_creation_medium),
      lead_creation_campaign=coalesce(public.lead_attribution.lead_creation_campaign,excluded.lead_creation_campaign),
      updated_at=now();
  else
    insert into public.lead_attribution(lead_id)
    values(v_lead.id)
    on conflict (lead_id) do nothing;
  end if;

  insert into public.activities(
    lead_id,activity_type,channel,actor_type,actor_id,title,details
  ) values(
    v_lead.id,'lead_created',p_lead_creation_channel,'human',
    case when auth.role()='service_role' then 'service_role' else auth.uid()::text end,
    'Lead created',
    case when auth.role()='service_role' then 'Created through trusted server ingestion' else 'Created manually in CRM' end
  );

  return v_lead;
end;
$$;

commit;
