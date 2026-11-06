const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sql = fs.readFileSync(path.join(__dirname,
  "../../supabase/migrations/20261106092000_r11_course_admin_helper_acl_hardening_v1.sql"), "utf8");
const active = sql.split("\n").filter(line => !line.trim().startsWith("--")).join("\n");

test("course admin helper ACL requires privileged function signature", () => {
  assert.match(active, /n\.nspname = 'public'/);
  assert.match(active, /p\.proname = 'can_administer_course_management'/);
  assert.match(active, /p\.prosecdef/);
  assert.match(active, /pg_get_function_identity_arguments\(p\.oid\) = 'p_organization_id uuid'/);
});

test("anonymous role is denied while authenticated and service role remain", () => {
  assert.match(active, /revoke execute on function public\.can_administer_course_management\(uuid\)\s+from public, anon;/i);
  assert.match(active, /grant execute on function public\.can_administer_course_management\(uuid\)\s+to authenticated, service_role;/i);
  assert.match(active, /has_function_privilege\('anon', 'public\.can_administer_course_management\(uuid\)', 'EXECUTE'\)/i);
  assert.match(active, /not has_function_privilege\('authenticated', 'public\.can_administer_course_management\(uuid\)', 'EXECUTE'\)/i);
  assert.match(active, /not has_function_privilege\('service_role', 'public\.can_administer_course_management\(uuid\)', 'EXECUTE'\)/i);
});

test("migration does not change function behavior, schema, rows or other ACLs", () => {
  assert.doesNotMatch(active, /\b(?:create\s+or\s+replace\s+function|alter\s+function|drop\s+function|alter\s+table|insert\s+into|update\s+public\.|delete\s+from|truncate\s+table|revoke\s+all)\b/i);
  assert.doesNotMatch(active, /\btracking_sources\b|\braw_events\b|\bsalsys_vid\b/i);
});
