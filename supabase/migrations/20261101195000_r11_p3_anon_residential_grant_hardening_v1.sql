-- R11-P3 post-merge hardening — remove legacy anonymous residential grants.
--
-- Residential records are internal CRM/operations data. Anonymous callers have
-- no product path to the underlying tables or views, and row-level security does
-- not govern TRUNCATE. Remove legacy anon privileges and reduce authenticated
-- residential views to SELECT-only while preserving the P3 table write boundary.

begin;

-- Canonical residential tables: anonymous has no direct access.
revoke all privileges on table public.accommodation_properties from anon;
revoke all privileges on table public.accommodation_rooms from anon;
revoke all privileges on table public.batch_accommodation_types from anon;
revoke all privileges on table public.batch_accommodation_room_pool from anon;
revoke all privileges on table public.enrollment_accommodation_assignments from anon;

-- Security-invoker residential views: anonymous has no access; authenticated
-- callers can only read through the underlying capability/tenant-gated tables.
revoke all privileges on table public.v_batch_accommodation_inventory from anon, authenticated;
revoke all privileges on table public.v_batch_accommodation_live_inventory from anon, authenticated;
revoke all privileges on table public.v_batch_accommodation_summary from anon, authenticated;
revoke all privileges on table public.v_batch_enrollment_accommodation_roster from anon, authenticated;
revoke all privileges on table public.v_enrollment_accommodation_assignments from anon, authenticated;

grant select on table public.v_batch_accommodation_inventory to authenticated;
grant select on table public.v_batch_accommodation_live_inventory to authenticated;
grant select on table public.v_batch_accommodation_summary to authenticated;
grant select on table public.v_batch_enrollment_accommodation_roster to authenticated;
grant select on table public.v_enrollment_accommodation_assignments to authenticated;

commit;
