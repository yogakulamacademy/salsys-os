'use client';

import Link from 'next/link';
import {
  CheckCircle2,
  GripVertical,
  Loader2,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { useMemo, useRef, useState, useTransition } from 'react';
import { movePipelineLeadStage } from '@/app/pipeline/actions';
import type { LeadStage } from '@/types/crm';

export type PipelineBoardLead = {
  id: string;
  name: string;
  stage: LeadStage;
  country: string;
  location: string;
  course: string;
  currentContactChannel: string;
};

const columns: Array<{ stage: LeadStage; label: string }> = [
  { stage: 'new', label: 'New' },
  { stage: 'contacted', label: 'Contacted' },
  { stage: 'engaged', label: 'Engaged' },
  { stage: 'qualified', label: 'Qualified' },
  { stage: 'high_intent', label: 'High Intent' },
  { stage: 'payment_pending', label: 'Payment Pending' },
];

type Toast =
  | { type: 'success'; message: string }
  | { type: 'error'; message: string };

export function PipelineBoard({
  leads,
}: {
  leads: PipelineBoardLead[];
}) {
  const [items, setItems] = useState(leads);
  const [query, setQuery] = useState('');
  const [channel, setChannel] = useState('all');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<LeadStage | null>(null);
  const [savingLeadId, setSavingLeadId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [, startTransition] = useTransition();
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const channels = useMemo(
    () =>
      Array.from(
        new Set(
          items
            .map((lead) => lead.currentContactChannel)
            .filter(Boolean)
        )
      ).sort(),
    [items]
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return items.filter((lead) => {
      const matchesChannel =
        channel === 'all' || lead.currentContactChannel === channel;

      if (!matchesChannel) return false;
      if (!needle) return true;

      return [
        lead.name,
        lead.course,
        lead.country,
        lead.location,
        lead.currentContactChannel,
      ]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [items, query, channel]);

  function showToast(nextToast: Toast) {
    setToast(nextToast);

    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
    }

    toastTimer.current = setTimeout(() => {
      setToast(null);
    }, 3200);
  }

  function handleDragStart(
    event: React.DragEvent<HTMLDivElement>,
    leadId: string
  ) {
    setDraggingId(leadId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', leadId);

  }

  function handleDragEnd() {
    setDraggingId(null);
    setOverStage(null);
  }

  function handleDrop(
    event: React.DragEvent<HTMLDivElement>,
    newStage: LeadStage
  ) {
    event.preventDefault();

    const leadId =
      event.dataTransfer.getData('text/plain') || draggingId;

    setOverStage(null);
    setDraggingId(null);

    if (!leadId) return;

    const lead = items.find((item) => item.id === leadId);
    if (!lead || lead.stage === newStage) return;

    const previousStage = lead.stage;

    // Optimistic UI: move instantly, then persist to Supabase.
    setItems((current) =>
      current.map((item) =>
        item.id === leadId ? { ...item, stage: newStage } : item
      )
    );

    setSavingLeadId(leadId);

    startTransition(async () => {
      const result = await movePipelineLeadStage(leadId, newStage);

      setSavingLeadId(null);

      if (!result.ok) {
        setItems((current) =>
          current.map((item) =>
            item.id === leadId
              ? { ...item, stage: previousStage }
              : item
          )
        );

        showToast({
          type: 'error',
          message: result.error || 'Unable to move lead.',
        });
        return;
      }

      showToast({
        type: 'success',
        message: result.mock
          ? 'Mock mode: lead moved locally only.'
          : `Lead moved to ${formatStage(newStage)}.`,
      });
    });
  }

  return (
    <section className="mt-4">
      <div className="card mb-4 flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 transition focus-within:border-brand/30 focus-within:bg-white focus-within:ring-4 focus-within:ring-brand/5">
          <Search size={15} className="shrink-0 text-slate-400" />

          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, course, country or location..."
            className="w-full bg-transparent px-2 py-2.5 text-sm outline-none placeholder:text-slate-400"
          />
        </div>

        <div className="flex items-center gap-2">
          <SlidersHorizontal size={15} className="text-slate-400" />

          <select
            value={channel}
            onChange={(event) => setChannel(event.target.value)}
            className="input min-w-[170px] !py-2.5 capitalize"
          >
            <option value="all">All channels</option>

            {channels.map((item) => (
              <option key={item} value={item}>
                {item.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </div>

        <div className="whitespace-nowrap text-xs font-semibold text-slate-400">
          {filtered.length.toLocaleString()} shown
        </div>
      </div>

      <div className="mb-3 flex items-center gap-2 px-1 text-[11px] font-semibold text-slate-400">
        <GripVertical size={14} />
        Drag a lead card to another stage to update it instantly.
      </div>

      <div className="overflow-x-auto pb-5">
        <div className="grid min-w-[1420px] grid-cols-6 gap-3">
          {columns.map(({ stage, label }, index) => {
            const stageItems = filtered.filter(
              (lead) => lead.stage === stage
            );

            const isOver = overStage === stage && draggingId !== null;

            return (
              <div
                key={stage}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  setOverStage(stage);
                }}
                onDragLeave={(event) => {
                  if (
                    event.currentTarget.contains(
                      event.relatedTarget as Node | null
                    )
                  ) {
                    return;
                  }

                  if (overStage === stage) {
                    setOverStage(null);
                  }
                }}
                onDrop={(event) => handleDrop(event, stage)}
                className={`min-h-[460px] rounded-2xl border p-3 transition-all duration-200 animate-rise stagger-${Math.min(
                  index + 1,
                  5
                )} ${
                  isOver
                    ? 'border-brand/40 bg-brand/[0.055] shadow-[inset_0_0_0_1px_rgba(16,56,89,.08),0_12px_30px_rgba(15,23,42,.06)]'
                    : 'border-slate-200 bg-slate-100/65'
                }`}
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-bold text-slate-800">
                      {label}
                    </div>
                    <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[.12em] text-slate-400">
                      Active stage
                    </div>
                  </div>

                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-black text-slate-600 shadow-sm">
                    {stageItems.length}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {stageItems.length === 0 && (
                    <div
                      className={`grid min-h-[88px] place-items-center rounded-xl border border-dashed px-4 text-center text-xs transition ${
                        isOver
                          ? 'border-brand/35 bg-white text-brand'
                          : 'border-slate-300 bg-white/70 text-slate-400'
                      }`}
                    >
                      {isOver ? 'Drop lead here' : 'No matching leads'}
                    </div>
                  )}

                  {stageItems.map((lead) => {
                    const isDragging = draggingId === lead.id;
                    const isSaving = savingLeadId === lead.id;

                    return (
                      <div
                        key={lead.id}
                        draggable={!isSaving}
                        onDragStart={(event) =>
                          handleDragStart(event, lead.id)
                        }
                        onDragEnd={handleDragEnd}
                        className={`group relative cursor-grab rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md active:cursor-grabbing ${
                          isDragging ? 'scale-[.985] opacity-45' : ''
                        }`}
                      >
                        <div className="absolute right-2 top-2 text-slate-300 opacity-0 transition group-hover:opacity-100">
                          {isSaving ? (
                            <Loader2
                              size={15}
                              className="animate-spin text-brand"
                            />
                          ) : (
                            <GripVertical size={15} />
                          )}
                        </div>

                        <Link
                          href={`/leads/${lead.id}`}
                          className="block pr-5"
                          draggable={false}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate font-semibold text-slate-900">
                                {lead.name}
                              </div>

                              <div className="mt-1 truncate text-xs text-slate-400">
                                {lead.country || '—'} ·{' '}
                                {lead.location || '—'}
                              </div>
                            </div>

                            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-orange-400 shadow-[0_0_0_4px_rgba(251,146,60,.10)] transition group-hover:scale-110" />
                          </div>

                          <div className="mt-3 line-clamp-2 text-xs font-medium leading-5 text-slate-600">
                            {lead.course || 'Course not set'}
                          </div>

                          <div className="mt-3 flex items-center justify-between gap-2">
                            <span className="rounded-lg bg-slate-50 px-2 py-1 text-[10px] font-bold capitalize text-slate-500">
                              {lead.currentContactChannel?.replaceAll(
                                '_',
                                ' '
                              ) || 'unknown'}
                            </span>

                            <span className="text-[10px] font-bold text-brand opacity-0 transition group-hover:opacity-100">
                              Open lead →
                            </span>
                          </div>
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-[80] flex max-w-sm items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-xl animate-rise ${
            toast.type === 'success'
              ? 'border-emerald-200 bg-white text-emerald-700'
              : 'border-rose-200 bg-white text-rose-700'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 size={18} />
          ) : (
            <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-rose-100 text-[11px] font-black">
              !
            </span>
          )}

          {toast.message}
        </div>
      )}
    </section>
  );
}

function formatStage(stage: string) {
  return stage
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
