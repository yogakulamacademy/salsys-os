const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const helper = read("lib/native-behavior-safe-count.ts");
const funnel = read("lib/native-behavior-data.ts");
const trends = read("lib/native-behavior-trends-data.ts");
const breakdown = read("lib/native-behavior-breakdown-data.ts");
const fixture = read("tests/ui/fixture-server.mjs");
const browser = read("tests/ui/behavior-explorer.spec.ts");

const compiled = ts.transpileModule(helper, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const sandbox = { exports: {} };
vm.runInNewContext(compiled.outputText, sandbox, { timeout: 1000 });
const safeBehaviorCount = sandbox.exports.safeBehaviorCount;

test("Valid integer observations are preserved, including genuine zero and bigint decimal strings", () => {
  for (const [input, expected] of [
    [0, 0], [1, 1], [123, 123], ["0", 0], ["42", 42], ["9007199254740991", Number.MAX_SAFE_INTEGER],
  ]) assert.equal(safeBehaviorCount(input), expected, JSON.stringify(input));
});

test("Missing or malformed observations must not be coerced into zero", () => {
  for (const input of [
    null, undefined, false, true, "", " ", "00", "01", "-1", "+1", "1e3",
    "1.0", "1.5", "123 ", " 123", [], {}, [0], NaN, Infinity, -Infinity,
    -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "9007199254740992",
  ]) assert.equal(safeBehaviorCount(input), null, JSON.stringify(input));
});

test("All three R2 Behavior panels use the same strict parser and reject invalid report counts", () => {
  for (const source of [funnel, trends, breakdown]) {
    assert.match(source, /from "@\/lib\/native-behavior-safe-count"/);
    assert.doesNotMatch(source, /Number\(value\)/);
  }
  assert.match(funnel, /sessions === null/);
  assert.match(funnel, /pathSessions === null/);
  assert.match(funnel, /transitions === null/);
  assert.match(trends, /events === null \|\| sessions === null/);
  assert.match(breakdown, /totalEvents === null/);
  assert.match(breakdown, /identifiedSessions === null/);
});

test("Loopback-only synthetic browser scenarios cover independent malformed reports", () => {
  for (const scenario of [
    "malformed-funnel-count", "malformed-trends-count", "malformed-breakdown-count",
  ]) {
    assert.ok(fixture.includes("'" + scenario + "'"), scenario);
    assert.ok(browser.includes('"' + scenario + '"'), scenario);
  }
  assert.match(fixture, /result\.funnel\[0\]\.sessions=null/);
  assert.match(fixture, /result\.series\[0\]\.daily\[0\]\.sessions=null/);
  assert.match(fixture, /result\.status\.identified_sessions=null/);
  assert.match(browser, /Malformed aggregate counts do not impersonate observed zeroes/);
  assert.match(browser, /call\.organization_id === organizationId/);
});
