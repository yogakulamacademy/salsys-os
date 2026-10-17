begin;

create or replace function public.test_smart_identity_engine_v1(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_tag text := 'identity-self-test-'||replace(gen_random_uuid()::text,'-','');
  v_person_email uuid;
  v_person_amb_email uuid;
  v_person_amb_phone uuid;
  v_person_whatsapp uuid;
  v_lead_new uuid;
  v_lead_auto uuid;
  v_lead_ambiguous uuid;
  v_lead_verified uuid;
  v_new_result jsonb;
  v_auto_result jsonb;
  v_ambiguous_result jsonb;
  v_verified_result jsonb;
  v_new_person uuid;
  v_ambiguous_person uuid;
  v_amb_email text;
  v_amb_phone text;
  v_verified_phone text;
  v_ok boolean;
begin
  if not exists(select 1 from public.organizations where id=p_organization_id) then
    raise exception 'Organization not found';
  end if;

  insert into public.persons(organization_id,status,metadata)
  values(p_organization_id,'active',jsonb_build_object('self_test',v_tag,'role','email_candidate'))
  returning id into v_person_email;

  insert into public.persons(organization_id,status,metadata)
  values(p_organization_id,'active',jsonb_build_object('self_test',v_tag,'role','amb_email_candidate'))
  returning id into v_person_amb_email;

  insert into public.persons(organization_id,status,metadata)
  values(p_organization_id,'active',jsonb_build_object('self_test',v_tag,'role','amb_phone_candidate'))
  returning id into v_person_amb_phone;

  insert into public.persons(organization_id,status,metadata)
  values(p_organization_id,'active',jsonb_build_object('self_test',v_tag,'role','verified_whatsapp_candidate'))
  returning id into v_person_whatsapp;

  v_amb_email := v_tag||'-amb@example.test';
  v_amb_phone := '+1999'||right(replace(v_person_amb_phone::text,'-',''),8);
  v_verified_phone := '+1888'||right(replace(v_person_whatsapp::text,'-',''),8);

  insert into public.person_identifiers(organization_id,person_id,identifier_type,normalized_value,verified,source_system,confidence,metadata)
  values
    (p_organization_id,v_person_email,'email',v_tag||'@example.test',false,'identity_self_test',0.9200,jsonb_build_object('self_test',v_tag)),
    (p_organization_id,v_person_amb_email,'email',v_amb_email,false,'identity_self_test',0.9200,jsonb_build_object('self_test',v_tag)),
    (p_organization_id,v_person_amb_phone,'phone',v_amb_phone,false,'identity_self_test',0.9400,jsonb_build_object('self_test',v_tag)),
    (p_organization_id,v_person_whatsapp,'whatsapp',v_verified_phone,true,'identity_self_test',1.0000,jsonb_build_object('self_test',v_tag));

  insert into public.leads(organization_id,first_name,display_name,lead_creation_channel,current_contact_channel,metadata)
  values(p_organization_id,'Identity','Self Test New','other','other',jsonb_build_object('self_test',v_tag))
  returning id into v_lead_new;

  insert into public.lead_contacts(organization_id,lead_id,contact_type,value,normalized_value,is_primary,verified,metadata)
  values(p_organization_id,v_lead_new,'email',v_tag||'-new@example.test',v_tag||'-new@example.test',true,false,jsonb_build_object('self_test',v_tag));

  v_new_result := public.resolve_person_for_lead(v_lead_new,'identity_self_test');
  v_new_person := (v_new_result->>'person_id')::uuid;

  insert into public.leads(organization_id,first_name,display_name,lead_creation_channel,current_contact_channel,metadata)
  values(p_organization_id,'Identity','Self Test Auto','other','other',jsonb_build_object('self_test',v_tag))
  returning id into v_lead_auto;

  insert into public.lead_contacts(organization_id,lead_id,contact_type,value,normalized_value,is_primary,verified,metadata)
  values(p_organization_id,v_lead_auto,'email',v_tag||'@example.test',v_tag||'@example.test',true,false,jsonb_build_object('self_test',v_tag));

  v_auto_result := public.resolve_person_for_lead(v_lead_auto,'identity_self_test');

  insert into public.leads(organization_id,first_name,display_name,lead_creation_channel,current_contact_channel,metadata)
  values(p_organization_id,'Identity','Self Test Ambiguous','other','other',jsonb_build_object('self_test',v_tag))
  returning id into v_lead_ambiguous;

  insert into public.lead_contacts(organization_id,lead_id,contact_type,value,normalized_value,is_primary,verified,metadata)
  values
    (p_organization_id,v_lead_ambiguous,'email',v_amb_email,v_amb_email,true,false,jsonb_build_object('self_test',v_tag)),
    (p_organization_id,v_lead_ambiguous,'phone',v_amb_phone,v_amb_phone,false,false,jsonb_build_object('self_test',v_tag));

  v_ambiguous_result := public.resolve_person_for_lead(v_lead_ambiguous,'identity_self_test');
  v_ambiguous_person := (v_ambiguous_result->>'person_id')::uuid;

  insert into public.leads(organization_id,first_name,display_name,lead_creation_channel,current_contact_channel,metadata)
  values(p_organization_id,'Identity','Self Test Verified','other','other',jsonb_build_object('self_test',v_tag))
  returning id into v_lead_verified;

  insert into public.lead_contacts(organization_id,lead_id,contact_type,value,normalized_value,is_primary,verified,metadata)
  values(p_organization_id,v_lead_verified,'whatsapp',v_verified_phone,v_verified_phone,true,true,jsonb_build_object('self_test',v_tag));

  v_verified_result := public.resolve_person_for_lead(v_lead_verified,'identity_self_test');

  v_ok :=
    v_new_result->>'decision'='new_person'
    and v_new_person is not null
    and v_new_person<>v_person_email
    and v_auto_result->>'decision'='auto_link'
    and (v_auto_result->>'person_id')::uuid=v_person_email
    and coalesce((v_auto_result->>'confidence')::numeric,0)>=0.9000
    and v_ambiguous_result->>'decision'='ambiguous_isolate'
    and v_ambiguous_person is not null
    and v_ambiguous_person<>v_person_amb_email
    and v_ambiguous_person<>v_person_amb_phone
    and exists(
      select 1 from public.identity_resolution_conflicts c
      where c.organization_id=p_organization_id
        and c.lead_id=v_lead_ambiguous
        and c.conflict_type='smart_identity_ambiguous_candidates'
        and c.status='open'
    )
    and v_verified_result->>'decision'='auto_link'
    and (v_verified_result->>'person_id')::uuid=v_person_whatsapp
    and coalesce((v_verified_result->>'confidence')::numeric,0)>=0.9900;

  delete from public.identity_resolution_evaluations e
  using public.leads l
  where e.organization_id=p_organization_id
    and e.lead_id=l.id
    and l.organization_id=p_organization_id
    and l.metadata->>'self_test'=v_tag;

  delete from public.identity_resolution_conflicts c
  using public.leads l
  where c.organization_id=p_organization_id
    and c.lead_id=l.id
    and l.organization_id=p_organization_id
    and l.metadata->>'self_test'=v_tag;

  delete from public.person_leads pl
  using public.leads l
  where pl.organization_id=p_organization_id
    and pl.lead_id=l.id
    and l.organization_id=p_organization_id
    and l.metadata->>'self_test'=v_tag;

  delete from public.person_sessions ps
  using public.persons p
  where ps.organization_id=p_organization_id
    and ps.person_id=p.id
    and p.organization_id=p_organization_id
    and p.metadata->>'self_test'=v_tag;

  delete from public.leads
  where organization_id=p_organization_id
    and metadata->>'self_test'=v_tag;

  delete from public.persons
  where organization_id=p_organization_id
    and metadata->>'self_test'=v_tag;

  return jsonb_build_object(
    'ok',v_ok,
    'new_person_decision',v_new_result->>'decision',
    'email_auto_link_decision',v_auto_result->>'decision',
    'email_auto_link_score',v_auto_result->'confidence',
    'ambiguous_decision',v_ambiguous_result->>'decision',
    'ambiguous_candidate_count',v_ambiguous_result->'candidate_person_count',
    'verified_whatsapp_decision',v_verified_result->>'decision',
    'verified_whatsapp_score',v_verified_result->'confidence',
    'cleanup_complete',not exists(select 1 from public.leads where organization_id=p_organization_id and metadata->>'self_test'=v_tag)
  );
exception
  when others then
    delete from public.identity_resolution_evaluations e using public.leads l
      where e.organization_id=p_organization_id and e.lead_id=l.id and l.organization_id=p_organization_id and l.metadata->>'self_test'=v_tag;
    delete from public.identity_resolution_conflicts c using public.leads l
      where c.organization_id=p_organization_id and c.lead_id=l.id and l.organization_id=p_organization_id and l.metadata->>'self_test'=v_tag;
    delete from public.person_leads pl using public.leads l
      where pl.organization_id=p_organization_id and pl.lead_id=l.id and l.organization_id=p_organization_id and l.metadata->>'self_test'=v_tag;
    delete from public.person_sessions ps using public.persons p
      where ps.organization_id=p_organization_id and ps.person_id=p.id and p.organization_id=p_organization_id and p.metadata->>'self_test'=v_tag;
    delete from public.leads where organization_id=p_organization_id and metadata->>'self_test'=v_tag;
    delete from public.persons where organization_id=p_organization_id and metadata->>'self_test'=v_tag;
    raise;
end;
$$;

commit;