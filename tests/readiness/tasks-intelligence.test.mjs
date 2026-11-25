import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { buildTasksIntelligence, doneShare, tasksHeadline } from '../../lib/tasks-intelligence.ts';

const now = new Date('2026-11-25T08:00:00Z');
const f = (o) => ({ id: o.id, leadId: 'l', createdAt: o.c, completedAt: o.done ?? null, status: o.s ?? 'open', dueAt: o.due ?? null, title: o.t ?? 'Follow-up', ownerName: o.owner ?? null, answered: o.a ?? false });

test('counts, late, due today, owners and answered', () => {
  const facts = [
    f({ id: '1', c: '2026-11-20T05:00:00Z', due: '2026-11-21T05:00:00Z', a: true }),
    f({ id: '2', c: '2026-11-20T05:00:00Z', due: '2026-11-10T05:00:00Z', owner: 'Arun' }),
    f({ id: '3', c: '2026-11-24T05:00:00Z', due: '2026-11-25T04:30:00Z' }),
    f({ id: '4', c: '2026-11-22T05:00:00Z', s: 'completed', done: '2026-11-23T05:00:00Z' }),
    f({ id: '5', c: '2026-10-01T05:00:00Z', due: '2026-12-20T05:00:00Z', a: true }),
  ];
  const i = buildTasksIntelligence(facts, now);
  assert.equal(i.created, 4);
  assert.equal(i.done, 1);
  assert.equal(i.open, 4);
  assert.equal(i.late, 3);
  assert.equal(i.lateThisWeek, 2);
  assert.equal(i.dueToday, 1);
  assert.equal(i.dueTodayPast, 1);
  assert.equal(i.noOwner, 3);
  assert.deepEqual(i.answeredIds, ['1']); // 5 is not due within a week
  assert.equal(i.owners[0].name, 'Nobody yet');
  assert.equal(doneShare(i), 0.25);
  assert.match(tasksHeadline(i), /^4 follow-ups were created in 3 weeks and 1 were marked done/);
});

test('unusual days are flagged with what was created', () => {
  const facts = [];
  for (let d = 5; d <= 25; d += 1) facts.push(f({ id: `q${d}`, c: `2026-11-${String(d).padStart(2, '0')}T05:00:00Z` }));
  for (let k = 0; k < 30; k += 1) facts.push(f({ id: `s${k}`, c: '2026-11-17T06:00:00Z', t: k < 20 ? 'Said later' : 'First contact' }));
  const i = buildTasksIntelligence(facts, now);
  assert.equal(i.flagged.length, 1);
  assert.equal(i.flagged[0].day, '2026-11-17');
  assert.deepEqual(i.flagged[0].top[0], { title: 'Said later', n: 20 });
});

test('briefing is on the Follow-ups page for the All view, managers and admins only', () => {
  const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
  const page = read('app/follow-ups/page.tsx');
  assert.match(page, /view === "all" \? getTasksIntelligence\(\)/);
  assert.match(page, /<SmartTasksBriefing data=\{intel\}/);
  assert.match(read('lib/tasks-intelligence-data.ts'), /can_administer_organization_crm/);
  assert.match(read('components/followups/smart-tasks-briefing.tsx'), /closeSettledTasksInline/);
});
