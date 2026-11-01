-- R11-P3 post-merge hardening — remove legacy anonymous table privileges.
--
-- Residential records are internal CRM/operations data. Anonymous callers have
-- no product path to these tables, and row-level security does not govern
-- TRUNCATE. Remove all legacy anon table privileges while preserving the
-- authenticated/service-role boundaries established by R11-P3.

begin;

revoke all privileges on table public.accommodation_properties from anon;
revoke all privileges on table public.accommodation_rooms from anon;
revoke all privileges on table public.batch_accommodation_types from anon;
revoke all privileges on table public.batch_accommodation_room_pool from anon;
revoke all privileges on table public.enrollment_accommodation_assignments from anon;

commit;
