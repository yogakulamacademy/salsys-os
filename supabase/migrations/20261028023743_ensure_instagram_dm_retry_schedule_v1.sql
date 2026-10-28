-- Reconcile the live Instagram DM recovery schedule with source control.
-- The worker already exists and processes durable raw Instagram events in
-- bounded, idempotent batches. This migration only ensures the cron schedule
-- exists, avoiding duplicate jobs when replayed in another environment.

do $$
begin
  if not exists (
    select 1
    from cron.job
    where jobname = 'instagram-dm-retry-v1'
  ) then
    perform cron.schedule(
      'instagram-dm-retry-v1',
      '* * * * *',
      'select public.retry_instagram_dm_events_v1(10);'
    );
  end if;
end
$$;
