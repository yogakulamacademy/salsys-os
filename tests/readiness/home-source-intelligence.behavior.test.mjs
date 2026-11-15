import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeFirstTouchSource,
  reconcileHomeSourceQualification,
  buildHomeSourceSignals,
} from "../../lib/home-source-intelligence.ts";

test("normalizes known aliases but retains an unknown group instead of inventing channel identity", () => {
  const cases = new Map([
    ["instagram", "Instagram"],
    ["IG", "Instagram"],
    ["l.instagram.com", "Instagram"],
    ["www.instagram.com", "Instagram"],
    ["www.google.com", "Google"],
    ["com.google.android.googlequicksearchbox", "Google"],
    ["wa.me", "WhatsApp"],
    ["chatgpt.com", "ChatGPT"],
    ["direct", "Direct"],
    ["", "Unknown"],
    ["(not set)", "Unknown"],
    ["unrecognized.example", "Other sources"],
  ]);
  for (const [input, expected] of cases) {
    assert.equal(normalizeFirstTouchSource(input), expected, input);
  }
  assert.equal(normalizeFirstTouchSource(null), "Unknown");
});

test("qualified stage milestones reconcile only against the complete acquisition cohort", () => {
  const sources = [
    { source: "Instagram", leads: 16, qualified: 0, conversionRate: null },
    { source: "Google", leads: 4, qualified: 0, conversionRate: null },
  ];
  const history = [
    { source: "Instagram", leads: 16, qualified: 2 },
    { source: "Google", leads: 4, qualified: 1 },
  ];
  assert.deepEqual(reconcileHomeSourceQualification(sources, history, 20, 3), [
    { source: "Instagram", leads: 16, qualified: 2, conversionRate: 12.5 },
    { source: "Google", leads: 4, qualified: 1, conversionRate: 25 },
  ]);
});

test("returns unavailable rather than a fabricated conversion rate when a source is truncated or contradictory", () => {
  const acquisition = [
    { source: "Instagram", leads: 16, qualified: 0, conversionRate: null },
    { source: "Google", leads: 4, qualified: 0, conversionRate: null },
  ];
  assert.equal(reconcileHomeSourceQualification(
    acquisition, [{ source: "Instagram", leads: 16, qualified: 2 }], 20, 2,
  ), null, "omitted history source must not appear as zero qualification");

  assert.equal(reconcileHomeSourceQualification(
    acquisition, [{ source: "Instagram", leads: 15, qualified: 2 }, { source: "Google", leads: 5, qualified: 1 }], 20, 3,
  ), null, "source count mismatch must be rejected");

  assert.equal(reconcileHomeSourceQualification(
    acquisition, [{ source: "Instagram", leads: 16, qualified: 20 }, { source: "Google", leads: 4, qualified: 0 }], 20, 20,
  ), null, "impossible qualification count must be rejected");

  assert.equal(reconcileHomeSourceQualification(
    acquisition, [{ source: "Instagram", leads: 16, qualified: 2 }, { source: "Google", leads: 4, qualified: 1 }], 20, 4,
  ), null, "aggregate qualified count disagreement must be rejected");
});

test("source concentration signals require a meaningful cohort and do not claim causal lead quality", () => {
  const sources = [
    { source: "Instagram", leads: 85, qualified: 0, conversionRate: null },
    { source: "Direct", leads: 15, qualified: 0, conversionRate: null },
  ];
  assert.deepEqual(buildHomeSourceSignals(15, sources, 1), []);
  const signals = buildHomeSourceSignals(100, sources, 2);
  assert.ok(signals.some((signal) => signal.title === "Acquisition is concentrated"));
  assert.ok(signals.some((signal) => signal.title === "Few qualification milestones are recorded"));
  assert.ok(signals.every((signal) => !/low.quality leads|bad leads/i.test(signal.detail)));

  const noMilestoneEvidence = buildHomeSourceSignals(100, sources, null);
  assert.ok(!noMilestoneEvidence.some((signal) => signal.title === "Few qualification milestones are recorded"));
});
