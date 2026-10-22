"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Sparkles,
  Target,
  X,
  Zap,
} from "lucide-react";

import { LeadInspectorButton } from "@/components/crm/lead-inspector";
import type { LeadStage } from "@/types/crm";

type Availability = "available" | "empty" | "unavailable";

type InspectorResponse =
  | {
      ok: true;
      data: {
        generatedAt: string;
        lead: {
          name?: string;
          nextFollowupAt?: string;
          owner?: string;
        };
        salesIntelligence: {
          priority_score?: number | string | null;
          priority_band?: string | null;
          priority_reason?: string | null;
          derived_intent?: string | null;
          intent_confidence?: string | null;
          engagement_score?: number | string | null;
          behaviour_temperature?: string | null;
          next_action_code?: string | null;
          next_best_action?: string | null;
          next_followup_at?: string | null;
          payment_status?: string | null;
          recommended_course_name?: string | null;
        } | null;
        openTasks?: Array<{
          id: string;
          title: string;
          description?: string | null;
          status: string;
          due_at: string | null;
          assigned_to?: string | null;
          created_at?: string;
        }>;
        availability: {
          salesIntelligence: Availability;
          openTasks?: Availability;
        };
      };
    }
  | { ok: false; error: string };

type ActionResponse =
  | { ok: true; data?: unknown }
  | { ok: false; error: string };

type ConversationPriority = "urgent" | "high" | "normal" | "waiting";

export function ConversationIntelligencePanel({
  leadId,
  stage,
  priority,
  needsReply,
  needsFirstContact,
  waitingSince,
}: {
  leadId: string;
  stage: LeadStage;
  priority: ConversationPriority;
  needsReply: boolean;
  needsFirstContact: boolean;
  waitingSince: string | null;
}) {
  const router = useRouter();
  const [data, setData] = useState<Extract<InspectorResponse, { ok: true }>["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [customScheduling, setCustomScheduling] = useState(false);
  const [customFollowupOpen, setCustomFollowupOpen] = useState(false);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);
  const customFollowupTriggerRef = useRef<HTMLButtonElement | null>(null);
  const customFollowupDialogRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/leads/${encodeURIComponent(leadId)}/inspector`, {
        cache: "no-store",
      });
      const body = (await response.json()) as InspectorResponse;
      if (!response.ok || !body.ok) {
        throw new Error(body.ok ? "Unable to load intelligence." : body.error);
      }
      setData(body.data);
      setLoadedAt(Date.now());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load intelligence.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [leadId]);

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    const onFocus = () => {
      if (!loadedAt || Date.now() - loadedAt < 60_000) return;
      void load(true);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load, loadedAt]);

  useEffect(() => {
    if (!customFollowupOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = customFollowupDialogRef.current;

    const focusable = () =>
      dialog
        ? Array.from(
            dialog.querySelectorAll<HTMLElement>(
              'button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])',
            ),
          )
        : [];

    requestAnimationFrame(() => {
      const actionInput = dialog?.querySelector<HTMLInputElement>('input[name="title"]');
      actionInput?.focus();
      actionInput?.select();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !customScheduling) {
        event.preventDefault();
        setCustomFollowupOpen(false);
        return;
      }

      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      customFollowupTriggerRef.current?.focus();
    };
  }, [customFollowupOpen, customScheduling]);

  const objective = useMemo(
    () => buildResponseObjective({ data, stage, priority, needsReply, needsFirstContact, waitingSince }),
    [data, stage, priority, needsReply, needsFirstContact, waitingSince],
  );

  const nextFollowup =
    data?.salesIntelligence?.next_followup_at || data?.lead.nextFollowupAt || null;
  const openTask = data?.openTasks?.[0] ?? null;

  async function createFollowup({
    title,
    dueAt,
    description,
    successMessage,
  }: {
    title: string;
    dueAt: Date;
    description?: string;
    successMessage?: string;
  }) {
    const response = await fetch(`/api/leads/${encodeURIComponent(leadId)}/inspector`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_followup",
        title,
        dueAt: dueAt.toISOString(),
        description: description || null,
      }),
    });
    const body = (await response.json()) as ActionResponse;
    if (!response.ok || !body.ok) {
      throw new Error(body.ok ? "Unable to schedule follow-up." : body.error);
    }

    setActionSuccess(
      successMessage || `Follow-up scheduled for ${formatDateTime(dueAt.toISOString())}.`,
    );
    await load(true);
    router.refresh();
  }

  async function scheduleRecommendedFollowup() {
    if (scheduling) return;
    setScheduling(true);
    setActionError(null);
    setActionSuccess(null);

    const dueAt = new Date(Date.now() + objective.recommendedHours * 60 * 60 * 1000);
    try {
      await createFollowup({
        title: objective.followupTitle,
        dueAt,
        description: `Created from Inbox recommendation: ${objective.title}`,
      });
    } catch (reason) {
      setActionError(
        reason instanceof Error ? reason.message : "Unable to schedule follow-up.",
      );
    } finally {
      setScheduling(false);
    }
  }

  async function scheduleCustomFollowup(form: HTMLFormElement) {
    if (customScheduling) return;
    const formData = new FormData(form);
    const title = String(formData.get("title") ?? "").trim();
    const rawDueAt = String(formData.get("due_at") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const dueAt = new Date(rawDueAt);

    if (!title) {
      setActionError("Enter a follow-up action.");
      return;
    }
    if (!rawDueAt || Number.isNaN(dueAt.getTime())) {
      setActionError("Choose a valid follow-up date and time.");
      return;
    }
    if (dueAt.getTime() < Date.now() - 60_000) {
      setActionError("Choose a follow-up time in the future.");
      return;
    }

    setCustomScheduling(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await createFollowup({ title, dueAt, description });
      form.reset();
      setCustomFollowupOpen(false);
    } catch (reason) {
      setActionError(
        reason instanceof Error ? reason.message : "Unable to schedule follow-up.",
      );
    } finally {
      setCustomScheduling(false);
    }
  }

  async function completeFollowup(taskId: string) {
    if (completingTaskId) return;
    setCompletingTaskId(taskId);
    setActionError(null);
    setActionSuccess(null);

    try {
      const response = await fetch(`/api/leads/${encodeURIComponent(leadId)}/inspector`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "complete_followup",
          taskId,
        }),
      });
      const body = (await response.json()) as ActionResponse;
      if (!response.ok || !body.ok) {
        throw new Error(body.ok ? "Unable to complete follow-up." : body.error);
      }

      setActionSuccess("Follow-up marked complete.");
      await load(true);
      router.refresh();
    } catch (reason) {
      setActionError(
        reason instanceof Error ? reason.message : "Unable to complete follow-up.",
      );
    } finally {
      setCompletingTaskId(null);
    }
  }

  if (loading) {
    return (
      <section className="rounded-xl border border-[#DDE7DF] bg-white p-3.5">
        <div className="flex items-center gap-2 text-[10px] font-semibold text-[#60736A]">
          <RefreshCw size={12} className="animate-spin text-[#216551]" />
          Loading lead intelligence…
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="overflow-hidden rounded-xl border border-[#DDE7DF] bg-white">
        <div className="border-b border-[#E8EEEA] bg-[#F7FAF8] px-3.5 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[#216551]">
                <Sparkles size={11} /> Inbox intelligence
              </div>
              <div className="mt-1 text-[12px] font-semibold text-[#203B31]">
                What should happen next?
              </div>
            </div>
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={refreshing}
              className="grid h-7 w-7 place-items-center rounded-md text-[#829087] transition hover:bg-white hover:text-[#216551] disabled:opacity-50"
              aria-label="Refresh conversation intelligence"
              title="Refresh intelligence"
            >
              <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        <div className="p-3.5">
          {error ? (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] leading-4 text-amber-800">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <span>{error} Showing only conversation-state guidance.</span>
            </div>
          ) : null}

          <div className={`rounded-lg border px-3 py-3 ${objective.toneClass}`}>
            <div className="flex items-start gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/80 text-[#216551] shadow-sm">
                <Target size={14} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#728179]">
                  {objective.sourceLabel}
                </div>
                <div className="mt-1 text-[12px] font-semibold text-[#203B31]">
                  {objective.title}
                </div>
                <div className="mt-1 text-[10px] leading-4 text-[#61736A]">
                  {objective.detail}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Signal label="Priority" value={pretty(data?.salesIntelligence?.priority_band || priority)} />
            <Signal label="Intent" value={pretty(data?.salesIntelligence?.derived_intent || "Not available")} />
            <Signal label="Engagement" value={numberText(data?.salesIntelligence?.engagement_score)} />
            <Signal label="Next follow-up" value={nextFollowup ? relativeTime(nextFollowup) : "Not scheduled"} />
            <Signal label="Lead owner" value={data?.lead.owner || "Unassigned"} />
            <Signal label="Follow-up" value={openTask ? pretty(openTask.status) : "None open"} />
          </div>

          {data?.salesIntelligence?.priority_reason ? (
            <div className="mt-3 rounded-lg bg-[#F5F8F6] px-3 py-2 text-[9px] leading-4 text-[#718078]">
              <strong className="font-semibold text-[#496057]">Why now:</strong>{" "}
              {data.salesIntelligence.priority_reason}
            </div>
          ) : null}

          {openTask ? (
            <div className="mt-3 rounded-lg border border-[#E6ECE8] px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#89968F]">
                  Open follow-up
                </div>
                <span className="rounded bg-[#F3F7F4] px-1.5 py-0.5 text-[8px] font-semibold capitalize text-[#60736A]">
                  {openTask.status}
                </span>
              </div>
              <div className="mt-1.5 text-[10px] font-semibold text-[#40564C]">
                {openTask.title}
              </div>
              {openTask.due_at ? (
                <div className="mt-1 flex items-center gap-1 text-[9px] text-[#7A8981]">
                  <Clock3 size={10} /> {relativeTime(openTask.due_at)} · {formatDateTime(openTask.due_at)}
                </div>
              ) : (
                <div className="mt-1 text-[9px] text-[#7A8981]">No due date recorded</div>
              )}
              <div className="mt-1 text-[9px] text-[#7A8981]">
                Follow-up owner: {openTask.assigned_to ? "Assigned CRM user" : "Unassigned"}
              </div>
              <button
                type="button"
                onClick={() => void completeFollowup(openTask.id)}
                disabled={Boolean(completingTaskId)}
                className="mt-2 inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-md border border-[#DDE7DF] bg-white px-2 text-[9px] font-semibold text-[#456158] transition hover:bg-[#EDF3E6] hover:text-[#216551] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {completingTaskId === openTask.id ? (
                  <RefreshCw size={10} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={10} />
                )}
                {completingTaskId === openTask.id ? "Completing…" : "Mark complete"}
              </button>
            </div>
          ) : null}

          {actionError && !customFollowupOpen ? (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[9px] text-red-700">
              {actionError}
            </div>
          ) : null}
          {actionSuccess ? (
            <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[9px] text-emerald-700">
              <CheckCircle2 size={11} /> {actionSuccess}
            </div>
          ) : null}

          <div className="mt-3 grid gap-2">
            <button
              type="button"
              onClick={scheduleRecommendedFollowup}
              disabled={scheduling || customScheduling}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#216551] px-3 text-[10px] font-semibold text-white transition hover:bg-[#174D3B] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {scheduling ? <RefreshCw size={12} className="animate-spin" /> : <CalendarClock size={12} />}
              {scheduling ? "Scheduling…" : objective.scheduleLabel}
            </button>

            <button
              ref={customFollowupTriggerRef}
              type="button"
              onClick={() => {
                setActionError(null);
                setActionSuccess(null);
                setCustomFollowupOpen(true);
              }}
              disabled={scheduling || customScheduling}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#DDE7DF] bg-white px-3 text-[10px] font-semibold text-[#456158] transition hover:bg-[#F7FAF8] hover:text-[#216551] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <CalendarClock size={11} /> Plan a custom follow-up
            </button>

            <LeadInspectorButton
              leadId={leadId}
              label="Open full lead intelligence"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#DDE7DF] bg-white px-3 text-[10px] font-semibold text-[#456158] transition hover:bg-[#F0F7F3] hover:text-[#216551]"
            />
          </div>

          <div className="mt-3 flex items-start gap-2 border-t border-[#EEF2EF] pt-3 text-[9px] leading-4 text-[#849188]">
            <Zap size={11} className="mt-0.5 shrink-0 text-[#6A927B]" />
            <span>
              Guidance uses stored CRM evidence. Follow-ups create CRM tasks only; AI drafting remains human-reviewed and nothing is sent automatically.
            </span>
          </div>
        </div>
      </section>

      {customFollowupOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[100] grid place-items-center p-4 sm:p-6">
              <button
                type="button"
                aria-label="Close follow-up planner"
                onClick={() => {
                  if (!customScheduling) setCustomFollowupOpen(false);
                }}
                className="absolute inset-0 bg-[#153E33]/28 backdrop-blur-[2px]"
              />

              <div
                ref={customFollowupDialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="custom-followup-title"
                aria-describedby="custom-followup-description"
                className="relative z-10 flex max-h-[min(720px,90dvh)] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl border border-[#D7E1DB] bg-white shadow-[0_28px_80px_rgba(21,62,51,0.24)]"
              >
                <div className="flex items-start justify-between gap-4 border-b border-[#E5ECE7] px-5 py-4 sm:px-6 sm:py-5">
                  <div>
                    <h2 id="custom-followup-title" className="text-[18px] font-semibold text-[#18362D]">
                      Plan the next step
                    </h2>
                    <p id="custom-followup-description" className="mt-1 text-[10px] leading-5 text-[#596E64]">
                      CRM follow-up only · this schedules an internal task and does not send a customer message.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!customScheduling) setCustomFollowupOpen(false);
                    }}
                    disabled={customScheduling}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[#596E64] transition hover:bg-[#EDF3E6] hover:text-[#216551] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#216551] disabled:opacity-50"
                    aria-label="Close follow-up planner"
                  >
                    <X size={17} />
                  </button>
                </div>

                <form
                  className="min-h-0 overflow-y-auto"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void scheduleCustomFollowup(event.currentTarget);
                  }}
                >
                  <div className="space-y-4 px-5 py-5 sm:px-6">
                    <label className="block">
                      <span className="mb-1.5 block text-[10px] font-semibold text-[#344E42]">
                        Next action
                      </span>
                      <input
                        name="title"
                        required
                        maxLength={240}
                        defaultValue={objective.followupTitle}
                        className="input h-10"
                        placeholder="e.g. Confirm course interest"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-[10px] font-semibold text-[#344E42]">
                        Follow-up date and time
                      </span>
                      <input
                        name="due_at"
                        type="datetime-local"
                        required
                        defaultValue={localDateTimeValue(objective.recommendedHours)}
                        className="input h-10"
                      />
                    </label>

                    <div>
                      <div className="mb-1.5 text-[10px] font-semibold text-[#344E42]">Owner</div>
                      <div className="rounded-lg border border-[#D9E2DD] bg-[#F7F9F7] px-3 py-2.5 text-[10px] text-[#40564C]">
                        <div className="font-semibold">Current signed-in user</div>
                        <div className="mt-0.5 leading-4 text-[#718078]">
                          The canonical follow-up action assigns the CRM task to the operator creating it.
                        </div>
                      </div>
                    </div>

                    <label className="block">
                      <span className="mb-1.5 block text-[10px] font-semibold text-[#344E42]">
                        Note <span className="font-normal text-[#829087]">(optional)</span>
                      </span>
                      <textarea
                        name="description"
                        rows={3}
                        maxLength={4000}
                        className="input min-h-[88px] resize-y"
                        placeholder="Internal context for this follow-up…"
                      />
                    </label>

                    {actionError ? (
                      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[10px] leading-4 text-red-700">
                        {actionError}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-[#E5ECE7] bg-[#FBFCFB] px-5 py-3.5 sm:px-6">
                    <button
                      type="button"
                      onClick={() => setCustomFollowupOpen(false)}
                      disabled={customScheduling}
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-[#D9E2DD] bg-white px-4 text-[10px] font-semibold text-[#456158] transition hover:bg-[#F3F6F3] disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={customScheduling || scheduling}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#153E33] px-4 text-[10px] font-semibold text-white transition hover:bg-[#216551] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {customScheduling ? <RefreshCw size={11} className="animate-spin" /> : <CalendarClock size={11} />}
                      {customScheduling ? "Saving…" : "Save follow-up"}
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function Signal({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[#F5F8F6] px-2.5 py-2">
      <div className="text-[8px] font-semibold uppercase tracking-[0.08em] text-[#8A978F]">{label}</div>
      <div className="mt-1 truncate text-[10px] font-semibold text-[#344E42]">{value}</div>
    </div>
  );
}

function buildResponseObjective({
  data,
  stage,
  priority,
  needsReply,
  needsFirstContact,
  waitingSince,
}: {
  data: Extract<InspectorResponse, { ok: true }>["data"] | null;
  stage: LeadStage;
  priority: ConversationPriority;
  needsReply: boolean;
  needsFirstContact: boolean;
  waitingSince: string | null;
}) {
  const intelligence = data?.salesIntelligence;
  if (intelligence?.next_best_action) {
    const urgent = priority === "urgent" || intelligence.priority_band === "urgent";
    return {
      title: intelligence.next_best_action,
      detail: intelligence.priority_reason || "Use the canonical next-best-action as the objective for the next human reply.",
      sourceLabel: "Canonical next best action",
      source: "canonical" as const,
      recommendedHours: urgent ? 4 : priority === "high" ? 8 : 24,
      followupTitle: `Follow up: ${intelligence.next_best_action}`.slice(0, 220),
      scheduleLabel: urgent ? "Schedule follow-up · 4h" : priority === "high" ? "Schedule follow-up · 8h" : "Schedule follow-up · tomorrow",
      toneClass: urgent ? "border-amber-200 bg-amber-50/80" : "border-emerald-200 bg-emerald-50/70",
    };
  }

  if (needsReply) {
    const hours = priority === "urgent" ? 2 : priority === "high" ? 4 : 8;
    return {
      title: "Reply to the latest inbound message",
      detail: waitingSince
        ? "The lead is waiting for a response. Keep the reply focused on the latest request and move toward a clear next step."
        : "The latest conversation state indicates that the admissions team owes the next response.",
      sourceLabel: "Conversation-state guidance",
      source: "presentation" as const,
      recommendedHours: hours,
      followupTitle: "Reply to latest inbound message",
      scheduleLabel: `Schedule reply follow-up · ${hours}h`,
      toneClass: priority === "urgent" ? "border-amber-200 bg-amber-50/80" : "border-[#D8E6DC] bg-[#F2F8F4]",
    };
  }

  if (needsFirstContact) {
    return {
      title: "Make first contact",
      detail: "No completed contact is recorded yet. Start the conversation and capture the outcome while intent is still fresh.",
      sourceLabel: "Conversation-state guidance",
      source: "presentation" as const,
      recommendedHours: 4,
      followupTitle: "Make first contact",
      scheduleLabel: "Schedule first contact · 4h",
      toneClass: "border-[#D8E6DC] bg-[#F2F8F4]",
    };
  }

  if (stage === "payment_pending") {
    return {
      title: "Resolve the payment blocker",
      detail: "Keep the conversation focused on the exact payment question, blocker, or confirmation needed to complete enrollment.",
      sourceLabel: "Conversation-state guidance",
      source: "presentation" as const,
      recommendedHours: 4,
      followupTitle: "Check payment status",
      scheduleLabel: "Schedule payment check · 4h",
      toneClass: "border-amber-200 bg-amber-50/80",
    };
  }

  if (stage === "qualified" || stage === "high_intent") {
    return {
      title: "Move toward a concrete enrollment step",
      detail: "Clarify the remaining decision: course, batch, accommodation, payment, or a committed follow-up time.",
      sourceLabel: "Conversation-state guidance",
      source: "presentation" as const,
      recommendedHours: 24,
      followupTitle: "Progress enrollment decision",
      scheduleLabel: "Schedule follow-up · tomorrow",
      toneClass: "border-emerald-200 bg-emerald-50/70",
    };
  }

  return {
    title: "Keep the conversation moving",
    detail: "Use the latest message, current stage, and verified lead context to end with one clear next step.",
    sourceLabel: "Conversation-state guidance",
    source: "presentation" as const,
    recommendedHours: 24,
    followupTitle: "Continue admissions conversation",
    scheduleLabel: "Schedule follow-up · tomorrow",
    toneClass: "border-[#D8E6DC] bg-[#F2F8F4]",
  };
}

function pretty(value: string) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function numberText(value: number | string | null | undefined) {
  if (value == null || value === "") return "Not available";
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("en-IN") : String(value);
}

function formatDateTime(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Not recorded";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function relativeTime(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Not recorded";
  const diff = timestamp - Date.now();
  const abs = Math.abs(diff);
  const minutes = Math.max(1, Math.round(abs / 60_000));
  const suffix = diff < 0 ? "overdue" : "from now";
  if (minutes < 60) return `${minutes}m ${suffix}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ${suffix}`;
  const days = Math.round(hours / 24);
  return `${days}d ${suffix}`;
}

function localDateTimeValue(hoursFromNow: number) {
  const date = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}