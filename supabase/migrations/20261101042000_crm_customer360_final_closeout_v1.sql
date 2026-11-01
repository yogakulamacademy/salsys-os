begin;

-- =============================================================================
-- CRM + Customer 360 final closeout V1
--
-- 1. Reconcile the only invalid state still observable in CRM Core health:
--    more than one primary contact of the same type on one lead.
-- 2. Enforce that invariant at the database boundary so every ingestion path
--    (website, messaging, manual CRM, imports) is protected equally.
-- 3. Add an explicit human-review dismissal path for identity conflicts.
--    This function never merges Persons, moves identifiers, or rewrites lead-
--    Person links. Ambiguous identity remains ambiguous until a human reviews it.
-- =============================================================================

-- Keep the strongest/oldest primary contact deterministically and demote only
-- duplicate primary flags. Contact records and values remain intact.
with ranked_primary_contacts as (
  select
    c.id,
    row_number() over (
      partition by c.organization_id, c.lead_id, c.contact_type
      order by c.verified desc, c.created_at asc, c.id asc
    ) as primary_rank
  from public.lead_contacts c
  where c.is_primary = true
)
update public.lead_contacts c
set is_primary = false
from ranked_primary_contacts r
where c.id = r.id
  and r.primary_rank > 1;

create unique index if not exists uq_lead_contacts_one_primary_per_type_v1
  on public.lead_contacts (organization_id, lead_id, contact_type)
  where is_primary = true;

comment on index public.uq_lead_contacts_one_primary_per_type_v1 is
  'CRM closeout invariant: at most one primary lead contact per organization, lead and contact type.';

-- Human reviewers may dismiss a conflict only when they have established that
-- the records are distinct or the evidence should not trigger identity reuse.
-- The canonical graph is deliberately untouched by this action.
create or replace function public.dismiss_identity_resolution_conflict_v1(
  p_conflict_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_conflict public.identity_resolution_conflicts%rowtype;
  v_user_id uuid := auth.uid();
  v_is_service_role boolean := coalesce(auth.jwt()->>'role', '') = 'service_role';
begin
  if p_conflict_id is null then
    raise exception 'Identity conflict ID is required';
  end if;

  select *
  into v_conflict
  from public.identity_resolution_conflicts c
  where c.id = p_conflict_id
  for update;

  if not found then
    raise exception 'Identity conflict not found';
  end if;

  if not v_is_service_role then
    if v_user_id is null then
      raise exception 'Authentication is required';
    end if;

    if not public.can_administer_organization_crm(v_conflict.organization_id) then
      raise exception 'Manager or administrator access is required to review identity conflicts';
    end if;
  end if;

  if v_conflict.status <> 'open' then
    return jsonb_build_object(
      'conflict_id', v_conflict.id,
      'status', v_conflict.status,
      'changed', false
    );
  end if;

  update public.identity_resolution_conflicts c
  set
    status = 'dismissed',
    resolution_action = 'dismissed_after_human_review',
    resolved_at = now(),
    resolved_by = case when v_is_service_role then null else v_user_id end,
    metadata = coalesce(c.metadata, '{}'::jsonb) || jsonb_build_object(
      'review_version', 'crm-customer360-final-closeout-v1',
      'reviewed_at', now()
    )
  where c.id = v_conflict.id;

  return jsonb_build_object(
    'conflict_id', v_conflict.id,
    'status', 'dismissed',
    'changed', true
  );
end;
$function$;

revoke all on function public.dismiss_identity_resolution_conflict_v1(uuid)
  from public, anon;
grant execute on function public.dismiss_identity_resolution_conflict_v1(uuid)
  to authenticated, service_role;

comment on function public.dismiss_identity_resolution_conflict_v1(uuid) is
  'Human-review-only dismissal for identity conflicts. Requires CRM manager/admin access and never merges or rewrites canonical Person identity.';

commit;
