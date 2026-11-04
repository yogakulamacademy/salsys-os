const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const page = read('app/settings/knowledge/page.tsx');
const css = read('app/settings/knowledge/knowledge-workspace.css');
const actions = read('app/settings/knowledge/actions.ts');

test('Organization Knowledge redesign preserves tenant source-backed approval and retrieval', () => {
  assert.ok(page.includes("supabase.rpc('can_manage_organization'"));
  assert.ok(page.includes(".eq('organization_id', organizationId)"));
  assert.ok(page.includes('createKnowledgeDocumentAction'));
  assert.ok(page.includes('approveKnowledgeDocumentAction'));
  assert.ok(page.includes('archiveKnowledgeDocumentAction'));
  assert.ok(page.includes('KnowledgeRetrievalPreview'));
  assert.ok(actions.includes("supabase.rpc('create_source_backed_knowledge_document_v2'"));
  assert.ok(actions.includes("supabase.rpc('approve_knowledge_document_v1'"));
  assert.ok(actions.includes("supabase.rpc('archive_knowledge_document_v1'"));
});
test('required source fields remain visible and optional source/validity data remain available', () => {
  for (const name of ['source_name','source_type','source_uri','valid_from','valid_until','content','category','title'])
    assert.ok(page.includes('name="' + name + '"'), name);
  assert.ok(page.includes('Source name <small>Required for provenance</small>'));
  assert.ok(page.includes('SalsysOS does not fetch this URL'));
  assert.ok(page.includes('Save as Draft'));
  assert.ok(page.includes('Save & Approve'));
});
test('empty, partial, error and filtered library are distinct views', () => {
  for (const message of ['No knowledge added yet','Knowledge could not be loaded','No matching knowledge','Build your approved business knowledge','source review needed'])
    assert.ok(page.includes(message), message);
  assert.ok(page.includes('(documentRows ?? []).length > 200'));
  assert.ok(page.includes('const filteredDocuments = documents.filter'));
  assert.ok(page.includes('filteredDocuments.length === 0'));
  assert.ok(page.includes("value={canRead && total > 0 ? String(approved) : '—'}"));
  assert.ok(page.includes('getCurrentWorkspaceContext'));
  assert.ok(!page.includes('92%'));
});
test('templates never inject purportedly approved policy content', () => {
  for(const name of ['template=policy','template=faq','template=process']) assert.ok(page.includes(name));
  assert.ok(page.includes("defaultValue={template?.title || ''}"));
  assert.ok(page.includes("placeholder={template?.placeholder ||"));
  assert.ok(page.includes('name="content" required'));
  assert.ok(!page.includes('defaultValue={template?.content'));
  assert.ok(css.includes('.kn-library-empty'));
  assert.ok(css.includes('@media(max-width:640px)'));
});
