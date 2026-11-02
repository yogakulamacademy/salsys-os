"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import type { FormEvent, ReactNode } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Flame,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  RefreshCw,
  Route,
  Sparkles,
  Target,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useModalFocus } from "@/components/use-modal-focus";
import { JourneyEvidencePanel } from "@/components/journey-evidence-panel";
import type { JourneyEvidence } from "@/lib/journey-evidence";

type InspectorTab = "overview" | "journey" | "activity";
type Availability = "available" | "empty" | "unavailable";
type FocusTone = "attention" | "opportunity" | "neutral";

type InspectorPayment = {
  id: string;
  paymentKind: string;
  status: string;
  amount: number;
  currency: string;
  provider?: string;
  paidAt?: string;
  createdAt: string;
};

type InspectorTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  due_at: string | null;
  assigned_to: string | null;
  created_at: string;
};

type InspectorJourneyEvent = {
  journey_event_key: string;
  event_at: string;
  event_category: string;
  event_type: string;
  channel: string | null;
  source: string | null;
  title: string;
  summary: string | null;
};

type InspectorContactLog = {
  id: string;
  employee_name: string | null;
  method: string;
  direction: string;
  outcome: string;
  contacted_at: string;
  comment: string;
  call_duration_seconds: number | null;
};

type InspectorPerson = {
  person_id?: string | null;
  session_count?: number | string | null;
  sessions_30d?: number | string | null;
  touchpoint_count?: number | string | null;
  page_view_count?: number | string | null;
  message_count?: number | string | null;
  enrollment_count?: number | string | null;
  latest_lead_engagement_score?: number | string | null;
  latest_lead_behaviour_temperature?: string | null;
  latest_lead_behaviour_reason?: string | null;
};

type InspectorSalesIntelligence = {
  derived_intent: string | null;
  intent_confidence: string | null;
  intent_basis: string | null;
  intent_reason_codes: string[] | null;
  engagement_score: number | string | null;
  behaviour_temperature: string | null;
  high_intent_events_7d: number | string | null;
  whatsapp_clicks_7d: number | string | null;
  reservation_starts_7d: number | string | null;
  payment_starts_7d: number | string | null;
  days_since_last_visit: number | string | null;
  has_returned_after_becoming_lead: boolean | null;
  is_reengaged: boolean | null;
  priority_score: number | string | null;
  priority_band: string | null;
  priority_reason: string | null;
  next_action_code: string | null;
  next_best_action: string | null;
  payment_status: string | null;
  outstanding_balance: number | string | null;
  recommended_course_code: string | null;
  recommended_course_name: string | null;
  recommended_affinity_score: number | string | null;
  recommendation_basis: string | null;
  recommendation_reason_codes: string[] | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  next_followup_at: string | null;
};

type InspectorLead = {
  id: string;
  leadCode: string;
  name: string;
  email?: string;
  phone?: string;
  course: string;
  location: string;
  country: string;
  stage: string;
  intent: string;
  currentContactChannel: string;
  owner: string;
  firstTouchSource: string;
  firstTouchMedium: string;
  firstTouchCampaign: string;
  lastTouchSource?: string;
  lastTouchMedium?: string;
  lastTouchCampaign?: string;
  lastContactedAt?: string;
  nextFollowupAt?: string;
  createdAt: string;
  value?: number;
  currency?: string;
  preferredMonth?: string;
  preferredMode?: string;
  preferredLocation?: string;
  potentialValue?: number;
  potentialCurrency?: string;
  geoCity?: string;
  geoRegion?: string;
  geoCountry?: string;
  leadOrigin?: string;
  landingPage?: string;
  summary?: string;
  notes?: string;
  lastMessages?: Array<{
    id: string;
    direction: "inbound" | "outbound";
    sender: string;
    body: string;
    timestamp: string;
    channel: string;
  }>;
};

type InspectorPayload = {
  journeyEvidence?: JourneyEvidence;
  schemaVersion: "lead_inspector_v1";
  generatedAt: string;
  lead: InspectorLead;
  payments: InspectorPayment[];
  openTasks: InspectorTask[];
  person: InspectorPerson | null;
  journey: InspectorJourneyEvent[];
  journeyTotal: number;
  contactLogs: InspectorContactLog[];
  contactSummary: {
    total_contacts: number | null;
    successful_contacts: number | null;
    no_answer_contacts: number | null;
    follow_up_needed_contacts: number | null;
  } | null;
  salesIntelligence: InspectorSalesIntelligence | null;
  availability: {
    payments: Availability;
    openTasks: Availability;
    person360: Availability;
    journey: Availability;
    contactHistory: Availability;
    salesIntelligence: Availability;
  };
  warnings: string[];
};

type ApiResponse =
  | { ok: true; data: InspectorPayload }
  | { ok: false; error: string };

type ActionResponse =
  | { ok: true; data?: unknown }
  | { ok: false; error: string };

type LeadFocus = {
  action: string;
  detail: string;
  tone: FocusTone;
  reasons: string[];
  source: "canonical" | "presentation";
};

type FollowupPreset = {
  id: string;
  label: string;
  hours: number;
  title: string;
  description: string;
};

export function LeadInspector({
  leadId,
  onClose,
}: {
  leadId: string | null;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<InspectorTab>("overview");
  const [payload, setPayload] = useState<InspectorPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadedAt, setLoadedAt] = useState(0);
  const [followupOpen, setFollowupOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useModalFocus(mounted && Boolean(leadId), dialogRef, () => followupOpen ? setFollowupOpen(false) : onClose());
  const [followupTitle, setFollowupTitle] = useState("");
  const [followupDueAt, setFollowupDueAt] = useState("");
  const [followupDescription, setFollowupDescription] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  const loadLead = useCallback(async (id: string, signal?: AbortSignal) => {
    const response = await fetch(`/api/leads/${encodeURIComponent(id)}/inspector`, {
      cache: "no-store",
      signal,
    });
    const body = (await response.json()) as ApiResponse;
    if (!response.ok || !body.ok) {
      throw new Error(body.ok ? "Unable to load lead." : body.error);
    }
    setPayload(body.data);
    setLoadedAt(Date.now());
    return body.data;
  }, []);

  const refreshLead = useCallback(async () => {
    if (!leadId || refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      await loadLead(leadId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to refresh lead.");
    } finally {
      setRefreshing(false);
    }
  }, [leadId, loadLead, refreshing]);

  useEffect(() => {
    if (!leadId) {
      setPayload(null);
      setError(null);
      setLoading(false);
      setFollowupOpen(false);
      setActionError(null);
      setActionSuccess(null);
      return;
    }

    setTab("overview");
    setPayload(null);
    setError(null);
    setLoading(true);
    setFollowupOpen(false);
    setActionError(null);
    setActionSuccess(null);

    const controller = new AbortController();
    void loadLead(leadId, controller.signal)
      .catch((reason) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "Unable to load lead.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [leadId, loadLead]);

  useEffect(() => {
    if (!payload) return;
    const focus = buildLeadFocus(payload);
    const preset = buildFollowupPresets(payload, focus)[0];
    setFollowupTitle(preset?.title ?? defaultFollowupTitle(payload, focus));
    setFollowupDueAt(defaultDateTimeLocal(preset?.hours ?? 24));
    setFollowupDescription(preset?.description ?? "");
  }, [payload?.lead.id]);

  useEffect(() => {
    if (!leadId) return;

    function refreshIfStale() {
      if (Date.now() - loadedAt < 45_000) return;
      void refreshLead();
    }

    function onVisibility() {
      if (document.visibilityState === "visible") refreshIfStale();
    }

    window.addEventListener("focus", refreshIfStale);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", refreshIfStale);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [leadId, loadedAt, refreshLead]);

  async function submitFollowup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!leadId || !followupTitle.trim() || !followupDueAt) return;

    const due = new Date(followupDueAt);
    if (Number.isNaN(due.getTime())) {
      setActionError("Choose a valid follow-up date and time.");
      return;
    }
    if (due.getTime() < Date.now() - 60_000) {
      setActionError("Choose a follow-up time in the future.");
      return;
    }

    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const response = await fetch(`/api/leads/${encodeURIComponent(leadId)}/inspector`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_followup",
          title: followupTitle.trim(),
          dueAt: due.toISOString(),
          description: followupDescription.trim() || null,
        }),
      });
      const body = (await response.json()) as ActionResponse;
      if (!response.ok || !body.ok) {
        throw new Error(body.ok ? "Unable to create follow-up." : body.error);
      }

      setActionSuccess("Follow-up scheduled. The CRM task queue and lead were updated.");
      setFollowupOpen(false);
      await loadLead(leadId);
    } catch (reason) {
      setActionError(
        reason instanceof Error ? reason.message : "Unable to create follow-up.",
      );
    } finally {
      setActionLoading(false);
    }
  }

  if (!mounted || !leadId) return null;

  const focus = payload ? buildLeadFocus(payload) : null;
  const presets = payload && focus ? buildFollowupPresets(payload, focus) : [];
  const activityCount = payload
    ? payload.contactLogs.length + (payload.lead.lastMessages?.length ?? 0)
    : 0;

  function applyPreset(preset: FollowupPreset) {
    setTab("overview");
    setFollowupTitle(preset.title);
    setFollowupDueAt(defaultDateTimeLocal(preset.hours));
    setFollowupDescription(preset.description);
    setFollowupOpen(true);
    setActionError(null);
    setActionSuccess(null);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[150] flex justify-end"
      role="dialog"
      ref={dialogRef}
      tabIndex={-1}
      aria-modal="true"
      aria-label="Lead Inspector"
    >
      <button
        data-modal-backdrop tabIndex={-1} aria-hidden="true"
        type="button"
        onClick={onClose}
        aria-label="Close Lead Inspector"
        className="absolute inset-0 bg-slate-950/25 backdrop-blur-[1px]"
      />

      <aside className="relative flex h-full w-full flex-col border-l border-[#DDE7DF] bg-[#F8FAF8] shadow-[-20px_0_60px_rgba(19,46,38,0.16)] sm:max-w-[680px]">
        <header className="border-b border-[#E4EAE6] bg-white px-5 pb-0 pt-5 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#E4F2E8] text-xs font-bold text-[#216551]">
              {payload ? initials(payload.lead.name || payload.lead.leadCode) : "…"}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-[18px] font-semibold tracking-[-0.025em] text-[#192E29]">
                  {payload?.lead.name || (loading ? "Loading lead…" : "Lead Inspector")}
                </h2>
                {payload ? <StatePill value={payload.lead.stage} /> : null}
              </div>
              <div className="mt-1 truncate text-[11px] text-[#7A8981]">
                {payload
                  ? [payload.lead.leadCode, payload.lead.course, payload.lead.country]
                      .filter(Boolean)
                      .join(" · ")
                  : "Live CRM evidence and customer journey"}
              </div>
            </div>

            <button
              type="button"
              onClick={() => void refreshLead()}
              disabled={!payload || refreshing}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[#7B8A82] transition hover:bg-[#F0F5F1] hover:text-[#216551] disabled:opacity-40"
              aria-label="Refresh Lead Inspector"
              title={loadedAt ? `Last refreshed ${relativeTime(loadedAt)}` : "Refresh"}
            >
              <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[#7B8A82] transition hover:bg-[#F0F5F1] hover:text-[#216551]"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          {payload ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Link
                href={`/conversations?lead=${payload.lead.id}`}
                className="btn-primary inline-flex h-8 items-center gap-1.5 px-3 text-[11px]"
              >
                <MessageCircle size={12} /> Conversation
              </Link>
              <button
                type="button"
                onClick={() => {
                  setTab("overview");
                  setFollowupOpen((value) => !value);
                  setActionError(null);
                  setActionSuccess(null);
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#DDE7DF] bg-white px-3 text-[11px] font-semibold text-[#456158] transition hover:bg-[#F0F7F3]"
              >
                <CalendarClock size={12} /> Follow-up
              </button>
              {payload.person?.person_id ? (
                <Link
                  href={`/customer-360/${encodeURIComponent(payload.person.person_id)}?opportunity=${encodeURIComponent(payload.lead.id)}`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#DDE7DF] bg-white px-3 text-[11px] font-semibold text-[#456158] transition hover:bg-[#F0F7F3]"
                >
                  Customer 360 <ArrowRight size={12} />
                </Link>
              ) : null}
              <Link
                href={`/leads/${payload.lead.id}`}
                data-native-lead-navigation="true"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#DDE7DF] bg-white px-3 text-[11px] font-semibold text-[#456158] transition hover:bg-[#F0F7F3]"
              >
                Open profile <ArrowRight size={12} />
              </Link>
              <span className="ml-auto text-[9px] text-[#91A097]">
                {loadedAt ? `Updated ${relativeTime(loadedAt)}` : "Live read"}
              </span>
            </div>
          ) : null}

          <nav className="mt-4 flex gap-5" aria-label="Lead Inspector sections">
            <InspectorTabButton
              active={tab === "overview"}
              icon={<UserRound size={13} />}
              label="Overview"
              onClick={() => setTab("overview")}
            />
            <InspectorTabButton
              active={tab === "journey"}
              icon={<Route size={13} />}
              label="Journey"
              count={payload?.journeyTotal}
              onClick={() => setTab("journey")}
            />
            <InspectorTabButton
              active={tab === "activity"}
              icon={<Activity size={13} />}
              label="Activity"
              count={activityCount}
              onClick={() => setTab("activity")}
            />
          </nav>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {loading ? <InspectorLoading /> : null}
          {error && !payload ? <InspectorError message={error} /> : null}

          {payload ? (
            <div className="space-y-4">
              {error ? <InspectorInlineWarning>{error}</InspectorInlineWarning> : null}
              {payload.warnings.length ? (
                <InspectorInlineWarning>{payload.warnings.join(" ")}</InspectorInlineWarning>
              ) : null}
              {actionSuccess ? (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[10px] font-medium text-emerald-700">
                  <CheckCircle2 size={13} /> {actionSuccess}
                </div>
              ) : null}
              {actionError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[10px] text-red-700">
                  {actionError}
                </div>
              ) : null}

              {tab === "overview" && focus ? (
                <OverviewTab
                  payload={payload}
                  focus={focus}
                  presets={presets}
                  followupOpen={followupOpen}
                  followupTitle={followupTitle}
                  followupDueAt={followupDueAt}
                  followupDescription={followupDescription}
                  actionLoading={actionLoading}
                  onPreset={applyPreset}
                  onToggleFollowup={() => setFollowupOpen((value) => !value)}
                  onTitleChange={setFollowupTitle}
                  onDueChange={setFollowupDueAt}
                  onDescriptionChange={setFollowupDescription}
                  onSubmit={submitFollowup}
                />
              ) : null}
              {tab === "journey" ? <JourneyTab payload={payload} /> : null}
              {tab === "activity" ? <ActivityTab payload={payload} /> : null}
            </div>
          ) : null}
        </div>
      </aside>
    </div>,
    document.body,
  );
}

export function LeadInspectorButton({
  leadId,
  label = "Inspect",
  className = "",
}: {
  leadId: string;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        className={
          className ||
          "inline-flex h-8 items-center gap-1.5 rounded-md border border-[#DDE7DF] bg-white px-2.5 text-[11px] font-semibold text-[#456158] transition hover:bg-[#F0F7F3] hover:text-[#216551]"
        }
      >
        {label} <ExternalLink size={11} />
      </button>
      <LeadInspector leadId={open ? leadId : null} onClose={() => setOpen(false)} />
    </>
  );
}

function OverviewTab({
  payload,
  focus,
  presets,
  followupOpen,
  followupTitle,
  followupDueAt,
  followupDescription,
  actionLoading,
  onPreset,
  onToggleFollowup,
  onTitleChange,
  onDueChange,
  onDescriptionChange,
  onSubmit,
}: {
  payload: InspectorPayload;
  focus: LeadFocus;
  presets: FollowupPreset[];
  followupOpen: boolean;
  followupTitle: string;
  followupDueAt: string;
  followupDescription: string;
  actionLoading: boolean;
  onPreset: (preset: FollowupPreset) => void;
  onToggleFollowup: () => void;
  onTitleChange: (value: string) => void;
  onDueChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const { lead, person, payments, salesIntelligence, openTasks } = payload;
  const recordedPaid = useMemo(() => sumPaidByCurrency(payments), [payments]);
  const potential = lead.potentialValue ?? lead.value;
  const potentialCurrency = lead.potentialCurrency ?? lead.currency;
  const visitorLocation = [lead.geoCity, lead.geoRegion, lead.geoCountry]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <DecisionStrip payload={payload} />
      <FocusCard payload={payload} focus={focus} onSchedule={onToggleFollowup} />

      <SmartFollowupComposer
        payload={payload}
        presets={presets}
        open={followupOpen}
        title={followupTitle}
        dueAt={followupDueAt}
        description={followupDescription}
        loading={actionLoading}
        onPreset={onPreset}
        onToggle={onToggleFollowup}
        onTitleChange={onTitleChange}
        onDueChange={onDueChange}
        onDescriptionChange={onDescriptionChange}
        onSubmit={onSubmit}
      />

      <Section title="Open follow-ups" eyebrow="Committed next actions">
        <AvailabilityNote
          availability={payload.availability.openTasks}
          empty="No open follow-up tasks are currently stored for this lead."
          unavailable="Open follow-up tasks could not be loaded."
        />
        {openTasks.length ? (
          <div className="space-y-2.5">
            {openTasks.slice(0, 5).map((task) => {
              const overdue = task.due_at ? Date.parse(task.due_at) < Date.now() : false;
              return (
                <div key={task.id} className="rounded-lg border border-[#E4EAE6] bg-[#FBFCFB] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[11px] font-semibold text-[#2C443B]">{task.title}</div>
                      {task.description ? (
                        <div className="mt-1 line-clamp-2 text-[10px] leading-4 text-[#7A8981]">{task.description}</div>
                      ) : null}
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-semibold ${overdue ? "bg-amber-100 text-amber-700" : "bg-[#E9F4EC] text-[#216551]"}`}>
                      {task.due_at ? (overdue ? `${formatDelta(Date.parse(task.due_at), Date.now())} overdue` : `in ${formatDelta(Date.now(), Date.parse(task.due_at))}`) : "No due time"}
                    </span>
                  </div>
                </div>
              );
            })}
            <Link href="/follow-ups" className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#216551] hover:underline">
              Open follow-up queue <ArrowRight size={11} />
            </Link>
          </div>
        ) : null}
      </Section>

      <Section title="Live decision signals" eyebrow="Canonical sales intelligence">
        <AvailabilityNote
          availability={payload.availability.salesIntelligence}
          empty="No canonical sales-intelligence row is available for this lead yet."
          unavailable="Canonical sales intelligence could not be loaded. Presentation guidance is using visible CRM state only."
        />
        {salesIntelligence ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetricBox label="Priority" value={salesIntelligence.priority_band ? pretty(salesIntelligence.priority_band) : "—"} />
              <MetricBox label="Score" value={numberText(salesIntelligence.priority_score)} />
              <MetricBox label="Intent" value={salesIntelligence.derived_intent ? pretty(salesIntelligence.derived_intent) : "—"} />
              <MetricBox label="Engagement" value={numberText(salesIntelligence.engagement_score)} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MiniSignal label="High-intent · 7d" value={numberText(salesIntelligence.high_intent_events_7d)} />
              <MiniSignal label="WhatsApp clicks" value={numberText(salesIntelligence.whatsapp_clicks_7d)} />
              <MiniSignal label="Reservation starts" value={numberText(salesIntelligence.reservation_starts_7d)} />
              <MiniSignal label="Payment starts" value={numberText(salesIntelligence.payment_starts_7d)} />
            </div>
            {salesIntelligence.priority_reason ? (
              <div className="mt-3 rounded-lg bg-[#F4F7F5] px-3 py-2.5 text-[10px] leading-5 text-[#62746B]">
                <strong className="font-semibold text-[#40564C]">Why now:</strong>{" "}
                {salesIntelligence.priority_reason}
              </div>
            ) : null}
            {salesIntelligence.recommended_course_name ? (
              <div className="mt-3 rounded-lg border border-[#DCE8DF] bg-[#F8FBF9] px-3 py-2.5">
                <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#85928B]">Course affinity</div>
                <div className="mt-1 text-[11px] font-semibold text-[#344E42]">
                  {salesIntelligence.recommended_course_name}
                  {salesIntelligence.recommended_course_code ? ` · ${salesIntelligence.recommended_course_code}` : ""}
                </div>
                <div className="mt-1 text-[10px] text-[#718078]">
                  Affinity {numberText(salesIntelligence.recommended_affinity_score)}
                  {salesIntelligence.recommendation_basis ? ` · ${pretty(salesIntelligence.recommendation_basis)}` : ""}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </Section>

      <Section title="Opportunity" eyebrow="Current CRM state">
        <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
          <DataPoint label="Course" value={lead.course || "Not selected"} />
          <DataPoint label="Preferred location" value={lead.preferredLocation || lead.location || "Not selected"} icon={<MapPin size={13} />} />
          <DataPoint label="Preferred month" value={lead.preferredMonth || "Not captured"} icon={<CalendarClock size={13} />} />
          <DataPoint label="Mode" value={lead.preferredMode || "Not captured"} />
          <DataPoint label="Owner" value={lead.owner || "Unassigned"} />
          <DataPoint label="Stored intent" value={pretty(lead.intent || "unknown")} />
        </div>
      </Section>

      <Section title="Contact" eyebrow="Reachability">
        <div className="space-y-3">
          <CompactRow icon={<Mail size={13} />} label="Email" value={lead.email || "Not captured"} />
          <CompactRow icon={<Phone size={13} />} label="Phone" value={lead.phone || "Not captured"} />
          <CompactRow icon={<MessageCircle size={13} />} label="Current channel" value={pretty(lead.currentContactChannel || "unknown")} />
          <CompactRow icon={<Clock3 size={13} />} label="Last contacted" value={formatDateTime(lead.lastContactedAt)} />
          <CompactRow icon={<CalendarClock size={13} />} label="Next follow-up" value={formatDateTime(salesIntelligence?.next_followup_at || lead.nextFollowupAt)} />
        </div>
      </Section>

      <Section title="Acquisition" eyebrow="Attribution context">
        <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
          <DataPoint label="First touch" value={pretty(lead.firstTouchSource || "unknown")} sub={lead.firstTouchCampaign || undefined} />
          <DataPoint label="First medium" value={pretty(lead.firstTouchMedium || "unknown")} />
          <DataPoint label="Last touch" value={pretty(lead.lastTouchSource || "unknown")} sub={lead.lastTouchCampaign || undefined} />
          <DataPoint label="Landing page" value={lead.landingPage || "Not captured"} />
          <DataPoint label="Lead origin" value={pretty(lead.leadOrigin || "unknown")} />
          <DataPoint label="Visitor location" value={visitorLocation || "Not captured"} />
        </div>
      </Section>

      <Section title="Revenue & payments" eyebrow="Recorded financial evidence">
        <div className="grid gap-3 sm:grid-cols-2">
          <MetricBox label="Potential value" value={potential != null && potentialCurrency ? formatMoney(potential, potentialCurrency) : "Not recorded"} />
          <MetricBox label="Recorded paid" value={formatCurrencyMap(recordedPaid)} />
        </div>
        <AvailabilityNote
          availability={payload.availability.payments}
          empty="No payment records are stored for this lead."
          unavailable="Payment history could not be loaded. No zero value is assumed."
        />
        {payments.length ? (
          <div className="mt-3 divide-y divide-[#EDF1EE] rounded-lg border border-[#E4EAE6] bg-white px-3">
            {payments.slice(0, 6).map((payment) => (
              <div key={payment.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <div className="text-[11px] font-semibold text-[#2C443B]">{pretty(payment.paymentKind)} · {pretty(payment.status)}</div>
                  <div className="mt-0.5 text-[10px] text-[#849188]">{payment.provider || "Provider not recorded"} · {formatDateTime(payment.paidAt || payment.createdAt)}</div>
                </div>
                <div className="text-[12px] font-semibold text-[#192E29]">{formatMoney(payment.amount, payment.currency)}</div>
              </div>
            ))}
          </div>
        ) : null}
      </Section>

      <Section title="Person 360" eyebrow="Cross-journey signals">
        <AvailabilityNote
          availability={payload.availability.person360}
          empty="This lead is not yet linked to a Person 360 record."
          unavailable="Person 360 intelligence is temporarily unavailable."
        />
        {person ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetricBox label="Sessions" value={numberText(person.session_count)} />
              <MetricBox label="Touchpoints" value={numberText(person.touchpoint_count)} />
              <MetricBox label="Messages" value={numberText(person.message_count)} />
              <MetricBox label="Enrollments" value={numberText(person.enrollment_count)} />
            </div>
            <div className="mt-3 grid gap-x-5 gap-y-4 sm:grid-cols-2">
              <DataPoint label="Behaviour" value={pretty(person.latest_lead_behaviour_temperature || "not available")} />
              <DataPoint label="Engagement score" value={numberText(person.latest_lead_engagement_score)} />
              <DataPoint label="Sessions · 30d" value={numberText(person.sessions_30d)} />
              <DataPoint label="Page views" value={numberText(person.page_view_count)} />
            </div>
            {person.latest_lead_behaviour_reason ? (
              <div className="mt-3 rounded-lg bg-[#F4F7F5] px-3 py-2.5 text-[10px] leading-5 text-[#62746B]">{person.latest_lead_behaviour_reason}</div>
            ) : null}
          </>
        ) : null}
      </Section>

      {lead.summary || lead.notes ? (
        <Section title="Context" eyebrow="Lead record">
          {lead.summary ? <TextBlock label="CRM summary" value={lead.summary} /> : null}
          {lead.notes ? <TextBlock label="Internal notes" value={lead.notes} /> : null}
        </Section>
      ) : null}
    </>
  );
}

function DecisionStrip({ payload }: { payload: InspectorPayload }) {
  const intel = payload.salesIntelligence;
  const nextFollowup = intel?.next_followup_at || payload.lead.nextFollowupAt;
  const nextTime = nextFollowup ? Date.parse(nextFollowup) : Number.NaN;
  const followupLabel = Number.isFinite(nextTime)
    ? nextTime < Date.now()
      ? `${formatDelta(nextTime, Date.now())} overdue`
      : `in ${formatDelta(Date.now(), nextTime)}`
    : "Not scheduled";

  return (
    <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <DecisionMetric icon={<Target size={13} />} label="Priority" value={intel?.priority_band ? pretty(intel.priority_band) : "Not available"} />
      <DecisionMetric icon={<Flame size={13} />} label="Intent" value={intel?.derived_intent ? pretty(intel.derived_intent) : pretty(payload.lead.intent || "unknown")} />
      <DecisionMetric icon={<Zap size={13} />} label="Engagement" value={numberText(intel?.engagement_score ?? payload.person?.latest_lead_engagement_score)} />
      <DecisionMetric icon={<CalendarClock size={13} />} label="Next follow-up" value={followupLabel} />
    </section>
  );
}

function FocusCard({
  payload,
  focus,
  onSchedule,
}: {
  payload: InspectorPayload;
  focus: LeadFocus;
  onSchedule: () => void;
}) {
  const toneClass =
    focus.tone === "attention"
      ? "border-amber-200 bg-amber-50/80"
      : focus.tone === "opportunity"
        ? "border-emerald-200 bg-emerald-50/70"
        : "border-[#D9E6DD] bg-[#F4F9F5]";
  const iconClass = focus.tone === "attention" ? "bg-amber-100 text-amber-700" : "bg-[#DDEFE3] text-[#216551]";
  const needsOwner = focus.action.toLowerCase().includes("assign") && !payload.lead.owner;

  return (
    <section className={`rounded-xl border p-4 ${toneClass}`}>
      <div className="flex items-start gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${iconClass}`}><Sparkles size={16} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-[9px] font-bold uppercase tracking-[0.13em] text-[#74837A]">
            {focus.source === "canonical" ? "Canonical next best action" : "Suggested focus · current evidence"}
          </div>
          <div className="mt-1 text-[14px] font-semibold text-[#203B31]">{focus.action}</div>
          <div className="mt-1 text-[10px] leading-5 text-[#63756B]">{focus.detail}</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {focus.reasons.map((reason) => <SmallTag key={reason}>{reason}</SmallTag>)}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-black/5 pt-3">
        <Link
          href={needsOwner ? `/leads/${payload.lead.id}/edit` : `/conversations?lead=${payload.lead.id}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#216551] px-3 text-[10px] font-semibold text-white hover:bg-[#174D3B]"
        >
          <Zap size={12} /> {needsOwner ? "Assign owner" : "Act now"}
        </Link>
        <button type="button" onClick={onSchedule} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#CADBCF] bg-white px-3 text-[10px] font-semibold text-[#456158] hover:bg-[#F8FBF9]">
          <CalendarClock size={12} /> Schedule next step
        </button>
        <span className="ml-auto text-[9px] text-[#849188]">
          {focus.source === "canonical" ? "Existing intelligence · human action required" : "Presentation guidance · no automatic write"}
        </span>
      </div>
    </section>
  );
}

function SmartFollowupComposer({
  payload,
  presets,
  open,
  title,
  dueAt,
  description,
  loading,
  onPreset,
  onToggle,
  onTitleChange,
  onDueChange,
  onDescriptionChange,
  onSubmit,
}: {
  payload: InspectorPayload;
  presets: FollowupPreset[];
  open: boolean;
  title: string;
  dueAt: string;
  description: string;
  loading: boolean;
  onPreset: (preset: FollowupPreset) => void;
  onToggle: () => void;
  onTitleChange: (value: string) => void;
  onDueChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="rounded-xl border border-[#DCE8DF] bg-white">
      <div className="flex items-start justify-between gap-3 px-4 py-3.5">
        <div>
          <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#216551]">Smart follow-up</div>
          <div className="mt-1 text-[11px] font-semibold text-[#2C443B]">Turn the next step into a committed task</div>
          <div className="mt-1 text-[10px] leading-4 text-[#7A8981]">Timing presets adapt to current CRM evidence. Nothing is created until you submit.</div>
        </div>
        <button type="button" onClick={onToggle} className="shrink-0 rounded-md border border-[#DDE7DF] px-2.5 py-1.5 text-[10px] font-semibold text-[#456158] hover:bg-[#F4F8F5]">
          {open ? "Close" : "Schedule"}
        </button>
      </div>

      <div className="border-t border-[#EDF1EE] px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          {presets.map((preset) => (
            <button key={preset.id} type="button" onClick={() => onPreset(preset)} className="rounded-full border border-[#D7E5DB] bg-[#F8FBF9] px-2.5 py-1.5 text-[9px] font-semibold text-[#506A5E] transition hover:border-[#9FC0AA] hover:text-[#216551]">
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {open ? (
        <form onSubmit={onSubmit} className="border-t border-[#EDF1EE] bg-[#F8FAF8] p-4">
          <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_190px]">
            <label>
              <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.08em] text-[#849188]">Follow-up</span>
              <input value={title} onChange={(event) => onTitleChange(event.target.value)} maxLength={240} required className="h-9 w-full rounded-lg border border-[#DDE7DF] bg-white px-3 text-[11px] text-[#344E42] outline-none focus:border-[#7AA88B]" placeholder={`Follow up with ${payload.lead.name || "lead"}`} />
            </label>
            <label>
              <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.08em] text-[#849188]">Due</span>
              <input type="datetime-local" value={dueAt} onChange={(event) => onDueChange(event.target.value)} required className="h-9 w-full rounded-lg border border-[#DDE7DF] bg-white px-2.5 text-[11px] text-[#344E42] outline-none focus:border-[#7AA88B]" />
            </label>
          </div>
          <label className="mt-2.5 block">
            <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.08em] text-[#849188]">Context · optional</span>
            <textarea value={description} onChange={(event) => onDescriptionChange(event.target.value)} maxLength={4000} rows={2} className="w-full resize-y rounded-lg border border-[#DDE7DF] bg-white px-3 py-2 text-[11px] leading-5 text-[#344E42] outline-none focus:border-[#7AA88B]" placeholder="Useful context for the admissions team" />
          </label>
          <div className="mt-3 flex items-center justify-end gap-2">
            <button type="button" onClick={onToggle} className="h-8 rounded-md px-3 text-[10px] font-semibold text-[#6E7E76] hover:bg-white">Cancel</button>
            <button type="submit" disabled={loading} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#216551] px-3 text-[10px] font-semibold text-white hover:bg-[#174D3B] disabled:cursor-not-allowed disabled:opacity-60">
              {loading ? <Loader2 size={12} className="animate-spin" /> : <CalendarClock size={12} />} Create follow-up
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function JourneyTab({ payload }: { payload: InspectorPayload }) {
  if (payload.journeyEvidence) return <JourneyEvidencePanel evidence={payload.journeyEvidence} />;
  if (payload.availability.journey === "unavailable") {
    return <EmptyState title="Journey unavailable" body="The canonical Person journey could not be loaded. The Inspector is not substituting inferred events." />;
  }
  if (!payload.journey.length) {
    return <EmptyState title="No journey events yet" body="No canonical Person journey evidence is currently linked to this lead." />;
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#8B988F]">Canonical customer journey</div>
          <div className="mt-1 text-sm font-semibold text-[#192E29]">{payload.journeyTotal.toLocaleString()} recorded events</div>
        </div>
        <span className="rounded-full bg-[#E9F4EC] px-2.5 py-1 text-[10px] font-semibold text-[#216551]">Newest first</span>
      </div>
      <div className="relative space-y-0 before:absolute before:bottom-3 before:left-[7px] before:top-3 before:w-px before:bg-[#DCE7DF]">
        {payload.journey.map((event) => (
          <div key={event.journey_event_key} className="relative grid grid-cols-[16px_minmax(0,1fr)] gap-3 pb-5 last:pb-0">
            <span className="relative z-10 mt-1.5 h-[15px] w-[15px] rounded-full border-[4px] border-[#F8FAF8] bg-[#7AA88B]" />
            <div className="rounded-lg border border-[#E4EAE6] bg-white p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-[12px] font-semibold text-[#233C33]">{event.title}</div>
                  <div className="mt-0.5 text-[10px] text-[#85928B]">{pretty(event.event_category)} · {pretty(event.event_type)}</div>
                </div>
                <div className="text-[10px] font-medium text-[#85928B]">{formatDateTime(event.event_at)}</div>
              </div>
              {event.summary ? <div className="mt-2 text-[11px] leading-5 text-[#607068]">{event.summary}</div> : null}
              {event.channel || event.source ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {event.channel ? <SmallTag>{pretty(event.channel)}</SmallTag> : null}
                  {event.source ? <SmallTag>{pretty(event.source)}</SmallTag> : null}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityTab({ payload }: { payload: InspectorPayload }) {
  const messages = payload.lead.lastMessages ?? [];

  return (
    <>
      <Section title="Contact history" eyebrow="Structured admissions activity">
        {payload.contactSummary ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricBox label="Total" value={numberText(payload.contactSummary.total_contacts)} />
            <MetricBox label="Connected" value={numberText(payload.contactSummary.successful_contacts)} />
            <MetricBox label="No answer" value={numberText(payload.contactSummary.no_answer_contacts)} />
            <MetricBox label="Follow-up" value={numberText(payload.contactSummary.follow_up_needed_contacts)} />
          </div>
        ) : null}
        <AvailabilityNote availability={payload.availability.contactHistory} empty="No structured contact logs are stored yet." unavailable="Contact history could not be loaded. No empty-state assumption is being made." />
        {payload.contactLogs.length ? (
          <div className="mt-3 space-y-2.5">
            {payload.contactLogs.map((log) => (
              <div key={log.id} className="rounded-lg border border-[#E4EAE6] bg-white p-3.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <SmallTag>{pretty(log.method)}</SmallTag><SmallTag>{pretty(log.direction)}</SmallTag><SmallTag>{pretty(log.outcome)}</SmallTag>
                  <span className="ml-auto text-[10px] text-[#89968F]">{formatDateTime(log.contacted_at)}</span>
                </div>
                <div className="mt-2 text-[11px] leading-5 text-[#52665C]">{log.comment}</div>
                <div className="mt-2 text-[10px] text-[#89968F]">Logged by {log.employee_name || "System"}{log.call_duration_seconds ? ` · ${formatDuration(log.call_duration_seconds)}` : ""}</div>
              </div>
            ))}
          </div>
        ) : null}
      </Section>

      <Section title="Recent messages" eyebrow="Conversation activity">
        {!messages.length ? <div className="text-[11px] leading-5 text-[#7D8C84]">No recent CRM messages are stored for this lead.</div> : null}
        <div className="space-y-2.5">
          {messages.map((message) => (
            <div key={message.id} className={`flex ${message.direction === "outbound" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[88%] rounded-xl px-3.5 py-3 text-[11px] leading-5 ${message.direction === "outbound" ? "bg-[#216551] text-white" : "border border-[#E4EAE6] bg-white text-[#52665C]"}`}>
                <div className={`mb-1 text-[9px] font-semibold uppercase tracking-[0.08em] ${message.direction === "outbound" ? "text-white/65" : "text-[#8B988F]"}`}>{message.sender} · {pretty(message.channel)}</div>
                <div>{message.body}</div>
                <div className={`mt-1 text-right text-[9px] ${message.direction === "outbound" ? "text-white/60" : "text-[#8B988F]"}`}>{formatDateTime(message.timestamp)}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

function InspectorTabButton({ active, icon, label, count, onClick }: { active: boolean; icon: ReactNode; label: string; count?: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`relative inline-flex h-10 items-center gap-1.5 text-[11px] font-semibold transition ${active ? "text-[#216551]" : "text-[#7A8981] hover:text-[#40594F]"}`}>
      {icon} {label}
      {typeof count === "number" && count > 0 ? <span className="rounded-full bg-[#EDF4EF] px-1.5 py-0.5 text-[8px] text-[#5D7568]">{count > 99 ? "99+" : count}</span> : null}
      {active ? <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[#216551]" /> : null}
    </button>
  );
}

function Section({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-[#E4EAE6] bg-white p-4">
      <div className="text-[9px] font-bold uppercase tracking-[0.13em] text-[#8B988F]">{eyebrow}</div>
      <h3 className="mt-1 text-[13px] font-semibold text-[#233C33]">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function DecisionMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#E3EAE5] bg-white px-3 py-3">
      <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#8A978F]">{icon}{label}</div>
      <div className="mt-1.5 truncate text-[11px] font-semibold text-[#2C443B]">{value}</div>
    </div>
  );
}

function DataPoint({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#8A978F]">{icon}{label}</div>
      <div className="mt-1 break-words text-[11px] font-semibold text-[#344E42]">{value}</div>
      {sub ? <div className="mt-0.5 break-words text-[10px] text-[#87948D]">{sub}</div> : null}
    </div>
  );
}

function CompactRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="grid grid-cols-[20px_120px_minmax(0,1fr)] items-start gap-2 border-b border-[#EFF2F0] pb-3 last:border-0 last:pb-0">
      <span className="mt-0.5 text-[#7C9487]">{icon}</span><span className="text-[10px] font-medium text-[#829087]">{label}</span><span className="break-words text-right text-[11px] font-medium text-[#344E42]">{value}</span>
    </div>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-[#F4F7F5] px-3 py-3"><div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#8A978F]">{label}</div><div className="mt-1.5 break-words text-[13px] font-semibold text-[#233C33]">{value}</div></div>;
}

function MiniSignal({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-[#E8EDE9] px-2.5 py-2"><div className="text-[8px] font-semibold uppercase tracking-[0.07em] text-[#96A198]">{label}</div><div className="mt-1 text-[11px] font-semibold text-[#40564C]">{value}</div></div>;
}

function TextBlock({ label, value }: { label: string; value: string }) {
  return <div className="mb-4 last:mb-0"><div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#8A978F]">{label}</div><div className="mt-1.5 whitespace-pre-wrap text-[11px] leading-5 text-[#586C62]">{value}</div></div>;
}

function AvailabilityNote({ availability, empty, unavailable }: { availability: Availability; empty: string; unavailable: string }) {
  if (availability === "available") return null;
  return <div className={`mb-3 rounded-lg px-3 py-2 text-[10px] leading-5 ${availability === "unavailable" ? "border border-amber-200 bg-amber-50 text-amber-800" : "bg-[#F5F7F6] text-[#77877E]"}`}>{availability === "unavailable" ? unavailable : empty}</div>;
}

function InspectorInlineWarning({ children }: { children: ReactNode }) {
  return <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[10px] leading-5 text-amber-800"><AlertCircle size={13} className="mt-0.5 shrink-0" /><div>{children}</div></div>;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return <div className="rounded-xl border border-dashed border-[#DCE5DF] bg-white px-5 py-10 text-center"><Route size={20} className="mx-auto text-[#9BAB9F]" /><div className="mt-3 text-[12px] font-semibold text-[#344E42]">{title}</div><div className="mx-auto mt-1 max-w-sm text-[10px] leading-5 text-[#829087]">{body}</div></div>;
}

function InspectorLoading() {
  return <div className="grid min-h-[300px] place-items-center"><div className="text-center"><Loader2 size={22} className="mx-auto animate-spin text-[#216551]" /><div className="mt-3 text-[11px] font-medium text-[#718078]">Loading verified CRM context…</div></div></div>;
}

function InspectorError({ message }: { message: string }) {
  return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-[11px] leading-5 text-red-700"><div className="flex gap-2"><AlertCircle size={15} className="mt-0.5 shrink-0" /><div><strong className="font-semibold">Unable to load Lead Inspector.</strong><div className="mt-1">{message}</div></div></div></div>;
}

function StatePill({ value }: { value: string }) {
  return <span className="rounded-full bg-[#E9F4EC] px-2.5 py-1 text-[9px] font-semibold text-[#216551]">{pretty(value)}</span>;
}

function SmallTag({ children }: { children: ReactNode }) {
  return <span className="rounded-md bg-white/75 px-2 py-1 text-[9px] font-semibold text-[#62786C] ring-1 ring-black/[0.04]">{children}</span>;
}

function buildLeadFocus(payload: InspectorPayload): LeadFocus {
  const { lead, person, salesIntelligence } = payload;
  const now = Date.now();

  if (salesIntelligence?.next_best_action) {
    const reasons: string[] = [];
    if (salesIntelligence.priority_band) {
      const score = salesIntelligence.priority_score == null ? "" : ` · ${numberText(salesIntelligence.priority_score)}`;
      reasons.push(`${pretty(salesIntelligence.priority_band)} priority${score}`);
    }
    if (salesIntelligence.derived_intent) reasons.push(`${pretty(salesIntelligence.derived_intent)} intent`);
    if (salesIntelligence.behaviour_temperature) reasons.push(`${pretty(salesIntelligence.behaviour_temperature)} behaviour`);
    if (salesIntelligence.payment_status) reasons.push(pretty(salesIntelligence.payment_status));
    return {
      action: salesIntelligence.next_best_action,
      detail: salesIntelligence.priority_reason || "This action comes from the canonical sales-intelligence read model.",
      tone: salesIntelligence.priority_band === "critical" || salesIntelligence.priority_band === "high" ? "attention" : "opportunity",
      reasons: reasons.slice(0, 4),
      source: "canonical",
    };
  }

  const reasons: string[] = [];
  const dueAt = lead.nextFollowupAt ? Date.parse(lead.nextFollowupAt) : Number.NaN;
  const latest = latestMessage(lead.lastMessages ?? []);
  const temperature = person?.latest_lead_behaviour_temperature;

  if (Number.isFinite(dueAt)) reasons.push(dueAt < now ? `Follow-up ${formatDelta(dueAt, now)} overdue` : `Follow-up in ${formatDelta(now, dueAt)}`);
  else reasons.push("No follow-up scheduled");
  if (temperature) reasons.push(`${pretty(temperature)} behaviour`);
  if (lead.owner) reasons.push(`Owner: ${lead.owner}`);
  else reasons.push("Unassigned");
  if (payload.journeyTotal > 0) reasons.push(`${payload.journeyTotal} journey events`);

  if (Number.isFinite(dueAt) && dueAt < now) return { action: "Follow up now", detail: "The committed next action is overdue. Re-open the conversation or set a new follow-up time.", tone: "attention", reasons: reasons.slice(0, 4), source: "presentation" };
  if (latest?.direction === "inbound") return { action: "Reply to the latest inbound message", detail: "The most recent stored CRM message came from the lead, so the clearest next action is to continue that conversation.", tone: "opportunity", reasons: reasons.slice(0, 4), source: "presentation" };
  if (lead.stage === "payment_pending") return { action: "Resolve the pending payment", detail: "This opportunity is already at the payment stage. Confirm the blocker, payment path, or a specific next time.", tone: "attention", reasons: reasons.slice(0, 4), source: "presentation" };
  if (!lead.owner) return { action: "Assign clear ownership", detail: "The lead is currently unassigned. Ownership should be clear before the next admissions action is missed.", tone: "attention", reasons: reasons.slice(0, 4), source: "presentation" };
  if (lead.stage === "new" && !lead.lastContactedAt) return { action: "Make first contact", detail: "No previous contact time is recorded for this new lead. Start the conversation and capture the outcome.", tone: "opportunity", reasons: reasons.slice(0, 4), source: "presentation" };
  if (lead.stage === "qualified" || lead.stage === "high_intent") return { action: "Move the conversation toward enrollment", detail: "The lead is already in an advanced admissions stage. Clarify the remaining decision, batch, or payment step.", tone: "opportunity", reasons: reasons.slice(0, 4), source: "presentation" };
  return { action: "Continue the active conversation", detail: "Use the current CRM stage, journey evidence, and conversation context to decide the next human action.", tone: "neutral", reasons: reasons.slice(0, 4), source: "presentation" };
}

function buildFollowupPresets(payload: InspectorPayload, focus: LeadFocus): FollowupPreset[] {
  const leadName = payload.lead.name || payload.lead.leadCode || "lead";
  const latest = latestMessage(payload.lead.lastMessages ?? []);
  const priority = payload.salesIntelligence?.priority_band;
  const actionCode = payload.salesIntelligence?.next_action_code || "";
  const payment = payload.lead.stage === "payment_pending" || actionCode.includes("payment");
  const urgent = priority === "critical" || priority === "high" || focus.tone === "attention";

  const presets: FollowupPreset[] = [];
  if (latest?.direction === "inbound") {
    presets.push({ id: "reply-soon", label: "Reply window · 2h", hours: 2, title: `Reply to ${leadName}`, description: "Follow up on the latest inbound conversation while context is fresh." });
  }
  if (payment) {
    presets.push({ id: "payment", label: "Payment check · 4h", hours: 4, title: `Check payment with ${leadName}`, description: "Confirm the payment blocker, payment path, or next committed step." });
  }
  if (urgent) {
    presets.push({ id: "priority", label: "Priority · today", hours: 6, title: defaultFollowupTitle(payload, focus), description: "Priority follow-up based on the current CRM evidence." });
  }
  presets.push(
    { id: "tomorrow", label: "Tomorrow", hours: 24, title: defaultFollowupTitle(payload, focus), description: "Continue the current admissions conversation." },
    { id: "three-days", label: "+3 days", hours: 72, title: defaultFollowupTitle(payload, focus), description: "Check for progress on the current decision or blocker." },
    { id: "week", label: "+7 days", hours: 168, title: defaultFollowupTitle(payload, focus), description: "Re-engage if the lead has not progressed before then." },
  );

  const seen = new Set<string>();
  return presets.filter((preset) => {
    if (seen.has(preset.id)) return false;
    seen.add(preset.id);
    return true;
  }).slice(0, 5);
}

function defaultFollowupTitle(payload: InspectorPayload, focus: LeadFocus) {
  const name = payload.lead.name || payload.lead.leadCode || "lead";
  const actionCode = payload.salesIntelligence?.next_action_code;
  if (actionCode?.includes("payment") || focus.action === "Resolve the pending payment") return `Check payment with ${name}`;
  if (actionCode?.includes("first") || focus.action === "Make first contact") return `Contact ${name}`;
  if (focus.action.toLowerCase().includes("reply")) return `Reply to ${name}`;
  return `Follow up with ${name}`;
}

function latestMessage(messages: NonNullable<InspectorLead["lastMessages"]>) {
  return [...messages].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0] ?? null;
}

function defaultDateTimeLocal(hoursFromNow: number) {
  const date = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  date.setSeconds(0, 0);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDelta(from: number, to: number) {
  const diff = Math.max(0, to - from);
  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

function relativeTime(timestamp: number) {
  const diff = Math.max(0, Date.now() - timestamp);
  if (diff < 10_000) return "just now";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "under a minute ago";
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

function sumPaidByCurrency(payments: InspectorPayment[]) {
  const result: Record<string, number> = {};
  for (const payment of payments) {
    if (payment.status !== "paid") continue;
    const currency = String(payment.currency || "").toUpperCase();
    if (!currency) continue;
    result[currency] = (result[currency] ?? 0) + Number(payment.amount || 0);
  }
  return result;
}

function formatCurrencyMap(values: Record<string, number>) {
  const entries = Object.entries(values);
  if (!entries.length) return "No paid records";
  return entries.map(([currency, amount]) => formatMoney(amount, currency)).join(" · ");
}

function formatMoney(amount: number | string, currency: string) {
  const number = Number(amount);
  if (!Number.isFinite(number)) return "—";
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: String(currency).toUpperCase(), maximumFractionDigits: 0 }).format(number);
  } catch {
    return `${String(currency).toUpperCase()} ${number.toLocaleString("en-IN")}`;
  }
}

function numberText(value: number | string | null | undefined) {
  if (value == null || value === "") return "Not available";
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("en-IN") : String(value);
}

function pretty(value: string) {
  return String(value || "").replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "L";
}

function formatDateTime(value?: string | null) {
  if (!value) return "Not recorded";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Not recorded";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes <= 0) return `${remainder}s`;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}
