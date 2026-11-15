import test from "node:test";
import assert from "node:assert/strict";
import { buildHomeGeographyCoverage } from "../../lib/home-geography-coverage.ts";

test("counts only nonblank declared country fields in the scoped acquisition cohort", () => {
  assert.deepEqual(buildHomeGeographyCoverage([
    { country: "India" }, { country: " " }, { country: null },
    { country: "IN" }, { country: "Pune" },
  ]), {
    cohortLeads: 5,
    countryFieldPopulated: 3,
    countryFieldMissing: 2,
    populatedPercent: 60,
  });
});

test("empty cohort has no defensible completion rate", () => {
  assert.deepEqual(buildHomeGeographyCoverage([]), {
    cohortLeads: 0, countryFieldPopulated: 0,
    countryFieldMissing: 0, populatedPercent: null,
  });
});

test("free-text city is counted as filled, not asserted to be a verified country", () => {
  const output = buildHomeGeographyCoverage([{ country: "Odisha" }, { country: "" }]);
  assert.equal(output.countryFieldPopulated, 1);
  assert.equal(output.populatedPercent, 50);
});
