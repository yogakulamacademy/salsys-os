const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

const migration = read("supabase/migrations/20261106094500_r2_p2_strict_public_path_privacy_v3.sql");
const explorer = read("lib/native-behavior-data.ts");
const breakdown = read("lib/native-behavior-breakdown-data.ts");
const fixture = read("tests/ui/fixture-server.mjs");
const browser = read("tests/ui/behavior-explorer.spec.ts");
const withoutComments = migration.split("\n").filter((line) => !line.trimStart().startsWith("--")).join("\n");

test("SQL narrows the original helper only; no event writes or role grants", () => {
  assert.match(withoutComments, /create or replace function public\.native_safe_page_path_v2\(p_path text\)/i);
  assert.match(withoutComments, /returns text\s+language sql\s+immutable/i);
  assert.match(withoutComments, /set search_path = pg_catalog/i);
  assert.ok(withoutComments.includes("and p_path !~* '(^|/)(account|profile|"));
  assert.match(withoutComments, /revoke all on function public\.native_safe_page_path_v2\(text\)/i);
  assert.doesNotMatch(withoutComments, /\b(?:insert\s+into|update\s+public\.|delete\s+from|alter\s+table|grant\s+execute)\b/i);
});

test("Public PHP and HTML pages remain while account and identity paths are denied", () => {
  for (const value of [
    "/courses/200-hour-ytt.php", "/enroll.php", "/contact.php",
    "/courses/private-session.php", "/courses/200-hour-ytt.html",
    "/account/billing.php", "/students/dashboard", "/ADMIN/index.html",
    "/checkout.php", "/api/events"
  ]) assert.ok(migration.includes("'" + value + "'"), value);
  assert.match(migration, /raise exception 'R2-P2 private route leaked'/);
  assert.match(migration, /raise exception 'R2-P2 public route regression'/);
});

test("Server guard and synthetic browser fixture independently reject private navigation paths", () => {
  assert.match(explorer, /function safePublicPath\(value: string\)/);
  assert.ok(explorer.includes("(account|profile|users?|students?|private|admin|dashboard|settings|session|token|reset-password|payments?|orders?|checkout|leads?|api|auth)"));
  assert.match(explorer, /safePublicPath\(from\) \|\| !safePublicPath\(to\)/);
  assert.match(breakdown, /function safePath/);
  assert.ok(fixture.includes("from_path:'/account/billing.php'"));
  assert.ok(fixture.includes("to_path:'/students/dashboard'"));
  assert.ok(browser.includes('getByText("/account/billing.php", { exact: true })).toHaveCount(0)'));
  assert.ok(browser.includes('getByText("/students/dashboard", { exact: true })).toHaveCount(0)'));
});
