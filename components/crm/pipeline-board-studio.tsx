"use client";

import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  GripVertical,
  Loader2,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { movePipelineLeadStage } from "@/app/pipeline/actions";
import { LeadInspectorButton } from "@/components/crm/lead-inspector";
import type { PipelineSnapshotBoardLead } from "@/lib/pipeline-data";
import type { PipelineStage } from "@/types/crm";

const columns: Array<{ stage: PipelineStage; label: string }> = [
  { stage: "new", label: "New" },
  { stage: "contacted", label: "Contacted" },
  { stage: "engaged", label: "Engaged" },
  { stage: "qualified", label: "Qualified" },
  { stage: "high_intent", label: "High intent" },
  { stage: "payment_pending", label: "Payment pending" },
  { stage: "closed_won", label: "Closed won" },
];

const outcomeStages: Array<{ stage: PipelineStage; label: string }> = [
  { stage: "enrolled", label: "Enrolled" },
  { stage: "nurture", label: "Nurture" },
  { stage: "not_now", label: "Not now" },
  { stage: "lost", label: "Lost" },
  { stage: "unqualified", label: "Unqualified" },
  { stage: "duplicate", label: "Duplicate" },
];

const moveableStageSet = new Set<PipelineStage>([
  ...columns.map((column) => column.stage),
  ...outcomeStages.map((outcome) => outcome.stage),
]);

const lossReasons = [
  ["price", "Price / budget"],
  ["timing", "Timing"],
  ["no_response", "No response"],
  ["competitor", "Chose another provider"],
  ["travel_or_visa", "Travel / visa"],
  ["not_fit", "Not a fit"],
  ["other", "Other"],
] as const;

type AgingFilter = "all" | "healthy" | "warning" | "stuck" | "untracked";
type Toast = { type: "success" | "error"; message: string };
type PendingOutcome = {
  leadId: string;
  leadName: string;
  stage: PipelineStage;
} | null;

export function PipelineBoardStudio({
  leads,
}: {
  leads: PipelineSnapshotBoardLead[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(leads);
  const [query, setQuery] = useState("");
  const [channel, setChannel] = useState("all");
  const [aging, setAging] = useState<AgingFilter>("all");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<PipelineStage | null>(null);
  const [savingLeadId, setSavingLeadId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [pendingOutcome, setPendingOutcome] = useState<PendingOutcome>(null);
  const [lossReason, setLossReason] = useState("");
  const [outcomeNote, setOutcomeNote] = useState("");
  const [, startTransition] = useTransition();
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setItems(leads), [leads]);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const channels = useMemo(
    () =>
      Array.from(
        new Set(items.map((lead) => lead.currentContactChannel).filter(Boolean)),
      ).sort(),
    [items],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((lead) => {
      if (channel !== "all" && lead.currentContactChannel !== channel) return false;
      if (aging !== "all" && lead.agingStatus !== aging) return false;
      if (!needle) return true;
      return [
        lead.name,
        lead.course,
        lead.country,
        lead.location,
        lead.currentContactChannel,
        lead.agingStatus,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [aging, channel, items, query]);

  function showToast(next: Toast) {
    setToast(next);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3400);
  }

  function resetOutcomeDialog() {
    setPendingOutcome(null);
    setLossReason("");
    setOutcomeNote("");
  }

  function moveLead(leadId: string, newStage: PipelineStage, reason?: string) {
    if (!moveableStageSet.has(newStage)) {
      showToast({ type: "error", message: "That stage is not available from this board." });
      return;
    }

    const lead = items.find((item) => item.id === leadId);
    if (!lead || String(lead.stage) === newStage || savingLeadId === leadId) return;

    if (newStage === "closed_won") {
      const confirmed = window.confirm(
        `Move ${lead.name} to Closed Won?\n\nThis is a consequential commercial stage change. If payment is the source of truth, use the verified-payment workflow instead so the payment audit and stage history stay linked.`,
      );
      if (!confirmed) {
        setDraggingId(null);
        setOverStage(null);
        return;
      }
    }

    const previous = { ...lead };
    const enteredAt = new Date().toISOString();

    setItems((current) =>
      current.map((item) =>
        item.id === leadId
          ? {
              ...item,
              stage: newStage as PipelineSnapshotBoardLead["stage"],
              agingStatus: "healthy",
              stageEnteredAt: enteredAt,
              stageAgeHours: 0,
              stageAgeDays: 0,
              daysOverStuckThreshold: 0,
            }
          : item,
      ),
    );
    setSavingLeadId(leadId);

    startTransition(async () => {
      const result = await movePipelineLeadStage(leadId, newStage, reason);
      setSavingLeadId(null);

      if (!result.ok) {
        setItems((current) =>
          current.map((item) => (item.id === leadId ? previous : item)),
        );
        showToast({ type: "error", message: result.error || "Unable to move lead." });
        return;
      }

      showToast({
        type: "success",
        message: result.mock
          ? "Demo mode: stage changed locally only."
          : `Opportunity moved to ${formatStage(newStage)}.`,
      });
      if (!result.mock) router.refresh();
    });
  }

  function requestOutcome(leadId: string, stage: PipelineStage) {
    const lead = items.find((item) => item.id === leadId);
    if (!lead || savingLeadId === leadId) return;

    if (stage === "nurture" || stage === "not_now") {
      moveLead(leadId, stage, `Moved to ${formatStage(stage)} via pipeline outcome action`);
      return;
    }

    setPendingOutcome({ leadId, leadName: lead.name, stage });
    setLossReason("");
    setOutcomeNote("");
  }

  function confirmOutcome() {
    if (!pendingOutcome) return;

    let reason = `Marked ${formatStage(pendingOutcome.stage)} via pipeline outcome action`;

    if (pendingOutcome.stage === "lost") {
      if (!lossReason) return;
      const reasonLabel =
        lossReasons.find(([value]) => value === lossReason)?.[1] ?? lossReason;
      reason = `Lost · ${reasonLabel}${outcomeNote.trim() ? ` · ${outcomeNote.trim()}` : ""}`;
    } else if (pendingOutcome.stage === "enrolled") {
      reason = `Manually marked Enrolled stage via pipeline; enrollment record remains a separate operational record${outcomeNote.trim() ? ` · ${outcomeNote.trim()}` : ""}`;
    } else if (outcomeNote.trim()) {
      reason += ` · ${outcomeNote.trim()}`;
    }

    const { leadId, stage } = pendingOutcome;
    resetOutcomeDialog();
    moveLead(leadId, stage, reason);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>, stage: PipelineStage) {
    event.preventDefault();
    const leadId = event.dataTransfer.getData("text/plain") || draggingId;
    setDraggingId(null);
    setOverStage(null);
    if (leadId) moveLead(leadId, stage);
  }

  return (
    <section className="mt-4">
      <div className="rounded-xl border border-line bg-surface p-3 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <label className="flex min-w-0 flex-1 items-center rounded-ui border border-line bg-surface-soft px-3 transition focus-within:border-brand-300 focus-within:bg-surface focus-within:ring-4 focus-within:ring-brand-500/5">
            <Search size={14} className="shrink-0 text-copy-subtle" />
            <span className="sr-only">Search pipeline leads</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, course, country or location…"
              className="w-full bg-transparent px-2 py-2.5 text-[12px] text-copy-strong outline-none placeholder:text-copy-subtle"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <SlidersHorizontal size={14} className="text-copy-subtle" />
            <label>
              <span className="sr-only">Filter by channel</span>
              <select
                value={channel}
                onChange={(event) => setChannel(event.target.value)}
                className="h-9 min-w-[145px] rounded-ui border border-line bg-surface px-2.5 text-[11px] font-medium text-copy-muted outline-none"
              >
                <option value="all">All channels</option>
                {channels.map((item) => (
                  <option key={item} value={item}>
                    {formatStage(item)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Filter by aging status</span>
              <select
                value={aging}
                onChange={(event) => setAging(event.target.value as AgingFilter)}
                className="h-9 min-w-[140px] rounded-ui border border-line bg-surface px-2.5 text-[11px] font-medium text-copy-muted outline-none"
              >
                <option value="all">All aging</option>
                <option value="healthy">Healthy</option>
                <option value="warning">Warning</option>
                <option value="stuck">Stuck</option>
                <option value="untracked">Untracked</option>
              </select>
            </label>
          </div>

          <div className="whitespace-nowrap text-[10px] font-semibold text-copy-subtle">
            {filtered.length.toLocaleString()} shown
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1 text-[10px] font-medium text-copy-subtle">
        <span className="inline-flex items-center gap-1.5">
          <GripVertical size={13} />
          Drag on desktop or use each card&apos;s selectors on keyboard/touch.
        </span>
        <span>Stage changes pass through the canonical backend mutation and audit history.</span>
      </div>

      <div className="mt-3 overflow-x-auto pb-4">
        <div className="grid min-w-[1660px] grid-cols-7 gap-3">
          {columns.map(({ stage, label }) => {
            const stageItems = filtered.filter((lead) => String(lead.stage) === stage);
            const stageWarning = stageItems.filter((lead) => lead.agingStatus === "warning").length;
            const stageStuck = stageItems.filter((lead) => lead.agingStatus === "stuck").length;
            const isOver = overStage === stage && Boolean(draggingId);

            return (
              <div
                key={stage}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setOverStage(stage);
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setOverStage((current) => (current === stage ? null : current));
                  }
                }}
                onDrop={(event) => handleDrop(event, stage)}
                className={`min-h-[455px] rounded-xl border p-3 transition ${
                  isOver
                    ? "border-brand-300 bg-brand-50 shadow-[inset_0_0_0_1px_rgba(87,67,197,.08)]"
                    : stage === "closed_won"
                      ? "border-emerald-200 bg-emerald-50/60"
                      : "border-line bg-surface-soft"
                }`}
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[12px] font-semibold text-copy-strong">{label}</div>
                    {stage === "closed_won" ? (
                      <div className="mt-0.5 text-[9px] font-medium text-emerald-700">Consequential · auto-archives after 24h</div>
                    ) : null}
                    <div className="mt-1 flex flex-wrap gap-1">
                      {stageWarning > 0 ? <AgingCount tone="warning">{stageWarning} warning</AgingCount> : null}
                      {stageStuck > 0 ? <AgingCount tone="stuck">{stageStuck} stuck</AgingCount> : null}
                    </div>
                  </div>
                  <span className="rounded-full border border-line bg-surface px-2.5 py-1 text-[10px] font-semibold text-copy-muted">
                    {stageItems.length}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {!stageItems.length ? (
                    <div className={`grid min-h-[88px] place-items-center rounded-lg border border-dashed px-4 text-center text-[10px] ${isOver ? "border-brand-300 bg-surface text-brand-700" : "border-line bg-surface/70 text-copy-subtle"}`}>
                      {isOver ? "Drop opportunity here" : "No matching opportunities"}
                    </div>
                  ) : null}

                  {stageItems.map((lead) => (
                    <PipelineLeadCard
                      key={lead.id}
                      lead={lead}
                      saving={savingLeadId === lead.id}
                      dragging={draggingId === lead.id}
                      onDragStart={(event) => {
                        if (savingLeadId === lead.id) {
                          event.preventDefault();
                          return;
                        }
                        setDraggingId(lead.id);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", lead.id);
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setOverStage(null);
                      }}
                      onStageChange={(nextStage) => moveLead(lead.id, nextStage)}
                      onOutcome={(nextStage) => requestOutcome(lead.id, nextStage)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {pendingOutcome ? (
        <div className="fixed inset-0 z-[180] grid place-items-center bg-slate-950/35 p-4 backdrop-blur-[1px]" role="presentation">
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="pipeline-outcome-title">
            <div id="pipeline-outcome-title" className="text-[15px] font-semibold text-copy-strong">
              {pendingOutcome.stage === "lost"
                ? `Mark ${pendingOutcome.leadName} as Lost?`
                : pendingOutcome.stage === "enrolled"
                  ? `Mark ${pendingOutcome.leadName} as Enrolled stage?`
                  : `Move ${pendingOutcome.leadName} to ${formatStage(pendingOutcome.stage)}?`}
            </div>

            <p className="mt-2 text-[12px] leading-5 text-copy-muted">
              {pendingOutcome.stage === "enrolled"
                ? "This changes the opportunity stage only. It does not create or confirm an enrollment record, accommodation assignment, or payment."
                : pendingOutcome.stage === "lost"
                  ? "A loss reason is required so Sales and Marketing can learn from the outcome."
                  : "This outcome removes the opportunity from the active Pipeline board and records the stage change in history."}
            </p>

            {pendingOutcome.stage === "lost" ? (
              <label className="mt-4 block">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-copy-muted">Loss reason</span>
                <select
                  value={lossReason}
                  onChange={(event) => setLossReason(event.target.value)}
                  className="input"
                  autoFocus
                >
                  <option value="">Select reason…</option>
                  {lossReasons.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="mt-3 block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-copy-muted">{pendingOutcome.stage === "lost" ? "Optional note" : "Note"}</span>
              <textarea
                value={outcomeNote}
                onChange={(event) => setOutcomeNote(event.target.value.slice(0, 500))}
                rows={3}
                className="input min-h-20 resize-y"
                placeholder={pendingOutcome.stage === "enrolled" ? "Optional context about the enrollment stage…" : "Optional context for the stage history…"}
              />
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={resetOutcomeDialog}>Cancel</button>
              <button
                type="button"
                className={pendingOutcome.stage === "lost" ? "inline-flex h-9 items-center justify-center rounded-ui bg-red-600 px-4 text-[11px] font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50" : "btn-primary"}
                disabled={pendingOutcome.stage === "lost" && !lossReason}
                onClick={confirmOutcome}
              >
                Confirm {formatStage(pendingOutcome.stage)}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="fixed bottom-5 right-5 z-[160] max-w-sm rounded-lg border border-line bg-surface px-4 py-3 shadow-xl" role="status" aria-live="polite">
          <div className="flex items-start gap-2.5">
            {toast.type === "success" ? (
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
            ) : (
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600" />
            )}
            <div className="text-[11px] font-medium leading-5 text-copy-muted">{toast.message}</div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function PipelineLeadCard({
  lead,
  saving,
  dragging,
  onDragStart,
  onDragEnd,
  onStageChange,
  onOutcome,
}: {
  lead: PipelineSnapshotBoardLead;
  saving: boolean;
  dragging: boolean;
  onDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onStageChange: (stage: PipelineStage) => void;
  onOutcome: (stage: PipelineStage) => void;
}) {
  return (
    <div
      draggable={!saving}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`group rounded-lg border bg-surface p-3.5 shadow-[0_2px_4px_rgba(36,33,60,0.03)] transition ${agingBorder(lead.agingStatus)} ${dragging ? "scale-[.985] opacity-45" : "hover:border-brand-300 hover:shadow-[0_5px_16px_rgba(87,67,197,.07)]"}`}
    >
      <div className="flex items-start gap-2">
        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${agingDot(lead.agingStatus)}`} aria-label={`${lead.agingStatus} aging`} />
        <div className="min-w-0 flex-1">
          <Link href={`/leads/${lead.id}`} className="block truncate text-[12px] font-semibold text-copy-strong hover:text-brand-700 hover:underline">
            {lead.name}
          </Link>
          <div className="mt-0.5 truncate text-[9px] text-copy-subtle">
            {[lead.country, lead.location].filter(Boolean).join(" · ") || "Location unavailable"}
          </div>
        </div>
        <span className="text-copy-subtle opacity-0 transition group-hover:opacity-100">
          {saving ? <Loader2 size={14} className="animate-spin text-brand-700" /> : <GripVertical size={14} />}
        </span>
      </div>

      <div className="mt-3 line-clamp-2 min-h-8 text-[10px] leading-4 text-copy-muted">
        {lead.course || "Course not set"}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <AgingBadge lead={lead} />
        <span className="inline-flex items-center gap-1 rounded-md bg-surface-soft px-2 py-1 text-[9px] font-semibold text-copy-muted">
          <Clock3 size={9} /> {formatAge(lead.stageAgeDays, lead.stageAgeHours)} in stage
        </span>
      </div>

      <div className="mt-3 space-y-2 border-t border-line pt-3">
        <label className="block">
          <span className="mb-1 block text-[8px] font-bold uppercase tracking-[0.09em] text-copy-subtle">Move active stage</span>
          <select
            value={String(lead.stage)}
            disabled={saving}
            onChange={(event) => onStageChange(event.target.value as PipelineStage)}
            className="h-8 w-full rounded-md border border-line bg-surface-soft px-2 text-[10px] font-semibold text-copy-muted outline-none transition focus:border-brand-300 focus:ring-2 focus:ring-brand-500/10 disabled:cursor-wait disabled:opacity-60"
            aria-label={`Move ${lead.name} to another active pipeline stage`}
          >
            {columns.map((column) => (
              <option key={column.stage} value={column.stage}>{column.label}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-[8px] font-bold uppercase tracking-[0.09em] text-copy-subtle">Outcome / park</span>
          <select
            value=""
            disabled={saving}
            onChange={(event) => {
              const value = event.target.value as PipelineStage;
              if (value) onOutcome(value);
            }}
            className="h-8 w-full rounded-md border border-line bg-surface px-2 text-[10px] font-semibold text-copy-muted outline-none transition focus:border-brand-300 focus:ring-2 focus:ring-brand-500/10 disabled:cursor-wait disabled:opacity-60"
            aria-label={`Set an outcome for ${lead.name}`}
          >
            <option value="">Choose outcome…</option>
            {outcomeStages.map((outcome) => (
              <option key={outcome.stage} value={outcome.stage}>{outcome.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <LeadInspectorButton leadId={lead.id} label="Inspect" />
        <span className="text-[9px] font-medium text-copy-subtle">{formatStage(lead.currentContactChannel || "unknown")}</span>
      </div>
    </div>
  );
}

function AgingBadge({ lead }: { lead: PipelineSnapshotBoardLead }) {
  if (lead.agingStatus === "stuck") {
    return <span className="rounded-md bg-red-50 px-2 py-1 text-[9px] font-semibold text-red-700">Stuck{lead.daysOverStuckThreshold > 0 ? ` +${formatDayCount(lead.daysOverStuckThreshold)}` : ""}</span>;
  }
  if (lead.agingStatus === "warning") {
    return <span className="rounded-md bg-amber-50 px-2 py-1 text-[9px] font-semibold text-amber-700">Warning</span>;
  }
  if (lead.agingStatus === "healthy") {
    return <span className="rounded-md bg-emerald-50 px-2 py-1 text-[9px] font-semibold text-emerald-700">Healthy</span>;
  }
  return <span className="rounded-md bg-slate-100 px-2 py-1 text-[9px] font-semibold text-slate-500">Untracked</span>;
}

function AgingCount({ children, tone }: { children: React.ReactNode; tone: "warning" | "stuck" }) {
  return <span className={`rounded px-1.5 py-0.5 text-[8px] font-semibold ${tone === "stuck" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{children}</span>;
}

function agingBorder(status: PipelineSnapshotBoardLead["agingStatus"]) {
  if (status === "stuck") return "border-red-200";
  if (status === "warning") return "border-amber-200";
  return "border-line";
}

function agingDot(status: PipelineSnapshotBoardLead["agingStatus"]) {
  if (status === "stuck") return "bg-red-500";
  if (status === "warning") return "bg-amber-500";
  if (status === "healthy") return "bg-emerald-500";
  return "bg-slate-300";
}

function formatAge(days: number, hours: number) {
  if (days >= 1) return days < 10 ? `${days.toFixed(1)}d` : `${Math.round(days)}d`;
  return `${Math.max(0, Math.round(hours))}h`;
}

function formatDayCount(days: number) {
  return days < 10 ? `${days.toFixed(1)}d` : `${Math.round(days)}d`;
}

function formatStage(value: string) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
