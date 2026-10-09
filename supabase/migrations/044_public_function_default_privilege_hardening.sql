begin;

-- ============================================================
-- 044: Public function privilege hardening
--
-- Scope:
--   - functions only
--   - public schema only
--   - prevent future anonymous/public EXECUTE drift for
--     application functions created by postgres
--   - remove existing anonymous/public EXECUTE exposure
--
-- Intentionally NOT changing:
--   - tables
--   - sequences
--   - RLS
--   - function bodies
--   - authenticated grants
--   - service_role grants
--
-- Supabase managed-role limitation:
--   Default privileges owned by supabase_admin cannot be altered
--   from the production SQL Editor session.
--
--   Existing functions remain hardened below regardless of owner.
--   Future supabase_admin-owned function defaults remain platform
--   managed and must be monitored separately.
-- ============================================================


-- ------------------------------------------------------------
-- FUTURE APPLICATION FUNCTIONS CREATED BY postgres
-- ------------------------------------------------------------

alter default privileges
for role postgres
in schema public
revoke execute on functions
from public;

alter default privileges
for role postgres
in schema public
revoke execute on functions
from anon;


-- ------------------------------------------------------------
-- EXISTING PUBLIC-SCHEMA FUNCTIONS
--
-- Remove accidental API execution exposure.
--
-- authenticated and service_role have their own direct EXECUTE
-- grants, verified before this migration.
-- ------------------------------------------------------------

revoke execute
on all functions in schema public
from public;

revoke execute
on all functions in schema public
from anon;


commit;