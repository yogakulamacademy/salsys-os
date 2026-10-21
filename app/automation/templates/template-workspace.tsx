'use client';

import Link from 'next/link';
import { createPortal } from 'react-dom';
import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Clock3,
  ExternalLink,
  Filter,
  MessageSquareText,
  MoreHorizontal,
  Search,
  Smartphone,
  X,
  XCircle,
} from 'lucide-react';

import { TemplateSyncButton } from '@/app/automation/templates/template-sync-button';

export type TemplateWorkspaceRow = {
  id: string;
  whatsapp_account_id: string;
  template_name: string;
  language_code: string;
  category: string | null;
  approval_status: string;
  provider_status_raw: string | null;
  parameter_schema: Record<string, unknown> | null;
  active: boolean;
  last_synced_at: string;
};

export type TemplateSyncRunRow = {
  id: string;
  status: string;
  pages_fetched: number;
  templates_seen: number;
  templates_upserted: number;
  templates_deactivated: number;
  provider_error: string | null;
  started_at: string;
  finished_at: string | null;
};

type Props = {
  templates: TemplateWorkspaceRow[];
  latestSync: TemplateSyncRunRow | null;
  accountPhone: string | null;
  accountConnected: boolean;
  canSync: boolean;
};

type DrawerTab = 'details' | 'variables' | 'sync';

function statusClass(status: string) {
  const value = status.toLowerCase();
  if (value === 'approved' || value === 'completed') return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  if (value === 'pending' || value === 'running') return 'bg-amber-50 text-amber-700 ring-amber-200';
  if (value === 'rejected' || value === 'failed' || value === 'disabled') return 'bg-rose-50 text-rose-700 ring-rose-200';
  return 'bg-slate-100 text-slate-600 ring-slate-200';
}

function variableCount(schema: Record<string, unknown> | null) {
  if (!schema) return 0;
  const body = Number(schema.body_variable_count ?? 0);
  const header = Number(schema.header_variable_count ?? 0);
  return (Number.isFinite(body) ? body : 0) + (Number.isFinite(header) ? header : 0);
}

function relativeTime(value: string | null) {
  if (!value) return 'Never';
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(value).toLocaleDateString('en-IN');
}

function prettify(value: string | null) {
  if (!value) return '—';
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function MetricCard({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1.5 text-2xl font-bold text-slate-950">{value}</div>
      <div className="mt-0.5 text-xs text-slate-400">{note}</div>
    </div>
  );
}

function TemplateDrawer({ template, latestSync, onClose }: { template: TemplateWorkspaceRow; latestSync: TemplateSyncRunRow | null; onClose: () => void }) {
  const [tab, setTab] = useState<DrawerTab>('details');
  const totalVariables = variableCount(template.parameter_schema);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close template details"
        className="fixed inset-x-0 bottom-0 top-[73px] z-40 bg-slate-950/20 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <aside className="fixed bottom-0 right-0 top-[73px] z-50 flex w-full flex-col border-l border-slate-200 bg-white shadow-2xl sm:w-[560px]">
        <div className="shrink-0 border-b border-slate-200 bg-white px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-bold text-slate-950">{template.template_name}</h2>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${statusClass(template.approval_status)}`}>
                  {prettify(template.approval_status)}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {prettify(template.category)} · {template.language_code}
              </p>
            </div>
            <button type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900">
              <X size={17} />
            </button>
          </div>

          <div className="mt-4 flex gap-1 rounded-xl bg-slate-100 p-1">
            {([
              ['details', 'Details'],
              ['variables', `Variables${totalVariables ? ` · ${totalVariables}` : ''}`],
              ['sync', 'Sync'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${tab === value ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {tab === 'details' ? (
            <div className="space-y-5">
              <div className="rounded-2xl bg-[#eef7f1] p-4">
                <div className="mx-auto max-w-[390px] rounded-2xl rounded-tr-md bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <MessageSquareText size={14} className="text-emerald-600" /> WhatsApp template
                  </div>
                  <div className="mt-3 text-sm leading-6 text-slate-700">
                    Message content preview is not stored in the current SalsysOS template record.
                  </div>
                  <div className="mt-3 text-[11px] text-slate-400">Metadata verified from Meta sync</div>
                </div>
              </div>

              <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
                {[
                  ['Category', prettify(template.category)],
                  ['Language', template.language_code],
                  ['Meta status', prettify(template.approval_status)],
                  ['Provider status', template.provider_status_raw || '—'],
                  ['Local state', template.active ? 'Active' : 'Inactive'],
                  ['Last synced', new Date(template.last_synced_at).toLocaleString('en-IN')],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                    <span className="text-slate-500">{label}</span>
                    <span className="text-right font-semibold text-slate-800">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {tab === 'variables' ? (
            <div>
              <h3 className="text-sm font-bold text-slate-950">Template variables</h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">SalsysOS shows only variable counts that were returned in the synchronized parameter schema. It does not invent semantic mappings.</p>
              {totalVariables ? (
                <div className="mt-4 space-y-2">
                  {Array.from({ length: totalVariables }).map((_, index) => (
                    <div key={index} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
                      <span className="font-mono text-sm font-semibold text-slate-800">{`{{${index + 1}}}`}</span>
                      <span className="text-xs text-slate-400">Unmapped</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">No variables are recorded for this template.</div>
              )}
            </div>
          ) : null}

          {tab === 'sync' ? (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-bold text-slate-950">Template sync</h3>
                <p className="mt-1 text-sm text-slate-500">Provider metadata remains authoritative.</p>
              </div>
              <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                  <span className="text-slate-500">This template</span>
                  <span className="font-semibold text-slate-800">{relativeTime(template.last_synced_at)}</span>
                </div>
                <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                  <span className="text-slate-500">Latest catalog sync</span>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${statusClass(latestSync?.status || 'unknown')}`}>
                    {prettify(latestSync?.status || 'Not run')}
                  </span>
                </div>
                {latestSync ? (
                  <>
                    <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm"><span className="text-slate-500">Templates checked</span><span className="font-semibold text-slate-800">{latestSync.templates_seen}</span></div>
                    <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm"><span className="text-slate-500">Updated</span><span className="font-semibold text-slate-800">{latestSync.templates_upserted}</span></div>
                    <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm"><span className="text-slate-500">Deactivated</span><span className="font-semibold text-slate-800">{latestSync.templates_deactivated}</span></div>
                  </>
                ) : null}
              </div>
              {latestSync?.provider_error ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-800">
                  The latest provider sync reported an error. Open Provider Health for technical diagnostics.
                </div>
              ) : null}
              <Link href="/automation/audits" className="inline-flex items-center gap-2 text-sm font-semibold text-violet-700 hover:text-violet-900">
                Open Provider Health <ExternalLink size={14} />
              </Link>
            </div>
          ) : null}
        </div>
      </aside>
    </>,
    document.body,
  );
}

export function TemplateWorkspace({ templates, latestSync, accountPhone, accountConnected, canSync }: Props) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [category, setCategory] = useState('all');
  const [language, setLanguage] = useState('all');
  const [selected, setSelected] = useState<TemplateWorkspaceRow | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const activeTemplates = templates.filter((row) => row.active);
  const approved = activeTemplates.filter((row) => row.approval_status === 'approved').length;
  const pending = activeTemplates.filter((row) => row.approval_status === 'pending').length;
  const rejected = activeTemplates.filter((row) => row.approval_status === 'rejected').length;
  const inactive = templates.filter((row) => !row.active).length;

  const categories = useMemo(() => Array.from(new Set(templates.map((row) => row.category).filter(Boolean) as string[])).sort(), [templates]);
  const languages = useMemo(() => Array.from(new Set(templates.map((row) => row.language_code).filter(Boolean))).sort(), [templates]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return templates.filter((row) => {
      if (status === 'inactive' && row.active) return false;
      if (status !== 'all' && status !== 'inactive' && row.approval_status !== status) return false;
      if (category !== 'all' && row.category !== category) return false;
      if (language !== 'all' && row.language_code !== language) return false;
      if (query && !`${row.template_name} ${row.category || ''} ${row.language_code}`.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [templates, search, status, category, language]);

  if (!accountConnected) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-violet-50 text-violet-700"><Smartphone size={21} /></div>
        <h2 className="mt-4 text-lg font-bold text-slate-950">WhatsApp isn't connected</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Connect a default WhatsApp Business account before synchronizing templates.</p>
        <Link href="/settings/integrations" className="btn-primary mt-5 inline-flex">Connect WhatsApp <ExternalLink size={14} /></Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">WhatsApp</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">WhatsApp Templates</h1>
          <p className="mt-1.5 text-sm text-slate-500">Manage approved templates used in WhatsApp conversations and automations.</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1.5"><Smartphone size={13} /> {accountPhone || 'Connected account'}</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1.5"><Clock3 size={13} /> Last synced {relativeTime(latestSync?.started_at ?? null)}</span>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <TemplateSyncButton disabled={!canSync} />
          <details className="relative">
            <summary className="grid h-10 w-10 cursor-pointer list-none place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 [&::-webkit-details-marker]:hidden"><MoreHorizontal size={18} /></summary>
            <div className="absolute right-0 z-20 mt-2 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
              <Link href="/settings/integrations" className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">WhatsApp connection <ExternalLink size={13} /></Link>
              <Link href="/automation/flow-builder" className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Open Flow Builder <ExternalLink size={13} /></Link>
              <Link href="/automation/audits" className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Provider Health <ExternalLink size={13} /></Link>
            </div>
          </details>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Approved" value={approved} note="Available for eligible sends" />
        <MetricCard label="Pending" value={pending} note="Awaiting Meta review" />
        <MetricCard label="Rejected" value={rejected} note="Needs provider-side revision" />
        <MetricCard label="Inactive" value={inactive} note="No longer locally active" />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search templates..." className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-violet-300 focus:bg-white focus:ring-2 focus:ring-violet-100" />
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="hidden items-center gap-1.5 px-1 text-xs font-semibold text-slate-400 sm:inline-flex"><Filter size={13} /> Filter</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none">
              <option value="all">All statuses</option><option value="approved">Approved</option><option value="pending">Pending</option><option value="rejected">Rejected</option><option value="inactive">Inactive</option>
            </select>
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none">
              <option value="all">All categories</option>{categories.map((value) => <option key={value} value={value}>{prettify(value)}</option>)}
            </select>
            <select value={language} onChange={(event) => setLanguage(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none">
              <option value="all">All languages</option>{languages.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>
        </div>

        {templates.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <MessageSquareText size={25} className="mx-auto text-slate-300" />
            <div className="mt-3 font-semibold text-slate-900">No WhatsApp templates yet</div>
            <div className="mt-1 text-sm text-slate-500">Sync your Meta account to bring approved templates into SalsysOS.</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">No templates match the current filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
                <tr><th className="px-4 py-3">Template</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Language</th><th className="px-4 py-3">Variables</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Updated</th><th className="w-10 px-3 py-3" /></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((template) => (
                  <tr key={template.id} onClick={() => setSelected(template)} className={`cursor-pointer transition hover:bg-violet-50/40 ${template.active ? '' : 'bg-slate-50/60 text-slate-400'}`}>
                    <td className="px-4 py-3.5"><div className="font-semibold text-slate-900">{template.template_name}</div>{!template.active ? <div className="mt-0.5 text-[11px] text-slate-400">Inactive locally</div> : null}</td>
                    <td className="px-4 py-3.5 text-slate-600">{prettify(template.category)}</td>
                    <td className="px-4 py-3.5 text-slate-600">{template.language_code}</td>
                    <td className="px-4 py-3.5 text-slate-600">{variableCount(template.parameter_schema) || '—'}</td>
                    <td className="px-4 py-3.5"><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${statusClass(template.approval_status)}`}>{prettify(template.approval_status)}</span></td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-xs text-slate-500">{relativeTime(template.last_synced_at)}</td>
                    <td className="px-3 py-3.5 text-slate-300"><ChevronRight size={16} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
        <span>{filtered.length} of {templates.length} templates</span>
        <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={13} className="text-emerald-500" /> Meta provider status remains authoritative</span>
      </div>

      {mounted && selected ? <TemplateDrawer template={selected} latestSync={latestSync} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}
