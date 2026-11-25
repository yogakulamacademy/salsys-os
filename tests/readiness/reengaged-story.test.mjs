import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { reengagedHeadline, replyKind, summarise } from '../../lib/reengaged-story.ts';

test('replies are sorted by what they say', () => {
  assert.equal(replyKind("Yes, I'm interested."), 'yes');
  assert.equal(replyKind('Yes I am , but planning to do it later .'), 'yes');
  assert.equal(replyKind('Can you tell me more about the application process?'), 'asked');
  assert.equal(replyKind('Details please'), 'asked');
  assert.equal(replyKind('Not interested'), 'no');
  assert.equal(replyKind('No thanks mam'), 'no');
  assert.equal(replyKind('Shared an Instagram reel\nhttps://x'), 'shared');
  assert.equal(replyKind('Thank you for reaching out'), 'other');
});

const p = (o) => ({ leadId: o.id, at: '2026-11-24T08:00:00Z', body: o.body, afterCheckin: o.c ?? true, silentDays: o.d ?? 14, name: o.id, stage: o.stage ?? 'engaged', channel: 'instagram', course: null, value: o.v ?? null, currency: 'INR', waiting: o.w ?? true });

test('summary: usual week, who is ready, who said no, value', () => {
  const data = {
    weeks: [{ week: '2026-11-02', people: 10, afterCheckin: 5 }, { week: '2026-11-09', people: 20, afterCheckin: 10 }, { week: '2026-11-16', people: 14, afterCheckin: 7 }, { week: '2026-11-23', people: 5, afterCheckin: 4 }],
    people: [
      p({ id: 'a', body: 'Yes', stage: 'high_intent', v: 30000 }),
      p({ id: 'b', body: 'When is the next batch?', v: 20000 }),
      p({ id: 'c', body: 'Yes interested', w: false }),
      p({ id: 'd', body: 'No', v: 60000 }),
      p({ id: 'e', body: 'Not now', stage: 'not_now', c: false }),
    ],
  };
  const s = summarise(data);
  assert.equal(s.usual, 14);
  assert.equal(s.thisWeek, 5);
  assert.deepEqual(s.ready.map((x) => x.leadId), ['a', 'b']);
  assert.deepEqual(s.saidNo.map((x) => x.leadId), ['d']);
  assert.equal(s.readyAdvanced, 1);
  assert.equal(s.afterCheckin, 4);
  assert.equal(s.valueInr, 50000);
  assert.match(reengagedHeadline(s), /^5 past enquirers wrote back this week, mostly answering your team's check-in messages\. 2 said yes or asked/);
});

test('briefing wiring: managers and admins, bulk Not now through set_lead_stage', () => {
  const read = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
  assert.match(read('lib/reengaged-story-data.ts'), /can_administer_organization_crm/);
  assert.match(read('app/re-engaged/actions.ts'), /set_lead_stage/);
  assert.match(read('app/re-engaged/page.tsx'), /<SmartReengagedBriefing data=\{story\}/);
  const sql = read('supabase/migrations/20261125120000_reengaged_intelligence_v1.sql');
  assert.match(sql, /grant execute on function public\.reengaged_intelligence_v1\(uuid, integer\) to service_role/);
  assert.match(sql, /test_lead/);
});
