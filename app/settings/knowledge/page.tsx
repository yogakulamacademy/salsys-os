import Link from 'next/link';
import {
  Archive, BookOpen, BrainCircuit, CheckCircle2, Clock3, Database,
  FileText, Layers3, Link2, Plus, Search, ShieldAlert, ShieldCheck,
  Sparkles,
} from 'lucide-react';

import {
  approveKnowledgeDocumentAction,
  archiveKnowledgeDocumentAction,
  createKnowledgeDocumentAction,
} from '@/app/settings/knowledge/actions';
import { PageHeader } from '@/components/ui';
import type { ReactNode } from 'react';
import './knowledge-workspace.css';
import { KnowledgeRetrievalPreview } from '@/components/knowledge-retrieval-preview';
import { getSupabasePublicConfig, useMockData } from '@/lib/config';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

type KnowledgeDocument = {
  id: string;
  source_id: string | null;
  title: string;
  category: string;
  status: 'draft' | 'review' | 'approved' | 'expired' | 'superseded' | 'archived';
  content: string;
  version: number;
  valid_from: string | null;
  valid_until: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

type KnowledgeSource = {
  id: string;
  name: string;
  source_type: string;
  source_uri: string | null;
  status: 'active' | 'disabled' | 'archived';
};

const categories = [
  'general',
  'faq',
  'courses',
  'pricing',
  'batches',
  'payments',
  'accommodation',
  'travel',
  'certification',
  'recordings',
  'refunds',
  'transfers',
  'cancellation',
  'online_course_rules',
  'sales_scripts',
  'objection_handling',
  'health_escalation',
  'policy',
];

const sourceTypes = [
  'manual',
  'website',
  'pdf',
  'drive',
  'faq',
  'policy',
  'course',
  'crm_reply',
  'other',
];

function pretty(value: string) {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function validityLabel(document: KnowledgeDocument) {
  const now = Date.now();
  const validFrom = document.valid_from ? Date.parse(document.valid_from) : null;
  const validUntil = document.valid_until ? Date.parse(document.valid_until) : null;

  if (validFrom !== null && Number.isFinite(validFrom) && validFrom > now) {
    return `Eligible from ${new Date(validFrom).toLocaleString('en-IN', { timeZone: 'UTC' })} UTC`;
  }

  if (validUntil !== null && Number.isFinite(validUntil) && validUntil <= now) {
    return `Expired ${new Date(validUntil).toLocaleString('en-IN', { timeZone: 'UTC' })} UTC`;
  }

  if (validUntil !== null && Number.isFinite(validUntil)) {
    return `Valid until ${new Date(validUntil).toLocaleString('en-IN', { timeZone: 'UTC' })} UTC`;
  }

  return 'No expiry recorded';
}

export default async function KnowledgeSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string; q?: string; category?: string; status?: string; template?: string }>;
}) {
  const query = await searchParams;
  const { configured } = getSupabasePublicConfig();
  const live = !useMockData && configured;

  let documents: KnowledgeDocument[] = [];
  let sources: KnowledgeSource[] = [];
  let canManage = false;
  let organizationName = 'Current organization';
  let loadError: string | null = null;
  let activeOrganizationId: string | null = null;
  let partial = false;
  if (!live) loadError = useMockData ? 'Demo mode: live knowledge has not been loaded.' : 'Configure a live workspace before loading knowledge.';

  if (live) {
    const supabase = await createClient();
    const {
      data: { user }, error: authError,
    } = await supabase.auth.getUser();

    if (user) {
      try {
        const workspace = await getCurrentWorkspaceContext(supabase);
        const organizationId = workspace.activeOrganizationId;
        activeOrganizationId = organizationId;
        organizationName = workspace.activeWorkspace?.organizationName || organizationName;

        if (organizationId) {
          const [
            { data: manageData },
            { data: documentRows, error: documentError },
            { data: sourceRows, error: sourceError },
          ] = await Promise.all([
            supabase.rpc('can_manage_organization', {
              p_organization_id: organizationId,
            }),
            supabase
              .from('knowledge_documents')
              .select(
                'id, source_id, title, category, status, content, version, valid_from, valid_until, approved_at, created_at, updated_at',
              )
              .eq('organization_id', organizationId)
              .order('updated_at', { ascending: false })
              .limit(201),
            supabase
              .from('knowledge_sources')
              .select('id, name, source_type, source_uri, status')
              .eq('organization_id', organizationId)
              .order('updated_at', { ascending: false })
              .limit(500),
          ]);

          canManage = manageData === true;

          if (documentError || sourceError) {
            loadError = documentError?.message || sourceError?.message || 'Unable to load AI knowledge.';
          } else {
            partial = (documentRows ?? []).length > 200;
            documents = (documentRows ?? []).slice(0, 200) as KnowledgeDocument[];
            sources = (sourceRows ?? []) as KnowledgeSource[];
          }
        } else loadError = 'Select an active workspace before loading knowledge.';
      } catch (error) {
        loadError = error instanceof Error ? error.message : 'Unable to load AI knowledge.';
      }
    } else loadError = authError ? 'Unable to verify your session. Sign in again.' : 'Sign in before loading organization knowledge.';
  }

  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const approved = documents.filter((document) => document.status === 'approved').length;
  const drafts = documents.filter(
    (document) => document.status === 'draft' || document.status === 'review',
  ).length;


  const currentTime = Date.now();
  const needsReview = documents.filter((doc) =>
    ['review', 'expired', 'superseded'].includes(doc.status) ||
    (doc.status === 'approved' && (!doc.source_id || sourceById.get(doc.source_id)?.status !== 'active')) ||
    (doc.status === 'approved' && (
      (doc.valid_from !== null && Date.parse(doc.valid_from) > currentTime) ||
      (doc.valid_until !== null && Date.parse(doc.valid_until) <= currentTime)
    ))
  ).length;
  const usableApproved = documents.filter((doc) => {
    if (doc.status !== 'approved' || !doc.source_id) return false;
    const source = sourceById.get(doc.source_id);
    if (source?.status !== 'active') return false;
    const from = doc.valid_from ? Date.parse(doc.valid_from) : null;
    const until = doc.valid_until ? Date.parse(doc.valid_until) : null;
    return (from === null || (Number.isFinite(from) && from <= currentTime)) &&
      (until === null || (Number.isFinite(until) && until > currentTime));
  }).length;
  const total = documents.length;
  const coverage = total > 0 ? Math.round(100 * approved / total) : null;
  const statusChoices = ['all', 'approved', 'draft', 'review', 'expired', 'superseded', 'archived'];
  const statusFilter = statusChoices.includes(query.status || '') ? query.status || 'all' : 'all';
  const categoryFilter = categories.includes(query.category || '') ? query.category || 'all' : 'all';
  const search = (query.q || '').trim().slice(0, 120).toLocaleLowerCase();
  const filteredDocuments = documents.filter((doc) =>
    (statusFilter === 'all' || doc.status === statusFilter) &&
    (categoryFilter === 'all' || doc.category === categoryFilter) &&
    (!search || doc.title.toLocaleLowerCase().includes(search) ||
      doc.content.toLocaleLowerCase().includes(search))
  );
  const filterActive = Boolean(search || statusFilter !== 'all' || categoryFilter !== 'all');
  const templateName = ['policy', 'faq', 'process'].includes(query.template || '')
    ? query.template || '' : '';
  const template = templateName === 'policy'
    ? { title:'Refund policy', category:'policy', placeholder:'Enter the verified refund eligibility, payment rules and exceptions approved by your organization.' }
    : templateName === 'faq'
      ? { title:'Payment FAQ', category:'faq', placeholder:'Enter the approved answer to a real customer payment question. Include any conditions or limitations.' }
      : templateName === 'process'
        ? { title:'Admissions process', category:'general', placeholder:'Document the exact approved steps, responsible people and escalation path.' }
        : null;
  const canRead = !loadError;
  const knowledgeReadiness = !canRead ? 'Unavailable'
    : usableApproved > 0 ? 'Eligible knowledge found'
      : partial ? 'Needs verification' : 'Not ready';
  const knowledgeReadinessDescription = !canRead
    ? 'Current library status could not be verified.'
    : usableApproved > 0
      ? 'Eligible, source-backed items exist in this view. Test retrieval before relying on an answer.'
      : partial
        ? 'The loaded view is limited. Check retrieval and older records before assessing readiness.'
        : 'Add currently valid, source-backed, approved knowledge to support Co-Pilot retrieval.';
  return (
    <div className="kn space-y-5" aria-label="Organization Knowledge workspace">
      <PageHeader eyebrow="AI Intelligence" title="Organization Knowledge"
        description={'Create and manage approved policies, FAQs, processes and sales guidance for ' + organizationName + '. The Co-Pilot can use only approved, currently valid knowledge with eligible retrieval evidence.'}
      />

      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><div className="text-sm font-semibold">Website discovery</div>
            <p className="mt-1 text-xs text-slate-500">Discover public site pages before reviewing or creating AI knowledge.</p></div>
          <Link href="/settings/knowledge/discovery" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold hover:bg-slate-50">Open discovery →</Link>
        </div>
      </div>
      
      {query.notice ? <div className="kn-flash kn-success" role="status">{query.notice}</div> : null}
      {query.error || loadError ? <div className="kn-flash kn-error" role="alert">{query.error || loadError}</div> : null}

      <section className="kn-overview" aria-label="Knowledge overview">
        <div className="kn-stats">
          <Metric icon={<Database size={22}/>} value={canRead && total > 0 ? String(approved) : '—'} title="Approved items" hint={partial ? 'Loaded view only' : 'Approved status'}/>
          <Metric icon={<CheckCircle2 size={22}/>} value={canRead && coverage !== null ? String(coverage) + '%' : '—'}
            title="Approval coverage" hint="Approved / loaded items"/>
          <Metric icon={<Sparkles size={22}/>} value={canRead && total > 0 ? String(drafts) : '—'} title="Drafts" hint="Draft or in review"/>
          <Metric icon={<Clock3 size={22}/>} value={canRead && total > 0 ? String(needsReview) : '—'} title="Needs review" hint="Unique items in view"/>
        </div>
        <div className="kn-readiness">
          <Sparkles size={26} aria-hidden="true"/>
          <div><h2>Co-Pilot Readiness</h2><p>{knowledgeReadinessDescription}</p></div>
          <span className="kn-readiness-state" data-ready={usableApproved > 0 && canRead ? 'true' : 'false'}>{knowledgeReadiness}</span>
        </div>
      </section>
      {partial ? <p className="kn-scope-note" role="status">Showing the 200 most recently updated items; all summary counts describe this view. The retrieval test can search all eligible knowledge.</p> : null}

      <div className="kn-test">
        <KnowledgeRetrievalPreview key={activeOrganizationId ?? 'unavailable'} enabled={live && canManage && !loadError}/>
      </div>

      <div className="kn-workspace">
        <section className="kn-panel kn-create" id="knowledge-create" aria-labelledby="kn-create-heading">
          <div className="kn-heading">
            <span className="kn-heading-icon"><Plus size={22}/></span>
            <div><h2 id="kn-create-heading">Add Knowledge</h2>
              <p>Add organization-approved information with a documented source.</p></div>
          </div>
          {template ? <div className="kn-template-note">
            {pretty(templateName)} template selected. Add the approved answer and a real source before saving.
          </div> : null}
          {canManage ? <form action={createKnowledgeDocumentAction} className="kn-create-form">
            <label className="kn-field"><span>Title</span>
              <input name="title" required maxLength={180}
                defaultValue={template?.title || ''}
                placeholder="e.g., Refund policy, Course access process"/>
            </label>
            <label className="kn-field"><span>Category</span>
              <select name="category" defaultValue={template?.category || 'general'}>
                {categories.map((category) => <option key={category} value={category}>{pretty(category)}</option>)}
              </select>
            </label>
            <label className="kn-field"><span>Approved answer / policy</span>
              <textarea name="content" required rows={6} minLength={10}
                placeholder={template?.placeholder || 'Write the exact organization-approved answer the Co-Pilot is allowed to retrieve...'}/>
            </label>
            <label className="kn-field"><span>Source name <small>Required for provenance</small></span>
              <input name="source_name" required maxLength={240} placeholder="e.g., Admissions policy approved this month"/>
            </label>
            <details className="kn-advanced">
              <summary><Layers3 size={16}/> Source details & validity <span>Optional settings</span></summary>
              <div className="kn-advanced-fields">
                <label className="kn-field"><span>Source type</span>
                  <select name="source_type" defaultValue="manual">
                    {sourceTypes.map((type) => <option key={type} value={type}>{pretty(type)}</option>)}
                  </select>
                </label>
                <label className="kn-field"><span>Source reference URL <small>Optional</small></span>
                  <input name="source_uri" type="url" maxLength={2048} placeholder="https://..."/>
                  <small>SalsysOS does not fetch this URL when saving; it is stored as passive provenance.</small>
                </label>
                <div className="kn-validity">
                  <label className="kn-field"><span>Valid from <small>UTC, optional</small></span>
                    <input name="valid_from" type="datetime-local" step="60"/>
                  </label>
                  <label className="kn-field"><span>Valid until <small>UTC, optional</small></span>
                    <input name="valid_until" type="datetime-local" step="60"/>
                  </label>
                </div>
              </div>
            </details>
            <div className="kn-authority"><ShieldCheck size={18}/>
              <span><strong>Keep it accurate and clear.</strong> Approval does not override source or validity requirements. Save uncertain information as a draft.</span>
            </div>
            <div className="kn-create-actions">
              <button type="submit" name="intent" value="draft" className="kn-secondary">Save as Draft</button>
              <button type="submit" name="intent" value="approve" className="kn-primary"><CheckCircle2 size={16}/> Save & Approve</button>
            </div>
          </form> : <div className="kn-readonly">Organization admin access is required to create or approve knowledge.</div>}
        </section>

        <section className="kn-panel kn-library" aria-labelledby="kn-library-heading">
          <div className="kn-heading kn-library-heading">
            <span className="kn-heading-icon"><BookOpen size={21}/></span>
            <div><h2 id="kn-library-heading">Knowledge Library</h2>
              <p>Approved answers, drafts, policies and their provenance.</p></div>
          </div>
          {documents.length > 0 && canRead ? <form className="kn-library-filters" method="GET" action="/settings/knowledge">
            <label className="kn-filter-search"><Search size={16}/><span className="sr-only">Search knowledge</span>
              <input name="q" type="search" maxLength={120} defaultValue={query.q || ''} placeholder="Search knowledge..."/>
            </label>
            <label><span className="sr-only">Knowledge category</span>
              <select name="category" defaultValue={categoryFilter}>
                <option value="all">All categories</option>
                {categories.map((category) => <option key={category} value={category}>{pretty(category)}</option>)}
              </select>
            </label>
            <label><span className="sr-only">Knowledge status</span>
              <select name="status" defaultValue={statusFilter}>
                <option value="all">All statuses</option>
                {statusChoices.slice(1).map((status) => <option key={status} value={status}>{pretty(status)}</option>)}
              </select>
            </label>
            <button type="submit" className="kn-secondary">Apply</button>
            {filterActive ? <a className="kn-clear-filters" href="/settings/knowledge">Clear</a> : null}
          </form> : null}
          {canRead && documents.length > 0 ? (
            <div className="kn-library-records">
              <div className="kn-library-record-count">{filteredDocuments.length} of {documents.length} items in loaded view</div>
              {filteredDocuments.length === 0 ? (
                <div className="kn-library-empty kn-filter-empty"><Search size={34}/>
                  <h3>No matching knowledge</h3><p>Try another search, status or category.</p>
                  <a className="kn-secondary" href="/settings/knowledge">Clear filters</a></div>
              ) : filteredDocuments.map((document) => {
                const source = document.source_id ? sourceById.get(document.source_id) : null;
                return <article key={document.id} className="kn-document">
                  <div className="kn-document-title"><FileText size={17}/>
                    <h3>{document.title}</h3>
                    <span className="kn-status" data-status={document.status}>{pretty(document.status)}</span>
                    <span className="kn-category">{pretty(document.category)}</span>
                  </div>
                  <p className="kn-document-content">{document.content}</p>
                  <div className="kn-document-meta">
                    {source ? <span><Link2 size={12}/> Source: {source.name} · {pretty(source.source_type)}{source.status !== 'active' ? ' · ' + pretty(source.status) : ''}</span>
                      : <span className="kn-missing-source">Legacy item · source review needed</span>}
                    <span>{validityLabel(document)}</span>
                    <span>Version {document.version}</span>
                  </div>
                  {source?.source_uri ? <p className="kn-reference">Reference: {source.source_uri}</p> : null}
                  <p className="kn-updated">Updated {new Date(document.updated_at).toLocaleString('en-IN')}</p>
                  {canManage && document.status !== 'archived' ? <div className="kn-document-actions">
                    {document.status !== 'approved' ? <form action={approveKnowledgeDocumentAction}>
                      <input type="hidden" name="document_id" value={document.id}/>
                      <button type="submit" className="kn-primary kn-small"><CheckCircle2 size={14}/> Approve</button>
                    </form> : null}
                    <form action={archiveKnowledgeDocumentAction}>
                      <input type="hidden" name="document_id" value={document.id}/>
                      <button type="submit" className="kn-secondary kn-small"><Archive size={14}/> Archive</button>
                    </form>
                  </div> : null}
                </article>;
              })}
            </div>
          ) : <div className="kn-library-empty" aria-label="Knowledge library empty state">
            {loadError ? <>
              <ShieldAlert size={42}/>
              <h3>Knowledge could not be loaded</h3>
              <p>Readiness is unknown until the workspace can be read. An unavailable library is not an empty library.</p>
            </> : <>
              <span className="kn-empty-illustration" aria-hidden="true"><FileText size={58}/><Sparkles size={27}/></span>
              <h3>No knowledge added yet</h3>
              <p className="kn-empty-emphasis">Build your approved business knowledge</p>
              <p>Add approved policies, FAQs, processes and sales guidance so your Co-Pilot can retrieve organization-specific answers.</p>
              {canManage ? <>
                <a href="#knowledge-create" className="kn-primary"><Plus size={16}/> Add the first draft</a>
                <div className="kn-template-divider">Or get started with a template</div>
                <div className="kn-template-links">
                  <a href="/settings/knowledge?template=policy#knowledge-create"><ShieldCheck size={15}/> Policy</a>
                  <a href="/settings/knowledge?template=faq#knowledge-create"><BrainCircuit size={15}/> FAQ</a>
                  <a href="/settings/knowledge?template=process#knowledge-create"><Layers3 size={15}/> Process</a>
                </div>
              </> : null}
            </>}
          </div>}
        </section>
      </div>
      <p className="kn-governance-note">Only organization-approved, currently eligible source-backed records should inform Co-Pilot responses. Live CRM data remains authoritative for current prices, dates and availability.</p>
    </div>
  );
}

function Metric({ icon, value, title, hint }: {
  icon: ReactNode; value: string; title: string; hint: string;
}) {
  return <div className="kn-metric">
    <span className="kn-metric-icon">{icon}</span>
    <div><strong>{value}</strong><span>{title}</span><small>{hint}</small></div>
  </div>;
}
