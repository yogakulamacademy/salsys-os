import {
  Archive,
  BrainCircuit,
  CheckCircle2,
  FileText,
  Link2,
  Plus,
  ShieldCheck,
} from 'lucide-react';

import {
  approveKnowledgeDocumentAction,
  archiveKnowledgeDocumentAction,
  createKnowledgeDocumentAction,
} from '@/app/settings/knowledge/actions';
import { EmptyState, PageHeader } from '@/components/ui';
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

function statusClass(status: KnowledgeDocument['status']) {
  if (status === 'approved') {
    return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  }

  if (status === 'draft' || status === 'review') {
    return 'bg-amber-50 text-amber-700 ring-amber-200';
  }

  return 'bg-slate-100 text-slate-600 ring-slate-200';
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
  searchParams: Promise<{ notice?: string; error?: string }>;
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
  const archived = documents.filter((document) => document.status === 'archived').length;
  const sourceBacked = documents.filter((document) => Boolean(document.source_id)).length;
  const approvedNeedingSourceReview = documents.filter(
    (document) => document.status === 'approved' && !document.source_id,
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="AI Intelligence"
        title="Organization Knowledge"
        description={`Approved facts for ${organizationName}. The Co-Pilot can use only approved, currently valid knowledge; drafts, archived items and ineligible validity windows are excluded from retrieval.`}
      />

      {query.notice ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {query.notice}
        </div>
      ) : null}

      {query.error || loadError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          {query.error || loadError}
        </div>
      ) : null}

      {!loadError && documents.length > 0 ? <section aria-label="Knowledge library summary" className="rounded-xl border border-line bg-surface px-4 py-3">
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-copy">
          <span><strong className="text-copy-strong">{documents.length}</strong> knowledge items in this view</span>
          {approved > 0 ? <span><strong className="text-copy-strong">{approved}</strong> approved status</span> : null}
          {drafts > 0 ? <span><strong className="text-copy-strong">{drafts}</strong> draft / review</span> : null}
          {archived > 0 ? <span><strong className="text-copy-strong">{archived}</strong> archived</span> : null}
          {sourceBacked > 0 ? <span><strong className="text-copy-strong">{sourceBacked}</strong> source-backed</span> : null}
          {approvedNeedingSourceReview > 0 ? <span className="text-amber-700"><strong>{approvedNeedingSourceReview}</strong> approved items need source review</span> : null}
        </div>
        <p className="mt-1 text-xs text-copy-muted">Approval, provenance, validity and question matching are separate controls. Legacy approved items without a linked source remain visible for review.</p>
      </section> : null}

      {partial ? <p className="text-sm text-copy-muted">Showing the 200 most recently updated items; counts describe this view. The retrieval preview searches all eligible knowledge.</p> : null}

      <KnowledgeRetrievalPreview key={activeOrganizationId ?? 'unavailable'} enabled={live && canManage && !loadError} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)]">
        <section className="card-pad" id="knowledge-create">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700">
              <Plus size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-950">Add source-backed organization knowledge</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Record the business source behind each fact. Live CRM remains authoritative for current prices, dates and availability.
              </p>
            </div>
          </div>

          {canManage ? (
            <form action={createKnowledgeDocumentAction} className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Title</span>
                <input
                  name="title"
                  required
                  maxLength={180}
                  placeholder="Example: Online course recording access"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Category</span>
                <select
                  name="category"
                  defaultValue="general"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                >
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {pretty(category)}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Source name</span>
                  <input
                    name="source_name"
                    required
                    maxLength={240}
                    placeholder="Example: Admissions policy approved 3 Nov"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Source type</span>
                  <select
                    name="source_type"
                    defaultValue="manual"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                  >
                    {sourceTypes.map((sourceType) => (
                      <option key={sourceType} value={sourceType}>{pretty(sourceType)}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Source reference URL <span className="font-medium normal-case tracking-normal">(optional)</span></span>
                <input
                  name="source_uri"
                  type="url"
                  maxLength={2048}
                  placeholder="https://..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                />
                <span className="mt-1 block text-xs leading-5 text-slate-400">Stored as provenance only. SalsysOS does not fetch this URL when you save the knowledge item.</span>
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Valid from <span className="font-medium normal-case tracking-normal">(UTC, optional)</span></span>
                  <input
                    name="valid_from"
                    type="datetime-local"
                    step="60"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Valid until <span className="font-medium normal-case tracking-normal">(UTC, optional)</span></span>
                  <input
                    name="valid_until"
                    type="datetime-local"
                    step="60"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Approved answer / policy</span>
                <textarea
                  name="content"
                  required
                  rows={9}
                  placeholder="Write the exact organization-approved fact or answer the AI is allowed to use..."
                  className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-6 text-slate-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                />
              </label>

              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-800">
                <strong>Authority rule:</strong> approval does not override validity. Only approved, currently valid knowledge with an eligible source can be retrieved. Save uncertain information as a draft.
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  name="intent"
                  value="draft"
                  className="btn-secondary"
                >
                  Save draft
                </button>
                <button
                  type="submit"
                  name="intent"
                  value="approve"
                  className="btn-primary"
                >
                  <ShieldCheck size={15} />
                  Save & approve
                </button>
              </div>
            </form>
          ) : (
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Organization admin access is required to create or approve knowledge.
            </div>
          )}
        </section>

        <section className="card-pad">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700">
                <BrainCircuit size={18} />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-950">Knowledge library</h2>
                <p className="mt-1 text-sm text-slate-500">Approved answers, drafts, provenance and validity for this organization.</p>
              </div>
            </div>
            <div className="rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">
              Approved-only search
            </div>
          </div>

          {documents.length === 0 ? (
            <EmptyState title={loadError ? 'Knowledge could not be loaded' : 'Build your approved business knowledge'} description={loadError ? 'Readiness is unknown until the workspace can be read. An unavailable library is not an empty library.' : 'Start with a source-backed draft, have an organization admin approve it, then test retrieval with a real customer question.'} action={!loadError && canManage ? <a className="btn-primary" href="#knowledge-create">Add the first draft</a> : undefined} />
          ) : (
            <div className="mt-5 space-y-3">
              {documents.map((document) => {
                const source = document.source_id ? sourceById.get(document.source_id) : null;
                return (
                  <article key={document.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <FileText size={15} className="text-slate-400" />
                          <h3 className="font-bold text-slate-900">{document.title}</h3>
                          <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold ring-1 ring-inset ${statusClass(document.status)}`}>
                            {pretty(document.status)}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
                            {pretty(document.category)}
                          </span>
                        </div>
                        <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                          {document.content}
                        </p>

                        <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium text-slate-500">
                          {source ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1">
                              <Link2 size={11} />
                              Source: {source.name} · {pretty(source.source_type)}{source.status !== 'active' ? ` · ${pretty(source.status)}` : ''}
                            </span>
                          ) : (
                            <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">Legacy item · source review needed</span>
                          )}
                          <span className="rounded-full bg-slate-100 px-2 py-1">{validityLabel(document)}</span>
                        </div>

                        {source?.source_uri ? (
                          <p className="mt-2 truncate text-[11px] text-slate-400">Reference: {source.source_uri}</p>
                        ) : null}

                        <div className="mt-3 text-[11px] font-medium text-slate-400">
                          Version {document.version} · Updated {new Date(document.updated_at).toLocaleString('en-IN')}
                        </div>
                      </div>
                    </div>

                    {canManage && document.status !== 'archived' ? (
                      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                        {document.status !== 'approved' ? (
                          <form action={approveKnowledgeDocumentAction}>
                            <input type="hidden" name="document_id" value={document.id} />
                            <button type="submit" className="btn-primary !px-3 !py-2 text-xs">
                              <CheckCircle2 size={14} />
                              Approve
                            </button>
                          </form>
                        ) : null}

                        <form action={archiveKnowledgeDocumentAction}>
                          <input type="hidden" name="document_id" value={document.id} />
                          <button type="submit" className="btn-secondary !px-3 !py-2 text-xs">
                            <Archive size={14} />
                            Archive
                          </button>
                        </form>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
