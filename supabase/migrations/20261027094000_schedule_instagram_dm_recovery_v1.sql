-- Recover durable Instagram customer-message events in small bounded batches.
-- The worker is idempotent and isolates per-event failures, so one historical
-- problem cannot block the rest of the queue or create a webhook retry storm.

select cron.schedule(
  'instagram-dm-retry-v1',
  '* * * * *',
  $$select public.retry_instagram_dm_events_v1(10);$$
);
