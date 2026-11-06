const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const helper = read("lib/native-behavior-utc-day-grid.ts");
const loader = read("lib/native-behavior-trends-data.ts");
const fixture = read("tests/ui/fixture-server.mjs");
const browser = read("tests/ui/behavior-explorer.spec.ts");
const output = ts.transpileModule(helper, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const sandbox = { exports: {} };
vm.runInNewContext(output.outputText, sandbox, { timeout: 1000 });
const valid = sandbox.exports.validBehaviorUtcDayGrid;

const days = ["2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03",
  "2026-11-04", "2026-11-05", "2026-11-06"];

test("Valid 7-day UTC trend grids and timestamp offsets are accepted", () => {
  assert.equal(valid(days, days[0], days[6], "2026-11-06T10:05:00.123+00:00", 7), true);
  assert.equal(valid(days, days[0], days[6], "2026-11-07T00:30:00+01:00", 7), true);
  const leap = ["2024-02-27", "2024-02-28", "2024-02-29",
    "2024-03-01", "2024-03-02", "2024-03-03", "2024-03-04"];
  assert.equal(valid(leap, leap[0], leap[6], "2024-03-04T10:00:00Z", 7), true);
});

test("False completeness: missing, duplicate, gap, shifted or stale date grid is rejected", () => {
  const sample = { first: days[0], last: days[6], at: "2026-11-06T10:05:00Z" };
  const check = (list, first = sample.first, last = sample.last, at = sample.at) =>
    valid(list, first, last, at, 7);
  for (const list of [
    days.slice(1), [...days.slice(0, 6), days[5]],
    ["2026-10-30", ...days.slice(1)],
    [days[0], days[1], "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"],
    [days[0], days[1], "2026-02-30", ...days.slice(3)],
    [null, ...days.slice(1)],
  ]) assert.equal(check(list), false, JSON.stringify(list));
  assert.equal(check(days, "2026-10-30"), false);
  assert.equal(check(days, days[0], "2026-11-05"), false);
  assert.equal(check(days, days[0], days[6], "2026-11-07T00:05:00Z"), false);
  assert.equal(check(days, days[0], days[6], "not-a-timestamp"), false);
  assert.equal(check(days, days[0], days[6], null), false);
  assert.equal(check(days, days[0], "2026-11-31"), false);
});

test("Date-grid validation is present in the production trend parsing path", () => {
  assert.match(loader, /validBehaviorUtcDayGrid\(/);
  assert.match(loader, /status\.first_day_utc/);
  assert.match(loader, /status\.last_day_utc/);
  assert.match(loader, /status\.generated_at/);
  assert.match(loader, /request\.days/);
});

test("Browser fixture verifies independent stale/off-grid reports stay unavailable", () => {
  for(const key of ["trends-shifted-calendar","trends-stale-window"]) {
    assert.ok(fixture.includes("'" + key + "'"), key);
    assert.ok(browser.includes('"' + key + '"'), key);
  }
  assert.match(browser, /Out-of-range or stale UTC trend dates fail closed/);
  assert.match(browser, /getByRole\("status"\)/);
});
