'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname,
  '../../app/pricing-preview/page.tsx'), 'utf8');
const notes = fs.readFileSync(path.resolve(__dirname,
  '../../docs/launch/R14-2026-11-11-Four-Tier-Pricing-Page-Review-v1.md'), 'utf8');

test('R14 preview is unindexed, explicitly provisional, and not routed through checkout', () => {
  assert.match(source, /robots:\s*\{\s*index:\s*false,\s*follow:\s*false/);
  assert.match(source, /INTERNAL DRAFT PREVIEW/);
  assert.match(source, /not a public checkout offer/);
  assert.match(source, /Not open for self-service purchase/);
  assert.doesNotMatch(source, /fetch\s*\(|axios\.|supabase|createClient|serverAction|use server|<form\b|<button\b|type=['"]submit['"]|href=['"]\/(?:checkout|register|signup|subscribe)/i);
});

test('R14 preview shows correct tier names and pricing exactly once in static data', () => {
  for (const [key,price] of [['free','₹0'],['basic','₹1,499'],['growth','₹3,499'],['pro','₹6,999']]) {
    assert.match(source, new RegExp("key: '" + key + "'"));
    assert.match(source, new RegExp("price: '" + price + "'"));
  }
  assert.match(source, /featured for growth teams/i);
  assert.match(source, /₹14,999/);
  assert.match(source, /₹2,999–₹4,999/);
  assert.match(source, /₹4,999–₹7,999/);
  assert.match(source, /₹9,999–₹14,999/);
  assert.match(source, /₹19,999–₹34,999/);
});

test('R14 preview treats provider-dependent features as conditional and quotas as provisional', () => {
  assert.match(source, /conditional:\s*true/);
  assert.match(source, /approval required/);
  assert.match(source, /Proposed limits are not enforced/);
  assert.match(source, /No autonomous customer messaging/);
  assert.match(source, /has no\s+signup, billing, booking/);
  assert.match(notes, /No.*public purchase or signup yet/i);
});
