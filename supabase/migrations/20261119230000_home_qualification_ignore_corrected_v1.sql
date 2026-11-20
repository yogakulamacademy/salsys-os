-- Home qualification snapshot: ignore automatic stage moves that were later
-- corrected (19 Nov 2026: 165 leads were wrongly moved to Qualified from
-- shared-post captions and reverted with changed_by_id 'ai_stage_v1_correction').
-- Same signature, security and grants; only the reached_qualified rule changes.

create or replace function public.get_home_v1_qualification_snapshot(
  p_organization_id uuid,
  p_start timestamptz,
  p_end_exclusive timestamptz
)
returns jsonb
language plpgsql stable security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_result jsonb;
begin
  if p_organization_id is null
     or p_start is null
     or p_end_exclusive is null
     or p_end_exclusive <= p_start
     or p_end_exclusive - p_start > interval '366 days'
  then
    raise exception 'invalid Home reporting period' using errcode = '22023';
  end if;

  if (
    auth.role() = 'service_role'
    or (
      auth.role() = 'authenticated'
      and public.has_organization_role(
        p_organization_id,
        array['owner','admin','manager']::text[]
      )
      and public.session_is_bound_to_organization(p_organization_id)
      -- A sole-membership fallback in older recovery schemas must never
      -- substitute for a real tenant-session binding on executive RPCs.
      and exists (
        select 1
        from public.tenant_session_bindings binding
        join public.organizations org
          on org.id = binding.organization_id
         and org.status = 'active'
        where binding.organization_id = p_organization_id
          and binding.user_id = auth.uid()
          and binding.session_id = nullif(auth.jwt()->>'session_id','')::uuid
      )
    )
  ) is distinct from true then
    raise exception 'not authorized for Home qualification'
      using errcode = '42501';
  end if;

  with cohort as materialized (
    select
      l.id,
      coalesce(nullif(trim(l.first_touch_source), ''), 'Unknown') as source
    from public.leads l
    where l.organization_id = p_organization_id
      and l.status <> 'archived'::lead_status
      and l.created_at >= p_start
      and l.created_at < p_end_exclusive
  ),
  scored as materialized (
    select c.id, c.source,
      exists (
        select 1 from public.lead_stage_history h
        where h.lead_id = c.id
          and h.changed_at < p_end_exclusive
      ) as has_history,
      exists (
        select 1 from public.lead_stage_history h
        where h.lead_id = c.id
          and h.changed_at < p_end_exclusive
          and h.to_stage::text in (
            'qualified','high_intent','payment_pending','enrolled'
          )
          -- An automatic stage move that was later corrected (the AI misread
          -- the conversation) never counts as reaching qualification.
          and not (
            h.changed_by_id = 'ai_stage_v1'
            and exists (
              select 1 from public.lead_stage_history c
              where c.lead_id = h.lead_id
                and c.changed_by_id = 'ai_stage_v1_correction'
                and c.changed_at > h.changed_at
            )
          )
      ) as reached_qualified
    from cohort c
  ),
  normalized_sources as (
    select
      case
        when lower(btrim(s.source)) in ('unknown','(not set)','not set') then 'Unknown'
        when lower(btrim(s.source)) in (
          'instagram','ig','instagram.com','www.instagram.com',
          'm.instagram.com','l.instagram.com','ig.me'
        ) then 'Instagram'
        when lower(btrim(s.source)) in (
          'facebook','fb','facebook.com','m.facebook.com',
          'l.facebook.com','www.facebook.com'
        ) then 'Facebook'
        when lower(btrim(s.source)) in (
          'google','google.com','www.google.com',
          'com.google.android.googlequicksearchbox'
        ) then 'Google'
        when lower(btrim(s.source)) in (
          'whatsapp','wa.me','api.whatsapp.com','web.whatsapp.com'
        ) then 'WhatsApp'
        when lower(btrim(s.source)) in (
          'chatgpt','chatgpt.com','chat.openai.com','www.chatgpt.com'
        ) then 'ChatGPT'
        when lower(btrim(s.source)) in ('direct','(direct)') then 'Direct'
        else 'Other sources'
      end as source,
      s.reached_qualified
    from scored s
  ),
  source_rows as (
    select
      s.source,
      count(*)::bigint as leads,
      count(*) filter (where s.reached_qualified)::bigint as qualified
    from normalized_sources s
    group by s.source
  )
  select jsonb_build_object(
    'cohort_leads', (select count(*) from scored),
    'qualified_leads', (
      select count(*) from scored where reached_qualified
    ),
    'history_covered', (
      select count(*) from scored where has_history
    ),
    'sources', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'source', source, 'leads', leads, 'qualified', qualified
          ) order by leads desc, source asc
        ),
        '[]'::jsonb
      )
      from source_rows
    ),
    'basis', 'reached_qualification_milestone_by_period_end'
  ) into v_result;

  return v_result;
end;
$function$;

