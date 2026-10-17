-- Smart Triggers runtime worker foundation.
-- Atomically claims due scheduled jobs with row locks so concurrent workers
-- cannot process the same job twice. No job is executed by this function.

create or replace function public.claim_automation_scheduled_jobs_v1(
  p_organization_id uuid,
  p_limit integer default 10,
  p_job_id uuid default null,
  p_allow_early boolean default false
)
returns setof public.automation_scheduled_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 50));
begin
  return query
  with candidates as (
    select j.id
    from public.automation_scheduled_jobs j
    where j.organization_id = p_organization_id
      and j.status = 'scheduled'
      and j.attempt_count < j.max_attempts
      and (p_job_id is null or j.id = p_job_id)
      and (p_allow_early or j.scheduled_for <= now())
    order by j.scheduled_for asc, j.created_at asc
    for update skip locked
    limit v_limit
  )
  update public.automation_scheduled_jobs j
  set
    status = 'claimed',
    claimed_at = now(),
    attempt_count = j.attempt_count + 1,
    last_error = null,
    updated_at = now()
  from candidates c
  where j.id = c.id
  returning j.*;
end;
$$;

revoke all on function public.claim_automation_scheduled_jobs_v1(uuid, integer, uuid, boolean) from public;
revoke all on function public.claim_automation_scheduled_jobs_v1(uuid, integer, uuid, boolean) from anon;
revoke all on function public.claim_automation_scheduled_jobs_v1(uuid, integer, uuid, boolean) from authenticated;
grant execute on function public.claim_automation_scheduled_jobs_v1(uuid, integer, uuid, boolean) to service_role;
