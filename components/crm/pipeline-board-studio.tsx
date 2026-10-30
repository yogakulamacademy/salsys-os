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

const activeStageSet = new Set<PipelineStage>(columns.map((column) => column.stage));

type AgingFilter = "all" | "healthy" | "warning" | "stuck" | "untracked";
type Toast = { type: "success" | "error"; message: string };

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

  function moveLead(leadId: string, newStage: PipelineStage) {
    if (!activeStageSet.has(newStage)) {
      showToast({ type: "error", message: "That stage is not available on this board." });
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
      const result = await movePipelineLeadStage(leadId, newStage);
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
          : `Lead moved to ${formatStage(newStage)}.`,
      });
      if (!result.mock) router.refresh();
    });
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
      <div className="rounded-xl border border-[#E4EAE6] bg-white p-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <label className="flex min-w-0 flex-1 items-center rounded-lg border border-[#E4EAE6] bg-[#F7F9F7] px-3 transition focus-within:border-[#91B09B] focus-within:bg-white focus-within:ring-4 focus-within:ring-[#216551]/5">
            <Search size={14} className="shrink-0 text-[#89978F]" />
            <span className="sr-only">Search pipeline leads</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, course, country or location…"
              className="w-full bg-transparent px-2 py-2.5 text-[12px] text-[#344E42] outline-none placeholder:text-[#9AA69F]"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <SlidersHorizontal size={14} className="text-[#88968E]" />
            <label>
              <span className="sr-only">Filter by channel</span>
              <select
                value={channel}
                onChange={(event) => setChannel(event.target.value)}
                className="h-9 min-w-[145px] rounded-lg border border-[#E4EAE6] bg-white px-2.5 text-[11px] font-medium text-[#51665C] outline-none"
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
                className="h-9 min-w-[140px] rounded-lg border border-[#E4EAE6] bg-white px-2.5 text-[11px] font-medium text-[#51665C] outline-none"
              >
                <option value="all">All aging</option>
                <option value="healthy">Healthy</option>
                <option value="warning">Warning</option>
                <option value="stuck">Stuck</option>
                <option value="untracked">Untracked</option>
              </select>
            </label>
          </div>

          <div className="whitespace-nowrap text-[10px] font-semibold text-[#89978F]">
            {filtered.length.toLocaleString()} shown
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1 text-[10px] font-medium text-[#829087]">
        <span className="inline-flex items-center gap-1.5">
          <GripVertical size={13} />
          Drag on desktop or use each card&apos;s stage selector on keyboard/touch.
        </span>
        <span>Stage changes still pass through the canonical backend mutation.</span>
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
                    ? "border-[#8FB29A] bg-[#ECF5EE] shadow-[inset_0_0_0_1px_rgba(33,101,81,.08)]"
                    : stage === "closed_won"
                      ? "border-emerald-200 bg-emerald-50/70"
                      : "border-[#E0E9E0] bg-[#F1F5F1]"
                }`}
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[12px] font-semibold text-[#2C443B]">{label}</div>
                    {stage === "closed_won" ? (
                      <div className="mt-0.5 text-[9px] font-medium text-emerald-700">Consequential · auto-archives after 24h</div>
                    ) : null}
                    <div className="mt-1 flex flex-wrap gap-1">
                      {stageWarning > 0 ? <AgingCount tone="warning">{stageWarning} warning</AgingCount> : null}
                      {stageStuck > 0 ? <AgingCount tone="stuck">{stageStuck} stuck</AgingCount> : null}
                    </div>
                  </div>
                  <span className="rounded-full border border-[#DCE8DE] bg-white px-2.5 py-1 text-[10px] font-semibold text-[#66806D]">
                    {stageItems.length}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {!stageItems.length ? (
                    <div className={`grid min-h-[88px] place-items-center rounded-lg border border-dashed px-4 text-center text-[10px] ${isOver ? "border-[#8FB29A] bg-white text-[#216551]" : "border-[#D4DED6] bg-white/70 text-[#99A59D]"}`}>
                      {isOver ? "Drop lead here" : "No matching leads"}
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
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {toast ? (
        <div className="fixed bottom-5 right-5 z-[160] max-w-sm rounded-lg border border-[#DFE7E1] bg-white px-4 py-3 shadow-xl" role="status" aria-live="polite">
          <div className="flex items-start gap-2.5">
            {toast.type === "success" ? (
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
            ) : (
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600" />
            )}
            <div className="text-[11px] font-medium leading-5 text-[#40564B]">{toast.message}</div>
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
}: {
  lead: PipelineSnapshotBoardLead;
  saving: boolean;
  dragging: boolean;
  onDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onStageChange: (stage: PipelineStage) => void;
}) {
  return (
    <div
      draggable={!saving}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`group rounded-lg border bg-white p-3.5 shadow-[0_2px_4px_rgba(18,40,24,0.03)] transition ${agingBorder(lead.agingStatus)} ${dragging ? "scale-[.985] opacity-45" : "hover:border-[#84AF91] hover:shadow-[0_5px_16px_rgba(26,66,37,.06)]"}`}
    >
      <div className="flex items-start gap-2">
        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${agingDot(lead.agingStatus)}`} aria-label={`${lead.agingStatus} aging`} />
        <div className="min-w-0 flex-1">
          <Link href={`/leads/${lead.id}`} className="block truncate text-[12px] font-semibold text-[#233C33] hover:text-[#216551] hover:underline">
            {lead.name}
          </Link>
          <div className="mt-0.5 truncate text-[9px] text-[#8A978F]">
            {[lead.country, lead.location].filter(Boolean).join(" · ") || "Location unavailable"}
          </div>
        </div>
        <span className="text-[#B0BBB4] opacity-0 transition group-hover:opacity-100">
          {saving ? <Loader2 size={14} className="animate-spin text-[#216551]" /> : <GripVertical size={14} />}
        </span>
      </div>

      <div className="mt-3 line-clamp-2 min-h-8 text-[10px] leading-4 text-[#607068]">
        {lead.course || "Course not set"}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <AgingBadge lead={lead} />
        <span className="inline-flex items-center gap-1 rounded-md bg-[#F3F6F4] px-2 py-1 text-[9px] font-semibold text-[#687A70]">
          <Clock3 size={9} /> {formatAge(lead.stageAgeDays, lead.stageAgeHours)} in stage
        </span>
      </div>

      <div className="mt-3 border-t border-[#EFF2F0] pt-3">
        <label className="block">
          <span className="mb-1 block text-[8px] font-bold uppercase tracking-[0.09em] text-[#98A39C]">Move stage</span>
          <select
            value={String(lead.stage)}
            disabled={saving}
            onChange={(event) => onStageChange(event.target.value as PipelineStage)}
            className="h-8 w-full rounded-md border border-[#E0E8E2] bg-[#FAFBFA] px-2 text-[10px] font-semibold text-[#53685D] outline-none transition focus:border-[#82A98F] focus:ring-2 focus:ring-[#216551]/10 disabled:cursor-wait disabled:opacity-60"
            aria-label={`Move ${lead.name} to another pipeline stage`}
          >
            {columns.map((column) => (
              <option key={column.stage} value={column.stage}>{column.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <LeadInspectorButton leadId={lead.id} label="Inspect" />
        <span className="text-[9px] font-medium text-[#89978F]">{formatStage(lead.currentContactChannel || "unknown")}</span>
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
  return "border-[#DFE8DF]";
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
