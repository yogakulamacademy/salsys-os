-- Website price suggestions v1
-- Prices read from the organization's own website pages (stored by the SEO
-- crawler) are queued here as SUGGESTIONS. A manager approves before any
-- batch price changes. Policy:
--   * the website OFFER price becomes the batch selling price (USD);
--   * the REGULAR (crossed-out) price is kept in batch metadata for reference;
--   * the INR price is converted from USD and approved separately.

begin;

create table if not exists public.course_price_suggestions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  batch_id uuid not null references public.course_batches(id) on delete cascade,
  course_code text not null check (char_length(course_code) <= 40),
  page_url text not null check (page_url ~* '^https?://' and char_length(page_url) <= 2048),
  snapshot_fetched_at timestamptz not null,
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  private_offer numeric(12,2) check (private_offer is null or private_offer > 0),
  shared_offer numeric(12,2) check (shared_offer is null or shared_offer > 0),
  private_regular numeric(12,2) check (private_regular is null or private_regular > 0),
  shared_regular numeric(12,2) check (shared_regular is null or shared_regular > 0),
  current_private numeric(12,2),
  current_shared numeric(12,2),
  current_currency text,
  inr_rate numeric(10,4) check (inr_rate is null or inr_rate > 0),
  inr_private numeric(12,2) check (inr_private is null or inr_private > 0),
  inr_shared numeric(12,2) check (inr_shared is null or inr_shared > 0),
  flags jsonb not null default '[]'::jsonb check (jsonb_typeof(flags) = 'array'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'superseded')),
  inr_status text not null default 'pending' check (inr_status in ('pending', 'approved', 'rejected', 'none')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint course_price_suggestions_has_price check (private_offer is not null or shared_offer is not null)
);

create unique index if not exists course_price_suggestions_one_pending_per_batch
  on public.course_price_suggestions (batch_id) where status = 'pending';
create index if not exists course_price_suggestions_org_status_idx
  on public.course_price_suggestions (organization_id, status, created_at desc);

-- A suggestion must point at a batch of the same organization.
create or replace function public.course_price_suggestion_tenant_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.course_batches b
    where b.id = new.batch_id and b.organization_id = new.organization_id
  ) then
    raise exception 'price suggestion batch must belong to the same organization';
  end if;
  return new;
end;
$$;
revoke all on function public.course_price_suggestion_tenant_guard() from public, anon, authenticated;

drop trigger if exists course_price_suggestion_tenant_guard on public.course_price_suggestions;
create trigger course_price_suggestion_tenant_guard
  before insert or update of batch_id, organization_id on public.course_price_suggestions
  for each row execute function public.course_price_suggestion_tenant_guard();

alter table public.course_price_suggestions enable row level security;

drop policy if exists course_price_suggestions_member_select on public.course_price_suggestions;
create policy course_price_suggestions_member_select
  on public.course_price_suggestions for select to authenticated
  using (public.is_organization_member(organization_id));

revoke all on public.course_price_suggestions from anon, authenticated;
grant select on public.course_price_suggestions to authenticated;

-- Approve: managers only. Writes the batch price; INR only if approved too.
create or replace function public.approve_course_price_suggestion_v1(
  p_organization_id uuid,
  p_suggestion_id uuid,
  p_approve_inr boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_actor uuid := auth.uid();
  s public.course_price_suggestions%rowtype;
  v_pricing jsonb;
begin
  if v_actor is null or not public.can_manage_organization(p_organization_id) then
    raise exception 'Only organization managers can approve prices';
  end if;
  select * into s from public.course_price_suggestions
   where id = p_suggestion_id and organization_id = p_organization_id
   for update;
  if not found then raise exception 'Price suggestion not found'; end if;
  if s.status <> 'pending' then raise exception 'This price suggestion was already decided'; end if;
  if coalesce(p_approve_inr, false) and (s.inr_private is null and s.inr_shared is null) then
    raise exception 'No INR price to approve';
  end if;

  v_pricing := jsonb_strip_nulls(jsonb_build_object(
    'source', 'website',
    'page_url', s.page_url,
    'snapshot_fetched_at', s.snapshot_fetched_at,
    'currency', s.currency,
    'offer_private', s.private_offer,
    'offer_shared', s.shared_offer,
    'regular_private', s.private_regular,
    'regular_shared', s.shared_regular,
    'approved_by', v_actor,
    'approved_at', now(),
    'inr', case when coalesce(p_approve_inr, false) then jsonb_strip_nulls(jsonb_build_object(
      'private', s.inr_private, 'shared', s.inr_shared, 'rate', s.inr_rate,
      'approved_by', v_actor, 'approved_at', now())) else null end
  ));

  update public.course_batches b
     set price_private = coalesce(s.private_offer, b.price_private),
         price_shared = coalesce(s.shared_offer, b.price_shared),
         currency = s.currency,
         metadata = coalesce(b.metadata, '{}'::jsonb) || jsonb_build_object('website_pricing', v_pricing),
         updated_at = now()
   where b.id = s.batch_id and b.organization_id = p_organization_id;
  if not found then raise exception 'Batch not found'; end if;

  update public.course_price_suggestions
     set status = 'approved',
         inr_status = case when s.inr_private is null and s.inr_shared is null then 'none'
                           when coalesce(p_approve_inr, false) then 'approved' else 'rejected' end,
         decided_by = v_actor, decided_at = now()
   where id = s.id;

  return jsonb_build_object('ok', true, 'batch_id', s.batch_id, 'inr_approved', coalesce(p_approve_inr, false));
end;
$function$;

create or replace function public.reject_course_price_suggestion_v1(
  p_organization_id uuid,
  p_suggestion_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
begin
  if auth.uid() is null or not public.can_manage_organization(p_organization_id) then
    raise exception 'Only organization managers can reject prices';
  end if;
  update public.course_price_suggestions
     set status = 'rejected', inr_status = case when inr_status = 'pending' then 'rejected' else inr_status end,
         decided_by = auth.uid(), decided_at = now()
   where id = p_suggestion_id and organization_id = p_organization_id and status = 'pending';
  if not found then raise exception 'Pending price suggestion not found'; end if;
  return jsonb_build_object('ok', true);
end;
$function$;

revoke all on function public.approve_course_price_suggestion_v1(uuid, uuid, boolean) from public, anon;
grant execute on function public.approve_course_price_suggestion_v1(uuid, uuid, boolean) to authenticated;
revoke all on function public.reject_course_price_suggestion_v1(uuid, uuid) from public, anon;
grant execute on function public.reject_course_price_suggestion_v1(uuid, uuid) to authenticated;

commit;
