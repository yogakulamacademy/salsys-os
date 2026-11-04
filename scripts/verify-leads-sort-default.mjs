import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";

const source = readFileSync("lib/leads-data.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
// These runtime imports are not needed for the pure params parser; avoid network
// and database reads during the build-time policy test.
runInContext(compiled, createContext({ exports, require: () => ({}) }));
const parse = exports.parseLeadsWorkspaceParams;

assert.equal(parse({}).sort, "created_desc", "Leads default to newest-first");
assert.equal(parse({ sort: "created_desc" }).sort, "created_desc");
assert.equal(parse({ sort: "stage_age_desc" }).sort, "stage_age_desc");
assert.equal(parse({ sort: "name" }).sort, "name");
assert.equal(parse({ sort: "followup_asc" }).sort, "followup_asc");
assert.equal(parse({ sort: "unsupported" }).sort, "created_desc");
assert.equal(parse({ view: "unassigned", page: "2" }).sort, "created_desc");

const table = readFileSync("components/leads-clean-table.tsx", "utf8");
assert.ok(table.includes('<option value="created_desc">Newest first</option>'));
assert.ok(table.includes('(key === "sort" && value === "created_desc")'));
assert.ok(table.includes('if (sort === "created_desc") return "newest leads first";'));

const migration = readFileSync(
  "supabase/migrations/20261104035000_leads_workspace_created_desc_sort_v1.sql", "utf8",
);
assert.ok(migration.includes("get_leads_workspace_page_v2"));
assert.ok(migration.includes("get_leads_workspace_page_v3"));
assert.ok(migration.includes("''followup_asc'',''created_desc''"));
assert.ok(migration.includes("f.created_at desc nulls last"));
assert.ok(migration.includes("f.id desc"));
assert.ok(migration.includes("raise exception 'Unexpected sort-mode guard"));
assert.ok(!migration.includes("grant execute"));
assert.ok(!migration.includes("alter table"));
assert.ok(!migration.includes("drop function"));

console.log("PASS: Leads default newest first, alternate sorts remain, and v2/v3 pagination handles creation-date order");
