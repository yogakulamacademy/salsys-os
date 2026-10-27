begin;

-- Make create_crm_lead explicit about lead_attribution tenant ownership.
-- The existing enforcement trigger remains as defense-in-depth for legacy callers.
do $migration$
declare
  v_signature regprocedure :=
    'public.create_crm_lead(uuid,text,text,text,text,uuid,uuid,text,date,text,text,text,contact_channel,contact_channel,text,text,text,text)'::regprocedure;
  v_definition text;
  v_updated text;
  v_old_full text := 'insert into public.lead_attribution(
      lead_id,first_touchpoint_id,last_touchpoint_id,lead_creation_touchpoint_id,';
  v_new_full text := 'insert into public.lead_attribution(
      lead_id,organization_id,first_touchpoint_id,last_touchpoint_id,lead_creation_touchpoint_id,';
  v_old_full_values text := 'values(
      v_lead.id,v_touchpoint_id,v_touchpoint_id,v_touchpoint_id,';
  v_new_full_values text := 'values(
      v_lead.id,p_organization_id,v_touchpoint_id,v_touchpoint_id,v_touchpoint_id,';
  v_old_minimal text := 'insert into public.lead_attribution(lead_id)
    values(v_lead.id)';
  v_new_minimal text := 'insert into public.lead_attribution(lead_id,organization_id)
    values(v_lead.id,p_organization_id)';
begin
  select pg_get_functiondef(v_signature::oid) into v_definition;
  if v_definition is null then
    raise exception 'Unable to read function definition for %', v_signature;
  end if;

  if position(v_old_full in v_definition) = 0
     or position(v_old_full_values in v_definition) = 0
     or position(v_old_minimal in v_definition) = 0 then
    raise exception 'Expected legacy lead_attribution write shape was not found in %', v_signature;
  end if;

  v_updated := replace(v_definition, v_old_full, v_new_full);
  v_updated := replace(v_updated, v_old_full_values, v_new_full_values);
  v_updated := replace(v_updated, v_old_minimal, v_new_minimal);

  if v_updated = v_definition then
    raise exception 'Tenant-attribution replacement made no change for %', v_signature;
  end if;

  execute v_updated;
end;
$migration$;

commit;
