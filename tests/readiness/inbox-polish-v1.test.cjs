const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = (p) => fs.readFileSync(require('node:path').join(__dirname, '../..', p), 'utf8');

test('status filters are scrollable pills like the channel chips', () => {
  const sidebar = read('components/conversations-sidebar.tsx');
  assert.match(sidebar, /ibx-v2-tabs ibx-v3-pills flex gap-1\.5 overflow-x-auto/);
  assert.match(sidebar, /aria-label="Filter by question topic" className="flex gap-1\.5 overflow-x-auto/);
  assert.doesNotMatch(sidebar, /aria-label="Filter by question topic" className="flex flex-wrap/);
});

test('website lead without an approved WhatsApp template gets the draft composer with email, not a dead end', () => {
  const page = read('app/conversations/page.tsx');
  assert.match(page, /canStartWhatsApp && whatsappTemplateAction && \(hasStartTemplates \|\| whatsappTemplateCatalog\.error\)/);
  assert.match(page, /emailTo=\{selected\.currentContactChannel === "instagram" \? null : selectedEmail\}/);
  const composer = read('components/conversation-safe-composer.tsx');
  assert.match(composer, /mailto:\$\{emailTo\}/);
  assert.match(composer, /Nothing is sent from the CRM/);
});

test('header shows one needs-reply pill with the wait time', () => {
  const page = read('app/conversations/page.tsx');
  assert.match(page, /\{selectedSummary\.needsReply \? "Needs reply" : "First contact"\}\s*\{selectedSummary\.waitingSince/);
  assert.doesNotMatch(page, /Waiting \{formatWaiting/);
});

test('collaborate dock is a compact round button unless teammates are viewing', () => {
  const dock = read('components/conversation-collaboration-dock.tsx');
  assert.match(dock, /w-11 justify-center px-0/);
  assert.match(dock, /aria-label=/);
});
