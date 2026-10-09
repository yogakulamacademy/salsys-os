begin;

-- ============================================================
-- FOLLOW-UPS ACTIVE-WORKSPACE TENANT HARDENING
-- ============================================================
--
-- Canonicalizes the live get_followups_workspace RPC, which
-- previously relied only on membership-based RLS and therefore
-- did not isolate a multi-workspace user to the currently
-- selected organization.
--
-- The underlying v_followups_due view already exposes
-- organization_id, uses security_invoker=true, and joins tasks
-- to leads using matching organization_id values.
-- ============================================================


-- ------------------------------------------------------------
-- FOLLOW-UPS VIEW PRIVILEGES
-- ------------------------------------------------------------

alter view public.v_followups_due
set (security_invoker = true);

revoke all privileges on table
  public.v_followups_due
from public, anon, authenticated, service_role;

grant select on table
  public.v_followups_due
to authenticated, service_role;


-- ------------------------------------------------------------
-- REMOVE LEGACY NON-TENANT RPC
-- ------------------------------------------------------------

drop function if exists public.get_followups_workspace(
  integer,
  integer
);


-- ------------------------------------------------------------
-- TENANT-AWARE FOLLOW-UPS WORKSPACE RPC
-- ------------------------------------------------------------

create or replace function public.get_followups_workspace(
  p_organization_id uuid,
  p_page integer default 1,
  p_page_size integer default 50
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, auth, pg_temp
as $function$
declare
  v_result jsonb;
begin
  if p_organization_id is null then
    raise exception
      'organization_id is required';
  end if;

  if not public.is_organization_member(
    p_organization_id
  ) then
    raise exception
      'not authorized for organization';
  end if;

  with
  params as (
    select
      greatest(
        coalesce(p_page, 1),
        1
      ) as page_number,

      least(
        greatest(
          coalesce(p_page_size, 50),
          1
        ),
        100
      ) as page_size
  ),

  base as (
    select
      f.task_id,
      f.lead_id,
      f.lead_code,
      f.lead_name,
      f.title,
      f.due_at,
      f.current_stage::text
        as current_stage,
      f.intent::text
        as intent,
      coalesce(
        f.current_contact_channel::text,
        'other'
      ) as current_contact_channel
    from public.v_followups_due f
    where
      f.organization_id =
        p_organization_id
  ),

  summary as (
    select
      count(*)::integer
        as due_now,

      count(*) filter (
        where current_stage in (
          'high_intent',
          'payment_pending'
        )
      )::integer
        as high_intent_queue
    from base
  ),

  paged as (
    select
      b.*
    from base b
    cross join params p
    order by
      b.due_at asc,
      b.task_id
    limit (
      select page_size
      from params
    )
    offset (
      select
        (page_number - 1) *
        page_size
      from params
    )
  ),

  page_meta as (
    select
      p.page_number
        as page,

      p.page_size,

      s.due_now
        as total,

      case
        when s.due_now = 0
          then 1
        else
          ceil(
            s.due_now::numeric /
            p.page_size
          )::integer
      end
        as total_pages,

      case
        when s.due_now = 0
          then 0
        else
          (
            (
              p.page_number - 1
            ) *
            p.page_size
          ) + 1
      end
        as from_row,

      least(
        p.page_number *
          p.page_size,
        s.due_now
      )::integer
        as to_row

    from params p
    cross join summary s
  )

  select
    jsonb_build_object(
      'tasks',
      coalesce(
        (
          select
            jsonb_agg(
              jsonb_build_object(
                'task_id',
                x.task_id,

                'lead_id',
                x.lead_id,

                'lead_code',
                x.lead_code,

                'lead_name',
                x.lead_name,

                'title',
                x.title,

                'due_at',
                x.due_at,

                'current_stage',
                x.current_stage,

                'intent',
                x.intent,

                'current_contact_channel',
                x.current_contact_channel
              )
              order by
                x.due_at asc,
                x.task_id
            )
          from paged x
        ),
        '[]'::jsonb
      ),

      'summary',
      (
        select
          jsonb_build_object(
            'due_now',
            s.due_now,

            'high_intent_queue',
            s.high_intent_queue
          )
        from summary s
      ),

      'pagination',
      (
        select
          jsonb_build_object(
            'page',
            m.page,

            'page_size',
            m.page_size,

            'total',
            m.total,

            'total_pages',
            m.total_pages,

            'from',
            m.from_row,

            'to',
            m.to_row
          )
        from page_meta m
      )
    )
  into v_result;

  return v_result;
end;
$function$;


-- ------------------------------------------------------------
-- RPC PRIVILEGES
-- ------------------------------------------------------------

revoke all on function
  public.get_followups_workspace(
    uuid,
    integer,
    integer
  )
from public, anon, authenticated, service_role;

grant execute on function
  public.get_followups_workspace(
    uuid,
    integer,
    integer
  )
to authenticated, service_role;


commit;
