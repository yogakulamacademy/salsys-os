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

test('the knowledge page renders bulk import only for a verified workspace manager', async () => {
  const ts = require('typescript');
  const { renderToStaticMarkup } = require('react-dom/server');
  const code = ts.transpileModule(page, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const organizationId = '10000000-0000-4000-8000-000000000001';
  const scopeKey = 'a'.repeat(64);
  const render = async ({ canManage, resolvedScope, mock = false }) => {
    const scopes = [];
    const emptyRows = { data: [], error: null };
    const dependencies = {
      'react/jsx-runtime': require('react/jsx-runtime'),
      'lucide-react': require('lucide-react'),
      './knowledge-workspace.css': {},
      '@/components/page-feedback': { PageFeedback: () => null },
      '@/components/ui': { PageHeader: () => null },
      '@/components/knowledge-retrieval-preview': { KnowledgeRetrievalPreview: () => null },
      '@/components/knowledge-suggestions': { KnowledgeSuggestions: () => null },
      '@/components/knowledge-import-centre-polling-review': {
        KnowledgeImportCentrePollingReview: ({ scopeKey: value }) => `Import Centre ${value}`,
      },
      '@/app/settings/knowledge/actions': {},
      '@/lib/config': { useMockData: mock, getSupabasePublicConfig: () => ({ configured: true }) },
      '@/lib/knowledge-import-server-runtime': { resolveKnowledgeImportPageScope: async (id) => {
        scopes.push(id);
        return resolvedScope;
      } },
      '@/lib/supabase/server': { createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'fixture-user' } }, error: null }) },
        rpc: async () => ({ data: canManage }),
        from: () => ({
          select() { return this; }, eq() { return this; }, order() { return this; },
          in() { return this; }, gte() { return this; }, async limit() { return emptyRows; },
        }),
      }) },
      '@/lib/workspace': { getCurrentWorkspaceContext: async () => ({ activeOrganizationId: organizationId }) },
    };
    const exports = {};
    new Function('require', 'exports', code)((name) => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`);
      return dependencies[name];
    }, exports);
    return { html: renderToStaticMarkup(await exports.default({ searchParams: Promise.resolve({}) })), scopes };
  };

  const owner = await render({ canManage: true, resolvedScope: scopeKey });
  assert.match(owner.html, new RegExp(`Import Centre ${scopeKey}`));
  assert.deepEqual(owner.scopes, [organizationId]);
  const unavailable = await render({ canManage: true, resolvedScope: null });
  assert.doesNotMatch(unavailable.html, /Import Centre/);
  assert.match(unavailable.html, /Import as drafts/);
  for (const options of [{ canManage: false }, { canManage: true, mock: true }]) {
    const result = await render({ ...options, resolvedScope: scopeKey });
    assert.doesNotMatch(result.html, /Import Centre/);
    assert.deepEqual(result.scopes, []);
  }
});
