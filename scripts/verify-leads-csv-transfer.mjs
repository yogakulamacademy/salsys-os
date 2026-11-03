import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";

const source = readFileSync("lib/leads-transfer-csv.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
runInContext(compiled, createContext({ exports, TextEncoder }));
const {
  parseLeadsImportCsv, LEADS_IMPORT_TEMPLATE, csvCell, csvRow,
  validateImportRow, importIdentityKeys,
} = exports;

const template = parseLeadsImportCsv(LEADS_IMPORT_TEMPLATE);
assert.equal(template.rows.length, 1);
assert.equal(template.issues.length, 0);
assert.equal(template.rows[0].first_name, "Jane");

const duplicates = parseLeadsImportCsv(
  "first_name,email,phone\nAlice,ALICE@example.com,\nBob,alice@example.com,\n",
);
assert.equal(duplicates.rows.length, 1);
assert.equal(duplicates.issues.length, 1);
assert.match(duplicates.issues[0].message, /Duplicate/i);

const escaped = parseLeadsImportCsv(
  'first_name,email,notes\nJane,jane@example.com,"Interested in ""Yoga"",\nnext year"\n',
);
assert.equal(escaped.rows[0].notes, 'Interested in "Yoga",\nnext year');

const invalid = parseLeadsImportCsv(
  "first_name,email\nJane,\nJo,invalid-email\n",
);
assert.equal(invalid.rows.length, 0);
assert.equal(invalid.issues.length, 2);

assert.throws(() => parseLeadsImportCsv("first_name,email\nJane,\"oops\n"), /Unterminated/);
assert.throws(() => parseLeadsImportCsv("name,email\nJane,j@example.com"), /first_name/);
assert.throws(() => parseLeadsImportCsv("first_name,email,arbitrary\nJane,j@example.com,test"), /Unsupported/);

const injection = csvRow(["=2+3", " +SUM(A1:A2)", "@evil", "-1+2"]);
assert.equal(injection.includes('"=2+3"'), false);
assert.equal(injection.includes('"+SUM'), false);
assert.match(csvCell("=HYPERLINK(1)"), /^"'/);
assert.match(csvCell("safe"), /^"safe"$/);
assert.ok(injection.split(",").every(cell => cell.startsWith('"\\'') || cell.startsWith('"\'')));

const valid = validateImportRow({
  rowNumber: 2,
  first_name: "Ana",
  email: "ana@example.com",
  phone: "+1 (555) 234-5678",
});
assert.equal(valid.error, null);
assert.deepEqual(Array.from(importIdentityKeys(valid.row)), ["email:ana@example.com", "phone:+15552345678"]);

const route = readFileSync("app/api/leads/import/route.ts", "utf8");
const exportRoute = readFileSync("app/api/leads/export/route.ts", "utf8");
const header = readFileSync("components/leads/leads-header-actions.tsx", "utf8");
assert.ok(route.includes("can_manage_sales_workspace"));
assert.ok(route.includes("requireCurrentOrganizationId"));
assert.ok(route.includes("create_crm_lead"));
assert.ok(!route.includes("createAdminClient"));
assert.ok(exportRoute.includes("getLeadsWorkspacePageWithAttributionScope"));
assert.ok(exportRoute.includes("can_manage_sales_workspace"));
assert.ok(exportRoute.includes("private, no-store"));
assert.ok(!exportRoute.includes("createAdminClient"));
assert.ok(header.includes('href="/leads/import"'));
assert.ok(header.indexOf("Export leads") < header.indexOf("Add lead"));

console.log("PASS: CSV parser, duplicate detection, formula neutralization and protected lead-transfer boundaries");
