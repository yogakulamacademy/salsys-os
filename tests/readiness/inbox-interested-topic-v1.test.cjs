const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');

test('"Interested" is a What-people-are-asking chip, always first', () => {
  const topics = read('lib/inbox-topics.ts');
  assert.match(topics, /INBOX_TOPICS = \["interested",/);
  assert.match(topics, /interested: "Interested"/);
  assert.match(read('components/conversations-sidebar.tsx'), /Number\(b === PINNED_TOPIC\) - Number\(a === PINNED_TOPIC\)/);
  const sql = read('supabase/migrations/20261125100000_inbox_interested_topic_v1.sql');
  assert.match(sql, /then 'interested'/);
  assert.match(sql, /'interested', 'fee', 'dates'/);
});
