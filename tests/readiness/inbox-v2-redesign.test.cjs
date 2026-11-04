const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

const page=read('app/conversations/page.tsx');
const sidebar=read('components/conversations-sidebar.tsx');
const center=read('components/conversation-center-view.tsx');
const shell=read('components/conversation-workspace-shell.tsx');
const css=read('app/conversations/inbox-v2.css');
const safeComposer=read('components/conversation-safe-composer.tsx');
const whatsappComposer=read('components/conversation-composer.tsx');

test('Inbox redesign preserves explicit selection and read-marker safety',()=>{
  assert.ok(page.includes('query.lead ? resolvedSelected : null'));
  assert.ok(page.includes('query.lead ? resolvedSelectedId : undefined'));
  assert.ok(page.includes('<ConversationReadMarker leadId={selected.id}'));
  assert.ok(page.includes('<ConversationsSidebar'));
  assert.ok(page.includes('<ConversationWorkspaceShell'));
  assert.ok(sidebar.includes('href={\`/conversations?lead=\${lead.id}\`}'));
  assert.ok(shell.includes('hasExplicitLeadSelection'));
});
test('Sidebar retains working real filters and real lead status counts',()=>{
  for(const value of ['ibx-v2-tabs','ibx-v2-search','ibx-v2-search-line','ibx-v2-secondary-filters','Needs reply','Unread','Snoozed','setChannelFilter','setPriorityFilter','setScope','setFilter','setSearch'])assert.ok(sidebar.includes(value),value);
  assert.ok(sidebar.includes('activeScopedLeads.filter('));
  assert.ok(sidebar.includes('leads.filter('));
  assert.ok(!sidebar.includes('300 conversations'));
});
test('Notes tab shows stored CRM notes only, with loading and read-error states',()=>{
  for(const value of ['ViewMode = "conversation" | "activity" | "notes"','view === "notes"','crmActivity','item.activity_type === "internal_note"','item.activity_type === "note"','No internal notes recorded','Notes could not be loaded','loadActivity()']) assert.ok(center.includes(value),value);
  assert.ok(center.includes('view !== "activity" && view !== "notes"'));
  assert.ok(safeComposer.includes('type: "internal_note"'));
  assert.ok(whatsappComposer.includes('type: "internal_note"'));
});
test('AI drafting stays human-reviewed and provider sending remains in original actions',()=>{
  assert.ok(page.includes('<ConversationCopilot'));
  assert.ok(page.includes('className="ibx-v2-ai-toolbar"'));
  assert.ok(page.includes('normalizedWhatsAppMode === "template"'));
  assert.ok(page.includes('getMessagingEligibility('));
  assert.ok(page.includes('<WhatsAppComposer'));
  assert.ok(page.includes('<WhatsAppTemplateComposer'));
  assert.ok(page.includes('<ConversationSafeComposer'));
  assert.ok(!page.includes('Mark done'));
  assert.ok(page.includes('canManageAssignments={team.canManageAssignments}'));
  assert.ok(page.includes('<ConversationIntelligencePanel'));
});
test('Three column desktop, two column tablet and single focus mobile remain accessible',()=>{
  assert.ok(css.includes('.conversation-workspace.inbox-context-open'));
  assert.ok(css.includes('grid-template-columns:minmax(290px,335px) minmax(390px,1fr) minmax(280px,305px)'));
  assert.ok(css.includes('@media(max-width:1020px)'));
  assert.ok(css.includes('@media(max-width:620px)'));
  assert.ok(shell.includes('role="dialog"'));
  assert.ok(shell.includes('aria-modal="true"'));
  assert.ok(shell.includes('mobileContextOpen'));
  assert.ok(shell.includes('Alt+I'));
  assert.ok(shell.includes('aria-label={showDesktopContext ? "Hide customer context"'));
});
