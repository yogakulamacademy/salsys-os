begin;

insert into public.tracking_event_contracts(
  organization_id,event_name,schema_version,family_key,status,required_fields,processing_config,metadata
)
values
  (null,'lead.submitted',1,'lead','active',array[]::text[],jsonb_build_object('processor','process_tracking_raw_event_v1','action','upsert_lead'),jsonb_build_object('system_contract',true)),
  (null,'lead.form_submitted',1,'lead','active',array[]::text[],jsonb_build_object('processor','process_tracking_raw_event_v1','action','upsert_lead'),jsonb_build_object('system_contract',true)),
  (null,'lead.captured',1,'lead','active',array[]::text[],jsonb_build_object('processor','process_tracking_raw_event_v1','action','upsert_lead'),jsonb_build_object('system_contract',true))
on conflict do nothing;

create or replace function public.ingest_external_lead_from_raw_event_v1(
  p_organization_id uuid,
  p_raw_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_raw public.raw_events%rowtype;
  v_source public.tracking_sources%rowtype;
  v_payload jsonb;
  v_identity jsonb;
  v_lead_data jsonb;
  v_attr jsonb;
  v_email text;
  v_phone text;
  v_email_norm text;
  v_phone_norm text;
  v_first_name text;
  v_last_name text;
  v_country text;
  v_timezone text;
  v_course_code text;
  v_course_id uuid;
  v_location text;
  v_mode text;
  v_month date;
  v_message text;
  v_email_lead uuid;
  v_phone_lead uuid;
  v_target_lead uuid;
  v_lead public.leads%rowtype;
  v_existing public.lead_ingest_events%rowtype;
  v_matched_existing boolean := false;
  v_channel public.contact_channel := 'other';
  v_source_name text;
  v_medium text;
  v_campaign text;
  v_content text;
  v_term text;
  v_landing text;
  v_referrer text;
  v_touchpoint_id uuid;
  v_session_id uuid;
  v_session_match boolean := false;
begin
  if p_organization_id is null or p_raw_event_id is null then
    raise exception 'organization_id and raw_event_id are required';
  end if;

  select re.* into v_raw
  from public.raw_events re
  where re.id=p_raw_event_id
    and re.organization_id=p_organization_id
  for update;

  if v_raw.id is null then
    raise exception 'tenant-owned raw event not found';
  end if;

  if v_raw.event_family is distinct from 'lead'
     or v_raw.source_event_type not in ('lead.submitted','lead.form_submitted','lead.captured') then
    raise exception 'raw event is not a supported external lead submission';
  end if;

  if coalesce((v_raw.metadata->>'accepted_for_processing')::boolean,true) is not true then
    return jsonb_build_object('ok',false,'processed',false,'reason','raw_event_not_accepted');
  end if;

  select s.* into v_source
  from public.tracking_sources s
  where s.id=v_raw.tracking_source_id
    and s.organization_id=p_organization_id
    and s.status='active';

  if v_source.id is null then
    raise exception 'active tenant tracking source not found';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('lead-ingest-event:' || p_organization_id::text || ':' || v_source.source_system || ':' || v_raw.source_event_id,0)
  );

  select lie.* into v_existing
  from public.lead_ingest_events lie
  where lie.organization_id=p_organization_id
    and lie.source_system=v_source.source_system
    and lie.external_event_id=v_raw.source_event_id
  limit 1;

  if v_existing.id is not null then
    return jsonb_build_object(
      'ok',true,'processed',true,'duplicate_event',true,'created',false,
      'matched_existing',v_existing.matched_existing,'lead_id',v_existing.lead_id,
      'organization_id',p_organization_id
    );
  end if;

  v_payload := case when jsonb_typeof(v_raw.payload)='object' then v_raw.payload else '{}'::jsonb end;
  v_identity := case when jsonb_typeof(v_payload->'identity')='object' then v_payload->'identity' else '{}'::jsonb end;
  v_lead_data := case when jsonb_typeof(v_payload->'lead')='object' then v_payload->'lead' else '{}'::jsonb end;
  v_attr := case
    when jsonb_typeof(v_payload->'attribution')='object' then v_payload->'attribution'
    when jsonb_typeof(v_payload->'sessionTouch')='object' then v_payload->'sessionTouch'
    else '{}'::jsonb
  end;

  v_email := nullif(
    lower(btrim(coalesce(v_identity->>'email',v_payload->>'email',''))),
    ''
  );
  v_phone := nullif(
    btrim(coalesce(v_identity->>'phone',v_identity->>'whatsapp',v_payload->>'phone',v_payload->>'whatsapp','')),
    ''
  );
  v_email_norm := v_email;
  v_phone_norm := nullif(regexp_replace(coalesce(v_phone,''),'[^0-9+]','','g'),'');

  if v_email_norm is null and v_phone_norm is null then
    raise exception 'lead submission requires at least email or phone identity';
  end if;

  v_first_name := nullif(
    btrim(coalesce(v_identity->>'first_name',v_identity->>'firstName',v_payload->>'first_name',v_payload->>'firstName','')),
    ''
  );
  v_last_name := nullif(
    btrim(coalesce(v_identity->>'last_name',v_identity->>'lastName',v_payload->>'last_name',v_payload->>'lastName','')),
    ''
  );
  v_country := nullif(btrim(coalesce(v_identity->>'country',v_payload->>'country','')),'');
  v_timezone := nullif(btrim(coalesce(v_identity->>'timezone',v_payload->>'timezone','')),'');
  v_course_code := nullif(
    btrim(coalesce(v_lead_data->>'course_code',v_lead_data->>'courseCode',v_payload->>'course_code',v_payload->>'courseCode','')),
    ''
  );
  v_location := nullif(
    btrim(coalesce(v_lead_data->>'preferred_location',v_lead_data->>'preferredLocation',v_payload->>'preferred_location',v_payload->>'preferredLocation','')),
    ''
  );
  v_mode := nullif(
    btrim(coalesce(v_lead_data->>'preferred_mode',v_lead_data->>'preferredMode',v_payload->>'preferred_mode',v_payload->>'preferredMode','')),
    ''
  );
  v_message := nullif(btrim(coalesce(v_lead_data->>'message',v_payload->>'message','')),'');

  begin
    v_month := nullif(
      btrim(coalesce(v_lead_data->>'preferred_month',v_lead_data->>'preferredMonth',v_payload->>'preferred_month',v_payload->>'preferredMonth','')),
      ''
    )::date;
  exception when others then
    v_month := null;
  end;

  if v_source.source_type='website' then
    v_channel := 'website';
  elsif lower(v_source.source_system) like '%instagram%' then
    v_channel := 'instagram';
  elsif lower(v_source.source_system) like '%whatsapp%' then
    v_channel := 'whatsapp';
  elsif lower(v_source.source_system) like '%meta%' then
    v_channel := 'meta_lead_form';
  elsif lower(v_source.source_system) like '%email%' then
    v_channel := 'email';
  end if;

  v_source_name := nullif(btrim(coalesce(v_attr->>'source',v_payload->>'utm_source',v_raw.context->>'utm_source',v_source.source_system)),'');
  v_medium := nullif(btrim(coalesce(v_attr->>'medium',v_payload->>'utm_medium',v_raw.context->>'utm_medium','')),'');
  v_campaign := nullif(btrim(coalesce(v_attr->>'campaign',v_attr->>'campaign_name',v_payload->>'utm_campaign',v_raw.context->>'utm_campaign','')),'');
  v_content := nullif(btrim(coalesce(v_attr->>'content',v_payload->>'utm_content',v_raw.context->>'utm_content','')),'');
  v_term := nullif(btrim(coalesce(v_attr->>'term',v_payload->>'utm_term',v_raw.context->>'utm_term','')),'');
  v_landing := nullif(btrim(coalesce(v_payload->>'landing_page',v_payload->>'pageUrl',v_raw.context->>'landing_page','')),'');
  v_referrer := nullif(btrim(coalesce(v_payload->>'referrer',v_raw.context->>'referrer','')),'');

  if v_course_code is not null then
    select c.id into v_course_id
    from public.courses c
    where c.organization_id=p_organization_id
      and c.code=v_course_code
      and c.active=true
    limit 1;
  end if;

  if v_email_norm is not null then
    perform pg_advisory_xact_lock(hashtextextended('lead-identity:' || p_organization_id::text || ':email:' || v_email_norm,0));
  end if;
  if v_phone_norm is not null then
    perform pg_advisory_xact_lock(hashtextextended('lead-identity:' || p_organization_id::text || ':telephone:' || v_phone_norm,0));
  end if;

  if v_email_norm is not null then
    select lc.lead_id into v_email_lead
    from public.lead_contacts lc
    where lc.organization_id=p_organization_id
      and lc.contact_type='email'
      and lc.normalized_value=v_email_norm
    limit 1;
  end if;

  if v_phone_norm is not null then
    select lc.lead_id into v_phone_lead
    from public.lead_contacts lc
    where lc.organization_id=p_organization_id
      and lc.contact_type in ('phone','whatsapp')
      and lc.normalized_value=v_phone_norm
    order by case when lc.contact_type='whatsapp' then 0 else 1 end
    limit 1;
  end if;

  if v_email_lead is not null and v_phone_lead is not null and v_email_lead<>v_phone_lead then
    insert into public.lead_ingest_events(
      organization_id,source_system,external_event_id,lead_id,site,form_name,matched_existing,status,metadata
    )
    values(
      p_organization_id,v_source.source_system,v_raw.source_event_id,v_email_lead,v_raw.site,v_raw.source_event_type,true,'failed',
      jsonb_build_object(
        'raw_event_id',v_raw.id,
        'tracking_source_id',v_source.id,
        'reason','deterministic_identity_conflict',
        'email_lead_id',v_email_lead,
        'phone_lead_id',v_phone_lead
      )
    )
    on conflict (organization_id,source_system,external_event_id) do nothing;

    return jsonb_build_object(
      'ok',false,'processed',false,'reason','deterministic_identity_conflict',
      'email_lead_id',v_email_lead,'phone_lead_id',v_phone_lead,
      'organization_id',p_organization_id
    );
  end if;

  v_target_lead := coalesce(v_email_lead,v_phone_lead);

  if v_target_lead is null then
    v_lead := public.create_crm_lead(
      p_organization_id,
      v_first_name,
      v_last_name,
      v_email,
      v_phone,
      v_course_id,
      null,
      v_location,
      v_month,
      v_mode,
      v_country,
      v_timezone,
      v_channel,
      v_channel,
      v_source_name,
      v_medium,
      v_campaign,
      v_message
    );
    v_target_lead := v_lead.id;
    v_matched_existing := false;

    update public.leads
    set lead_origin=coalesce(lead_origin,v_source.source_system),
        landing_page=coalesce(landing_page,v_landing),
        metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
          'latest_tracking_source_id',v_source.id,
          'latest_source_event_id',v_raw.source_event_id,
          'latest_raw_event_id',v_raw.id
        ),
        updated_at=now()
    where id=v_target_lead and organization_id=p_organization_id;
  else
    v_matched_existing := true;

    update public.leads l
    set first_name=coalesce(v_first_name,l.first_name),
        last_name=coalesce(v_last_name,l.last_name),
        display_name=coalesce(nullif(btrim(concat_ws(' ',v_first_name,v_last_name)),''),l.display_name),
        interested_course_id=coalesce(v_course_id,l.interested_course_id),
        preferred_location=coalesce(v_location,l.preferred_location),
        preferred_month=coalesce(v_month,l.preferred_month),
        preferred_mode=coalesce(v_mode,l.preferred_mode),
        country=coalesce(v_country,l.country),
        timezone=coalesce(v_timezone,l.timezone),
        current_contact_channel=v_channel,
        notes=case
          when v_message is not null and (l.notes is null or position(v_message in l.notes)=0)
            then concat_ws(E'\n',nullif(l.notes,''),v_message)
          else l.notes
        end,
        metadata=coalesce(l.metadata,'{}'::jsonb) || jsonb_build_object(
          'latest_tracking_source_id',v_source.id,
          'latest_source_event_id',v_raw.source_event_id,
          'latest_raw_event_id',v_raw.id,
          'reengaged_at',coalesce(v_raw.occurred_at,v_raw.received_at,now())
        ),
        updated_at=now()
    where l.id=v_target_lead and l.organization_id=p_organization_id
    returning l.* into v_lead;

    if v_email_norm is not null then
      insert into public.lead_contacts(organization_id,lead_id,contact_type,value,normalized_value,is_primary)
      values(
        p_organization_id,v_target_lead,'email',v_email,v_email_norm,
        not exists(
          select 1 from public.lead_contacts x
          where x.organization_id=p_organization_id and x.lead_id=v_target_lead and x.is_primary=true
        )
      )
      on conflict (organization_id,contact_type,normalized_value) do nothing;
    end if;

    if v_phone_norm is not null then
      insert into public.lead_contacts(organization_id,lead_id,contact_type,value,normalized_value,is_primary)
      values(
        p_organization_id,v_target_lead,'phone',v_phone,v_phone_norm,
        not exists(
          select 1 from public.lead_contacts x
          where x.organization_id=p_organization_id and x.lead_id=v_target_lead and x.is_primary=true
        )
      )
      on conflict (organization_id,contact_type,normalized_value) do nothing;
    end if;

    perform public.resolve_person_for_lead(v_target_lead,v_source.source_system);
  end if;

  if v_raw.session_key is not null then
    select ws.id into v_session_id
    from public.web_sessions ws
    where ws.organization_id=p_organization_id
      and ws.session_key=v_raw.session_key
      and (v_raw.anonymous_visitor_id is null or ws.anonymous_visitor_id=v_raw.anonymous_visitor_id)
    limit 1;

    if v_session_id is not null then
      v_session_match := true;

      update public.web_sessions
      set lead_id=v_target_lead,
          last_seen_at=greatest(coalesce(last_seen_at,started_at),now())
      where id=v_session_id and organization_id=p_organization_id;

      if v_raw.anonymous_visitor_id is not null then
        insert into public.visitor_identity_links(
          organization_id,anonymous_visitor_id,lead_id,last_session_key,source_system,linked_at,metadata
        )
        values(
          p_organization_id,v_raw.anonymous_visitor_id,v_target_lead,v_raw.session_key,v_source.source_system,now(),
          jsonb_build_object('raw_event_id',v_raw.id,'tracking_source_id',v_source.id,'identity_scope','exact_session')
        )
        on conflict (organization_id,anonymous_visitor_id)
        do update set
          lead_id=excluded.lead_id,
          last_session_key=excluded.last_session_key,
          source_system=excluded.source_system,
          linked_at=excluded.linked_at,
          metadata=coalesce(public.visitor_identity_links.metadata,'{}'::jsonb) || excluded.metadata
        where public.visitor_identity_links.organization_id=excluded.organization_id;
      end if;

      perform public.resolve_person_for_lead(v_target_lead,v_source.source_system);
    end if;
  end if;

  insert into public.touchpoints(
    organization_id,event_id,lead_id,web_session_id,anonymous_visitor_id,occurred_at,
    source,medium,campaign_name,content,term,platform,channel,landing_page,referrer,event_type,
    utm_source,utm_medium,utm_campaign,utm_content,utm_term,
    gclid,gbraid,wbraid,fbclid,metadata
  )
  values(
    p_organization_id,
    v_source.source_system || ':' || v_raw.source_event_id,
    v_target_lead,v_session_id,v_raw.anonymous_visitor_id,
    coalesce(v_raw.occurred_at,v_raw.received_at,now()),
    v_source_name,v_medium,v_campaign,v_content,v_term,v_source.source_system,v_channel,v_landing,v_referrer,v_raw.source_event_type,
    v_source_name,v_medium,v_campaign,v_content,v_term,
    nullif(coalesce(v_attr->>'gclid',v_payload->>'gclid'),''),
    nullif(coalesce(v_attr->>'gbraid',v_payload->>'gbraid'),''),
    nullif(coalesce(v_attr->>'wbraid',v_payload->>'wbraid'),''),
    nullif(coalesce(v_attr->>'fbclid',v_payload->>'fbclid'),''),
    jsonb_build_object('raw_event_id',v_raw.id,'tracking_source_id',v_source.id,'lead_ingest_v1',true)
  )
  on conflict (organization_id,event_id) do nothing
  returning id into v_touchpoint_id;

  perform public.refresh_lead_attribution_internal(v_target_lead);

  insert into public.lead_ingest_events(
    organization_id,source_system,external_event_id,lead_id,site,form_name,matched_existing,status,metadata
  )
  values(
    p_organization_id,v_source.source_system,v_raw.source_event_id,v_target_lead,v_raw.site,v_raw.source_event_type,
    v_matched_existing,'processed',
    jsonb_build_object(
      'raw_event_id',v_raw.id,
      'tracking_source_id',v_source.id,
      'event_family',v_raw.event_family,
      'session_attached',v_session_match,
      'touchpoint_id',v_touchpoint_id
    )
  )
  on conflict (organization_id,source_system,external_event_id) do nothing;

  return jsonb_build_object(
    'ok',true,'processed',true,'duplicate_event',false,
    'created',not v_matched_existing,'matched_existing',v_matched_existing,
    'lead_id',v_target_lead,'organization_id',p_organization_id,
    'session_attached',v_session_match,'touchpoint_id',v_touchpoint_id
  );
end;
$$;

create or replace function public.process_tracking_raw_event_v1(
  p_organization_id uuid,
  p_raw_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_raw public.raw_events%rowtype;
  v_processing public.raw_event_processing%rowtype;
  v_result jsonb;
  v_attempt integer;
  v_error text;
begin
  select re.* into v_raw
  from public.raw_events re
  where re.id=p_raw_event_id and re.organization_id=p_organization_id;

  if v_raw.id is null then
    return jsonb_build_object('ok',false,'reason','raw_event_not_found');
  end if;

  select rp.* into v_processing
  from public.raw_event_processing rp
  where rp.raw_event_id=p_raw_event_id and rp.organization_id=p_organization_id
  for update;

  if v_processing.status='processed' then
    return jsonb_build_object('ok',true,'processed',true,'idempotent_reuse',true,'raw_event_id',p_raw_event_id);
  end if;

  if v_processing.status='ignored' then
    return jsonb_build_object('ok',true,'processed',false,'ignored',true,'raw_event_id',p_raw_event_id,'reason',v_processing.processing_error);
  end if;

  begin
    if v_raw.event_family='lead'
       and v_raw.source_event_type in ('lead.submitted','lead.form_submitted','lead.captured') then
      v_result := public.ingest_external_lead_from_raw_event_v1(p_organization_id,p_raw_event_id);

      if coalesce((v_result->>'ok')::boolean,false) is not true then
        raise exception '%',coalesce(v_result->>'reason','lead_processor_failed');
      end if;
    elsif v_raw.event_family='web' and v_raw.source_system='website' then
      v_result := public.process_website_raw_event(p_organization_id,p_raw_event_id);
    else
      update public.raw_event_processing
      set status='ignored',
          processor_name='tracking_dispatcher_v1',
          processor_version='v1',
          processing_error='no_automatic_processor_for_event',
          processing_metadata=coalesce(processing_metadata,'{}'::jsonb) || jsonb_build_object(
            'event_family',v_raw.event_family,
            'event_type',v_raw.source_event_type
          ),
          processed_at=coalesce(processed_at,now()),
          updated_at=now()
      where raw_event_id=p_raw_event_id and organization_id=p_organization_id;

      return jsonb_build_object(
        'ok',true,'processed',false,'ignored',true,
        'reason','no_automatic_processor_for_event','raw_event_id',p_raw_event_id
      );
    end if;

    update public.raw_event_processing
    set status='processed',
        attempt_count=attempt_count+1,
        last_attempt_at=now(),
        processed_at=now(),
        next_retry_at=null,
        processor_name='tracking_dispatcher_v1',
        processor_version='v1',
        processing_error=null,
        processing_metadata=coalesce(processing_metadata,'{}'::jsonb) || jsonb_build_object('result',coalesce(v_result,'{}'::jsonb)),
        updated_at=now()
    where raw_event_id=p_raw_event_id and organization_id=p_organization_id;

    return jsonb_build_object('ok',true,'processed',true,'raw_event_id',p_raw_event_id,'result',v_result);
  exception when others then
    v_error := left(sqlerrm,1000);

    select attempt_count+1 into v_attempt
    from public.raw_event_processing
    where raw_event_id=p_raw_event_id and organization_id=p_organization_id;

    update public.raw_event_processing
    set status=case when coalesce(v_attempt,1)>=3 then 'dead_letter' else 'failed' end,
        attempt_count=coalesce(v_attempt,1),
        last_attempt_at=now(),
        next_retry_at=case
          when coalesce(v_attempt,1)>=3 then null
          else now() + make_interval(secs => least(900,30 * power(2,greatest(coalesce(v_attempt,1)-1,0)))::double precision)
        end,
        processor_name='tracking_dispatcher_v1',
        processor_version='v1',
        processing_error=v_error,
        processing_metadata=coalesce(processing_metadata,'{}'::jsonb) || jsonb_build_object(
          'event_family',v_raw.event_family,
          'event_type',v_raw.source_event_type
        ),
        updated_at=now()
    where raw_event_id=p_raw_event_id and organization_id=p_organization_id;

    return jsonb_build_object(
      'ok',false,'processed',false,'raw_event_id',p_raw_event_id,
      'reason','processing_failed','error',v_error,
      'attempt_count',coalesce(v_attempt,1),
      'dead_letter',coalesce(v_attempt,1)>=3
    );
  end;
end;
$$;

grant execute on function public.ingest_external_lead_from_raw_event_v1(uuid,uuid) to service_role;
grant execute on function public.process_tracking_raw_event_v1(uuid,uuid) to service_role;

commit;
