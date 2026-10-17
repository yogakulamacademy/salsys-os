begin;

create or replace function public.self_test_attribution_state_machine_v1(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_lead_id uuid;
  v_initial_first uuid;
  v_initial_creation uuid;
  v_initial_first_source text;
  v_after_backfill_first uuid;
  v_after_backfill_first_source text;
  v_first_conversion uuid;
  v_first_conversion_source text;
  v_after_second_conversion uuid;
  v_after_second_conversion_source text;
  v_final_state text;
  v_final_last_source text;
  v_transition_count integer;
  v_result jsonb;
  v_marker text := '__salsys_attr_self_test_rollback__';
begin
  if p_organization_id is null then
    raise exception 'organization_id is required';
  end if;

  if not exists (
    select 1 from public.organizations o
    where o.id = p_organization_id
  ) then
    raise exception 'organization does not exist';
  end if;

  begin
    insert into public.leads(
      organization_id,
      first_name,
      display_name,
      lead_creation_channel,
      current_contact_channel,
      metadata
    ) values (
      p_organization_id,
      '__ATTR_SELF_TEST__',
      '__ATTR_SELF_TEST__',
      'website',
      'website',
      jsonb_build_object('self_test','attribution_state_v1')
    ) returning id into v_lead_id;

    insert into public.touchpoints(
      organization_id,
      lead_id,
      occurred_at,
      source,
      medium,
      campaign_name,
      event_type,
      event_id,
      metadata
    ) values (
      p_organization_id,
      v_lead_id,
      now() - interval '1 hour',
      'facebook',
      'paid_social',
      'attr_self_test_acquisition',
      'lead.submitted',
      'attr-self-test-create-' || gen_random_uuid()::text,
      jsonb_build_object('self_test',true)
    );

    select
      la.first_touchpoint_id,
      la.lead_creation_touchpoint_id,
      la.first_touch_source
    into
      v_initial_first,
      v_initial_creation,
      v_initial_first_source
    from public.lead_attribution la
    where la.lead_id = v_lead_id;

    if v_initial_first is null
       or v_initial_creation is null
       or v_initial_first_source is distinct from 'facebook' then
      raise exception 'acquisition did not lock on lead creation';
    end if;

    insert into public.touchpoints(
      organization_id, lead_id, occurred_at, source, medium, campaign_name,
      event_type, event_id, metadata
    ) values (
      p_organization_id, v_lead_id, now(), 'google', 'cpc', 'later_campaign',
      'page_view', 'attr-self-test-later-' || gen_random_uuid()::text,
      jsonb_build_object('self_test',true)
    );

    insert into public.touchpoints(
      organization_id, lead_id, occurred_at, source, medium, campaign_name,
      event_type, event_id, metadata
    ) values (
      p_organization_id, v_lead_id, now() - interval '2 hours', 'organic', 'organic', 'late_backfill',
      'page_view', 'attr-self-test-backfill-' || gen_random_uuid()::text,
      jsonb_build_object('self_test',true)
    );

    select
      la.first_touchpoint_id,
      la.first_touch_source
    into
      v_after_backfill_first,
      v_after_backfill_first_source
    from public.lead_attribution la
    where la.lead_id = v_lead_id;

    if v_after_backfill_first is distinct from v_initial_first
       or v_after_backfill_first_source is distinct from 'facebook' then
      raise exception 'late-arriving touchpoint mutated locked acquisition';
    end if;

    insert into public.touchpoints(
      organization_id, lead_id, occurred_at, source, medium, campaign_name,
      event_type, event_id, metadata
    ) values (
      p_organization_id, v_lead_id, now() + interval '1 hour', 'google', 'cpc', 'conversion_campaign',
      'payment.completed', 'attr-self-test-conversion-1-' || gen_random_uuid()::text,
      jsonb_build_object('self_test',true)
    );

    select
      la.conversion_touchpoint_id,
      la.conversion_source
    into
      v_first_conversion,
      v_first_conversion_source
    from public.lead_attribution la
    where la.lead_id = v_lead_id;

    if v_first_conversion is null
       or v_first_conversion_source is distinct from 'google' then
      raise exception 'first conversion did not lock';
    end if;

    insert into public.touchpoints(
      organization_id, lead_id, occurred_at, source, medium, campaign_name,
      event_type, event_id, metadata
    ) values (
      p_organization_id, v_lead_id, now() + interval '2 hours', 'email', 'crm', 'later_conversion',
      'payment.completed', 'attr-self-test-conversion-2-' || gen_random_uuid()::text,
      jsonb_build_object('self_test',true)
    );

    select
      la.conversion_touchpoint_id,
      la.conversion_source,
      la.attribution_state,
      la.last_touch_source
    into
      v_after_second_conversion,
      v_after_second_conversion_source,
      v_final_state,
      v_final_last_source
    from public.lead_attribution la
    where la.lead_id = v_lead_id;

    select count(*) into v_transition_count
    from public.lead_attribution_transitions lat
    where lat.lead_id = v_lead_id;

    if v_after_second_conversion is distinct from v_first_conversion
       or v_after_second_conversion_source is distinct from 'google' then
      raise exception 'later conversion mutated locked conversion';
    end if;

    if v_final_state is distinct from 'converted' then
      raise exception 'attribution state did not reach converted';
    end if;

    if v_final_last_source is distinct from 'email' then
      raise exception 'dynamic last touch did not advance';
    end if;

    if v_transition_count <> 2 then
      raise exception 'expected exactly two attribution state transitions, got %', v_transition_count;
    end if;

    v_result := jsonb_build_object(
      'ok', true,
      'acquisition_locked', true,
      'late_backfill_preserved_acquisition', true,
      'conversion_locked', true,
      'later_conversion_preserved_first_conversion', true,
      'last_touch_remains_dynamic', true,
      'transition_count', v_transition_count,
      'final_state', v_final_state
    );

    raise exception '%', v_marker;
  exception
    when others then
      if sqlerrm <> v_marker then
        raise;
      end if;
  end;

  return v_result;
end;
$$;

revoke all on function public.self_test_attribution_state_machine_v1(uuid) from public, anon, authenticated;
grant execute on function public.self_test_attribution_state_machine_v1(uuid) to service_role;

commit;
