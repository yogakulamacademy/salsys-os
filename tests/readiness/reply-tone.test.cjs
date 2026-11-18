const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');

test('every AI reply uses the house style: friendly, semi-casual, professional, short', () => {
  const tone = read('lib/reply-tone.ts');
  for (const s of ['friendly and warm, semi-casual but still professional', '2 to 4 short sentences', 'first name when it is a real name', 'at most one', 'kindly revert', 'one easy next step']) assert.ok(tone.includes(s), s);
  const copilot = read('lib/copilot-core.ts');
  assert.match(copilot, /STYLE: ' \+ REPLY_TONE_GUIDE \+ '/);
  assert.doesNotMatch(copilot, /Keep the tone warm, natural, helpful, concise/);
  // Shadow mode reuses the Copilot draft, so it inherits the same style.
  assert.match(read('app/conversations/autopilot-shadow-actions.ts'), /generateCopilotReplyAction\(leadId\)/);
});
