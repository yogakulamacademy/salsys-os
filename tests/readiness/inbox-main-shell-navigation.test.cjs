const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const primary = read('components/desktop-hover-sidebar-v3.tsx');
const mainShell = read('components/app-shell.tsx');
const crm = read('components/crm/crm-navigation.tsx');
const inboxLayout = read('app/conversations/layout.tsx');
const inboxPage = read('app/conversations/page.tsx');

test('Inbox is an independent main-shell destination for admissions and privileged users', () => {
  assert.equal((primary.match(/id: "inbox"/g) || []).length, 2);
  assert.equal((primary.match(/label: "Inbox",\s*icon: MessageSquareText,\s*href: "\/conversations"/g) || []).length, 2);
  assert.ok(primary.includes('href: "/conversations"'));
  assert.ok(!primary.includes('{ label: "Inbox", href: "/conversations" }'), 'No CRM submenu duplicates');
  assert.ok(!primary.includes('"/pipeline", "/conversations", "/follow-ups"'), 'CRM no longer claims Inbox route');
  assert.ok(!/id: "crm"[\s\S]*?activeHrefs: \[[^\]]*"\/conversations"/.test(primary));
  // The main sidebar and mobile drawer are driven from the same section list.
  assert.ok(primary.includes('sections.map((section) => {'));
});

test('Legacy main shell does not nest Inbox under CRM', () => {
  assert.equal((mainShell.match(/id: "inbox"/g) || []).length, 2);
  assert.equal((mainShell.match(/href: "\/conversations", label: "Inbox", icon: MessageSquareText/g) || []).length, 2);
  assert.ok(!/href: "\/pipeline", label: "Pipeline", icon: Boxes },\s*\{ href: "\/conversations"/.test(mainShell));
  assert.ok(!/href: "\/pipeline", label: "My pipeline", icon: Boxes },\s*\{ href: "\/conversations"/.test(mainShell));
  assert.ok(!crm.includes("href: '/conversations'"));
  assert.ok(!crm.includes("label: 'Inbox'"));
});

test('Inbox route uses the main shell without CRM frame, preserving messaging and authorization', () => {
  assert.ok(inboxLayout.includes('inbox-standalone-scope'));
  assert.ok(!inboxLayout.includes('CrmWorkspaceFrame'));
  assert.ok(inboxLayout.includes('hasCurrentWorkspaceAccess("sales")'));
  assert.ok(inboxLayout.includes('redirect("/dashboard")'));
  assert.ok(inboxLayout.includes('ConversationCollaborationDock'));
  assert.ok(inboxLayout.includes('InstagramWhatsAppHandoffBanner'));
  assert.ok(inboxLayout.includes('CrmLeadInspectorBridge'));
  assert.ok(inboxPage.includes('ConversationsSidebar'));
  assert.ok(inboxPage.includes('ConversationWorkspaceShell'));
});
