import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CheckCircle2, CircleAlert, PlusCircle } from 'lucide-react';

import {
  leadObjectionCategories,
  recordLeadObjectionAction,
  resolveLeadObjectionAction,
} from '@/app/actions/objections';
import { PageHeader } from '@/components/ui';
import { getLead } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';

export default async function LeadObjectionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [lead, supabase] = await Promise.all([getLead(id), createClient()]);

  if (!lead) notFound();

  const { data, error } = await supabase
    .from('lead_objection_signals')
    .select('id,category,status,evidence_kind,note,confidence,created_at,resolved_at')
    .eq('lead_id', id)
    .order('created_at', { ascending: false })
    .limit(100);

  const rows = data ?? [];
  const active = rows.filter((row) => row.status === 'active');
  const resolved = rows.filter((row) => row.status === 'resolved');
  const createAction = recordLeadObjectionAction.bind(null, id);

  return (
    <div>
      <Link
        href={`/leads/${id}`}
        className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-brand"
      >
        <ArrowLeft size={15} />
        Back to lead
      </Link>

      <PageHeader
        eyebrow="Sales intelligence"
        title="Lead objections"
        description={`${lead.name} · record explicit sales blockers separately from derived intent and behavioural inference.`}
        actions={
          <Link href="/sales-intelligence" className="btn-secondary">
            Sales Intelligence
          </Link>
        }
      />

      {query.error && (
        <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {query.error}
        </div>
      )}

      {query.notice && (
        <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {query.notice}
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          Unable to load objections: {error.message}
        </div>
      )}

      <section className="mt-6 grid gap-4 xl:grid-cols-[360px_1fr]">
        <div className="card-pad h-fit">
          <div className="flex items-center gap-2">
            <PlusCircle size={17} className="text-brand" />
            <div>
              <div className="eyebrow">Observed blocker</div>
              <div className="section-title mt-1">Record objection</div>
            </div>
          </div>

          <p className="mt-3 text-xs leading-5 text-slate-400">
            Record only an objection the customer actually expressed. This does not change CRM intent automatically.
          </p>

          <form action={createAction} className="mt-5 space-y-4">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Category</span>
              <select
                name="category"
                required
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-brand"
                defaultValue=""
              >
                <option value="" disabled>Select category</option>
                {leadObjectionCategories.map((category) => (
                  <option key={category} value={category}>{pretty(category)}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Evidence note</span>
              <textarea
                name="note"
                rows={5}
                maxLength={2000}
                placeholder="What did the lead say? Keep it factual and concise."
                className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-6 text-slate-700 outline-none focus:border-brand"
              />
            </label>

            <button type="submit" className="btn-primary w-full justify-center">
              Record objection
            </button>
          </form>
        </div>

        <div className="space-y-4">
          <section className="card-pad">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="eyebrow">Active blockers</div>
                <div className="section-title mt-1">Open objections</div>
              </div>
              <span className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700">
                {active.length} active
              </span>
            </div>

            {active.length === 0 ? (
              <div className="mt-5 rounded-xl border border-dashed border-slate-200 px-4 py-7 text-center text-sm text-slate-400">
                No active objection has been recorded.
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {active.map((row) => {
                  const resolveAction = resolveLeadObjectionAction.bind(null, id, String(row.id));
                  return (
                    <div key={String(row.id)} className="rounded-2xl border border-amber-100 bg-amber-50/40 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800">
                              <CircleAlert size={12} />
                              {pretty(String(row.category))}
                            </span>
                            <span className="text-[11px] font-semibold text-slate-400">
                              Human evidence · {formatDate(String(row.created_at))}
                            </span>
                          </div>
                          <p className="mt-3 text-sm leading-6 text-slate-600">
                            {row.note || 'No note added.'}
                          </p>
                        </div>
                        <form action={resolveAction}>
                          <button type="submit" className="btn-secondary whitespace-nowrap">
                            <CheckCircle2 size={14} />
                            Mark resolved
                          </button>
                        </form>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="card-pad">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="eyebrow">History</div>
                <div className="section-title mt-1">Resolved objections</div>
              </div>
              <span className="text-xs font-semibold text-slate-400">{resolved.length} resolved</span>
            </div>

            {resolved.length === 0 ? (
              <div className="mt-5 text-sm text-slate-400">No resolved objections yet.</div>
            ) : (
              <div className="mt-5 space-y-3">
                {resolved.map((row) => (
                  <div key={String(row.id)} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                        <CheckCircle2 size={12} />
                        {pretty(String(row.category))}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Resolved {row.resolved_at ? formatDate(String(row.resolved_at)) : ''}
                      </span>
                    </div>
                    {row.note && <p className="mt-2 text-sm leading-6 text-slate-500">{row.note}</p>}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}

function pretty(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(date);
}
