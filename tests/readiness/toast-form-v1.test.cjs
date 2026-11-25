const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');

test('conversation submits use ToastForm with inline actions instead of redirecting', () => {
  const form = read('components/toast-form.tsx');
  assert.match(form, /toast\.success/);
  assert.match(form, /router\.refresh\(\)/);
  const result = read('lib/action-result.ts');
  assert.match(result, /NEXT_REDIRECT/);
  assert.match(result, /revalidatePath/);
  const page = read('app/conversations/page.tsx');
  for (const name of ['logInteractionInline', 'sendWhatsAppTemplateInline', 'updateLeadContextInline']) assert.ok(page.includes(name), name);
  assert.doesNotMatch(page, /logLeadInteractionAction/);
  assert.doesNotMatch(page, /updateConversationLeadContextWithActivityAction/);
});

test('inbox opens on All, newest activity first', () => {
  assert.match(read('components/conversations-sidebar.tsx'), /const defaultFilter: InboxFilter = "all";/);
});
