-- PostgreSQL does not provide min(uuid); use array aggregation for unique-candidate selection.
create or replace function public.resolve_privacy_request_subject_v1(
  p_organization_id uuid,
  p_anonymous_visitor_id text default null,
  p_requester_email text default null,
  p_requester_phone text default null
) returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_visitor text:=nullif(btrim(coalesce(p_anonymous_visitor_id,'')),'');
  v_email text:=lower(nullif(btrim(coalesce(p_requester_email,'')),''));
  v_phone text:=regexp_replace(coalesce(p_requester_phone,''),'[^0-9]','','g');
  v_visitor_people uuid[];
  v_email_people uuid[];
  v_phone_people uuid[];
  v_visitor_person uuid;
  v_email_person uuid;
  v_phone_person uuid;
  v_visitor_count integer:=0;
  v_email_count integer:=0;
  v_phone_count integer:=0;
  v_selected uuid;
  v_method text;
  v_confidence numeric:=0;
begin
  if v_visitor is not null then
    select coalesce(array_agg(distinct x.person_id),'{}'::uuid[]) into v_visitor_people
    from (
      select ps.person_id
      from public.web_sessions ws
      join public.person_sessions ps
        on ps.organization_id=ws.organization_id and ps.web_session_id=ws.id
      where ws.organization_id=p_organization_id and ws.anonymous_visitor_id=v_visitor
      union
      select pl.person_id
      from public.web_sessions ws
      join public.person_leads pl
        on pl.organization_id=ws.organization_id and pl.lead_id=ws.lead_id
      where ws.organization_id=p_organization_id and ws.anonymous_visitor_id=v_visitor
    ) x;
    v_visitor_count:=coalesce(cardinality(v_visitor_people),0);
    if v_visitor_count=1 then v_visitor_person:=v_visitor_people[1]; end if;
  end if;

  if v_email is not null then
    select coalesce(array_agg(distinct pi.person_id),'{}'::uuid[]) into v_email_people
    from public.person_identifiers pi
    where pi.organization_id=p_organization_id
      and pi.identifier_type='email'
      and lower(pi.normalized_value)=v_email;
    v_email_count:=coalesce(cardinality(v_email_people),0);
    if v_email_count=1 then v_email_person:=v_email_people[1]; end if;
  end if;

  if length(v_phone)>=8 then
    select coalesce(array_agg(distinct pi.person_id),'{}'::uuid[]) into v_phone_people
    from public.person_identifiers pi
    where pi.organization_id=p_organization_id
      and pi.identifier_type in ('phone','whatsapp')
      and regexp_replace(pi.normalized_value,'[^0-9]','','g')=v_phone;
    v_phone_count:=coalesce(cardinality(v_phone_people),0);
    if v_phone_count=1 then v_phone_person:=v_phone_people[1]; end if;
  else
    v_phone:=null;
  end if;

  if (v_visitor_person is not null and v_email_person is not null and v_visitor_person<>v_email_person)
     or (v_visitor_person is not null and v_phone_person is not null and v_visitor_person<>v_phone_person)
     or (v_email_person is not null and v_phone_person is not null and v_email_person<>v_phone_person) then
    return jsonb_build_object(
      'ok',true,'resolved',false,'reason','conflicting_identity_signals',
      'visitor_match_count',v_visitor_count,'email_match_count',v_email_count,'phone_match_count',v_phone_count
    );
  end if;

  if v_visitor_person is not null then
    v_selected:=v_visitor_person;
    v_method:='visitor_session';
    v_confidence:=1.0;
  elsif v_email_person is not null and v_phone_person is not null and v_email_person=v_phone_person then
    v_selected:=v_email_person;
    v_method:='email_phone_corroborated';
    v_confidence:=0.99;
  elsif v_phone_person is not null then
    v_selected:=v_phone_person;
    v_method:='phone_candidate';
    v_confidence:=0.92;
  elsif v_email_person is not null then
    v_selected:=v_email_person;
    v_method:='email_candidate';
    v_confidence:=0.90;
  end if;

  if v_selected is null then
    return jsonb_build_object(
      'ok',true,'resolved',false,'reason','no_unique_candidate',
      'visitor_match_count',v_visitor_count,'email_match_count',v_email_count,'phone_match_count',v_phone_count
    );
  end if;

  return jsonb_build_object(
    'ok',true,'resolved',true,'person_id',v_selected,'resolution_method',v_method,'confidence',v_confidence,
    'visitor_match_count',v_visitor_count,'email_match_count',v_email_count,'phone_match_count',v_phone_count
  );
end;
$$;
