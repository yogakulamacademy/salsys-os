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
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Route,
  Sparkles,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  person_status?: string | null;
  primary_email?: string | null;
  primary_phone?: string | null;
  session_count?: number | string | null;
  sessions_30d?: number | string | null;
  touchpoint_count?: number | string | null;
  page_view_count?: number | string | null;
  conversation_count?: number | string | null;
  message_count?: number | string | null;
  enrollment_count?: number | string | null;
  confirmed_or_completed_enrollment_count?: number | string | null;
  paid_payment_count?: number | string | null;
  paid_amount_by_currency?: Record<string, number | string> | null;
  latest_lead_engagement_score?: number | string | null;
  latest_lead_behaviour_temperature?: string | null;
  latest_lead_behaviour_reason?: string | null;
  last_session_at?: string | null;
  last_message_at?: string | null;
  last_inbound_at?: string | null;
  last_outbound_at?: string | null;
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
  schemaVersion: "lead_inspector_v1";
  generatedAt: string;
  lead: InspectorLead;
  payments: InspectorPayment[];
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
  const [followupOpen, setFollowupOpen] = useState(false);
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
    return body.data;
  }, []);

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
    setFollowupTitle(defaultFollowupTitle(payload, focus));
    setFollowupDueAt(defaultDateTimeLocal(24));
    setFollowupDescription("");
  }, [payload?.lead.id]);

  useEffect(() => {
    if (!leadId) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (followupOpen) {
        setFollowupOpen(false);
        return;
      }
      onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [leadId, followupOpen, onClose]);

  async function submitFollowup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!leadId || !followupTitle.trim() || !followupDueAt) return;

    const due = new Date(followupDueAt);
    if (Number.isNaN(due.getTime())) {
      setActionError("Choose a valid follow-up date and time.");
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

      setActionSuccess("Follow-up scheduled and synced to the lead.");
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

  return createPortal(
    <div
      className="fixed inset-0 z-[140] flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Lead Inspector"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close Lead Inspector"
        className="absolute inset-0 bg-slate-950/20 backdrop-blur-[1px]"
      />

      <aside className="relative flex h-full w-full flex-col border-l border-[#DDE7DF] bg-[#FBFCFB] shadow-[-18px_0_50px_rgba(19,46,38,0.14)] sm:max-w-[620px]">
        <div className="border-b border-[#E4EAE6] bg-white px-5 pb-0 pt-5 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#E4F2E8] text-xs font-bold text-[#216551]">
              {payload ? initials(payload.lead.name || payload.lead.leadCode) : "…"}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-[17px] font-semibold tracking-[-0.02em] text-[#192E29]">
                  {payload?.lead.name || (loading ? "Loading lead…" : "Lead Inspector")}
                </h2>
                {payload ? <StatePill value={payload.lead.stage} /> : null}
              </div>
              <div className="mt-1 truncate text-[11px] text-[#7A8981]">
                {payload
                  ? [payload.lead.leadCode, payload.lead.course, payload.lead.country]
                      .filter(Boolean)
                      .join(" · ")
                  : "Current CRM evidence and customer journey"}
              </div>
            </div>

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
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={`/conversations?lead=${payload.lead.id}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#216551] px-3 text-[11px] font-semibold text-white transition hover:bg-[#174D3B]"
              >
                <MessageCircle size={12} /> Conversation
              </Link>
              <button
                type="button"
                onClick={() => {
                  setFollowupOpen((value) => !value);
                  setActionError(null);
                  setActionSuccess(null);
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#DDE7DF] bg-white px-3 text-[11px] font-semibold text-[#456158] transition hover:bg-[#F0F7F3]"
              >
                <CalendarClock size={12} /> Follow-up
              </button>
              <Link
                href={`/leads/${payload.lead.id}`}
                data-native-lead-navigation="true"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#DDE7DF] bg-white px-3 text-[11px] font-semibold text-[#456158] transition hover:bg-[#F0F7F3]"
              >
                Open profile <ArrowRight size={12} />
              </Link>
              <Link
                href={`/leads/${payload.lead.id}/edit`}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#DDE7DF] bg-white px-3 text-[11px] font-semibold text-[#456158] transition hover:bg-[#F0F7F3]"
              >
                Edit
              </Link>
            </div>
          ) : null}

          {payload && followupOpen ? (
            <form
              onSubmit={submitFollowup}
              className="mt-4 rounded-xl border border-[#D7E6DC] bg-[#F6FAF7] p-3.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.11em] text-[#216551]">
                    Schedule next action
                  </div>
                  <div className="mt-1 text-[10px] leading-4 text-[#728179]">
                    Creates the canonical CRM follow-up and updates the lead&apos;s next follow-up time.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setFollowupOpen(false)}
                  className="grid h-7 w-7 place-items-center rounded-md text-[#7B8A82] hover:bg-white"
                  aria-label="Close follow-up form"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="mt-3 grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_190px]">
                <label>
                  <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.08em] text-[#849188]">
                    Follow-up
                  </span>
                  <input
                    value={followupTitle}
                    onChange={(event) => setFollowupTitle(event.target.value)}
                    maxLength={240}
                    required
                    className="h-9 w-full rounded-lg border border-[#DDE7DF] bg-white px-3 text-[11px] text-[#344E42] outline-none transition focus:border-[#7AA88B]"
                    placeholder="What should happen next?"
                  />
                </label>
                <label>
                  <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.08em] text-[#849188]">
                    Due
                  </span>
                  <input
                    type="datetime-local"
                    value={followupDueAt}
                    onChange={(event) => setFollowupDueAt(event.target.value)}
                    required
                    className="h-9 w-full rounded-lg border border-[#DDE7DF] bg-white px-2.5 text-[11px] text-[#344E42] outline-none transition focus:border-[#7AA88B]"
                  />
                </label>
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                <QuickDue label="+2h" onClick={() => setFollowupDueAt(defaultDateTimeLocal(2))} />
                <QuickDue label="Tomorrow" onClick={() => setFollowupDueAt(defaultDateTimeLocal(24))} />
                <QuickDue label="+3 days" onClick={() => setFollowupDueAt(defaultDateTimeLocal(72))} />
                <QuickDue label="+7 days" onClick={() => setFollowupDueAt(defaultDateTimeLocal(168))} />
              </div>

              <label className="mt-2.5 block">
                <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.08em] text-[#849188]">
                  Note · optional
                </span>
                <textarea
                  value={followupDescription}
                  onChange={(event) => setFollowupDescription(event.target.value)}
                  maxLength={4000}
                  rows={2}
                  className="w-full resize-y rounded-lg border border-[#DDE7DF] bg-white px-3 py-2 text-[11px] leading-5 text-[#344E42] outline-none transition focus:border-[#7AA88B]"
                  placeholder="Context for the admissions team"
                />
              </label>

              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setFollowupOpen(false)}
                  className="h-8 rounded-md px-3 text-[10px] font-semibold text-[#6E7E76] hover:bg-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#216551] px-3 text-[10px] font-semibold text-white transition hover:bg-[#174D3B] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {actionLoading ? <Loader2 size={12} className="animate-spin" /> : <CalendarClock size={12} />}
                  Schedule
                </button>
              </div>
            </form>
          ) : null}

          {actionError ? (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[10px] text-red-700">
              {actionError}
            </div>
          ) : null}
          {actionSuccess ? (
            <div
              aria-live="polite"
              className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] text-emerald-700"
            >
              <CheckCircle2 size={13} /> {actionSuccess}
            </div>
          ) : null}

          <nav className="mt-4 flex gap-5" aria-label="Lead Inspector sections">
            {([
              ["overview", "Overview", UserRound],
              ["journey", "Journey", Route],
              ["activity", "Activity", Activity],
            ] as const).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={`relative inline-flex h-10 items-center gap-1.5 text-[11px] font-semibold transition ${
                  tab === value
                    ? "text-[#216551]"
                    : "text-[#7A8981] hover:text-[#40594F]"
                }`}
              >
                <Icon size={13} /> {label}
                {tab === value ? (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[#216551]" />
                ) : null}
              </button>
            ))}
          </nav>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {loading ? <InspectorLoading /> : null}
          {error ? <InspectorError message={error} /> : null}
          {!loading && !error && payload ? (
            <>
              {payload.warnings.length ? (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] leading-5 text-amber-800">
                  <div className="flex gap-2">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    <div>{payload.warnings.join(" ")}</div>
                  </div>
                </div>
              ) : null}

              {tab === "overview" ? (
                <OverviewTab
                  payload={payload}
                  focus={focus ?? buildLeadFocus(payload)}
                  onSchedule={() => {
                    setFollowupOpen(true);
                    setActionError(null);
                    setActionSuccess(null);
                  }}
                />
              ) : null}
              {tab === "journey" ? <JourneyTab payload={payload} /> : null}
              {tab === "activity" ? <ActivityTab payload={payload} /> : null}
            </>
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
  onSchedule,
}: {
  payload: InspectorPayload;
  focus: LeadFocus;
  onSchedule: () => void;
}) {
  const { lead, person, payments, salesIntelligence } = payload;
  const recordedPaid = useMemo(() => sumPaidByCurrency(payments), [payments]);
  const potential = lead.potentialValue ?? lead.value;
  const potentialCurrency = lead.potentialCurrency ?? lead.currency;
  const visitorLocation = [lead.geoCity, lead.geoRegion, lead.geoCountry]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-4">
      <FocusCard payload={payload} focus={focus} onSchedule={onSchedule} />

      <Section title="Sales intelligence" eyebrow="Canonical decision support">
        <AvailabilityNote
          availability={payload.availability.salesIntelligence}
          empty="No canonical sales-intelligence row is available for this lead yet."
          unavailable="Canonical sales intelligence could not be loaded. The Inspector is falling back to visible CRM state only."
        />
        {salesIntelligence ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetricBox
                label="Priority"
                value={salesIntelligence.priority_band ? pretty(salesIntelligence.priority_band) : "Not available"}
              />
              <MetricBox
                label="Priority score"
                value={numberText(salesIntelligence.priority_score)}
              />
              <MetricBox
                label="Derived intent"
                value={salesIntelligence.derived_intent ? pretty(salesIntelligence.derived_intent) : "Not available"}
              />
              <MetricBox
                label="Confidence"
                value={salesIntelligence.intent_confidence ? pretty(salesIntelligence.intent_confidence) : "Not available"}
              />
            </div>

            <div className="mt-3 grid gap-x-5 gap-y-4 sm:grid-cols-2">
              <DataPoint
                label="Engagement score"
                value={numberText(salesIntelligence.engagement_score)}
              />
              <DataPoint
                label="Behaviour"
                value={salesIntelligence.behaviour_temperature ? pretty(salesIntelligence.behaviour_temperature) : "Not available"}
              />
              <DataPoint
                label="Intent basis"
                value={salesIntelligence.intent_basis ? pretty(salesIntelligence.intent_basis) : "Not available"}
              />
              <DataPoint
                label="Payment state"
                value={salesIntelligence.payment_status ? pretty(salesIntelligence.payment_status) : "Not available"}
              />
            </div>

            {salesIntelligence.priority_reason ? (
              <div className="mt-3 rounded-lg bg-[#F4F7F5] px-3 py-2.5 text-[10px] leading-5 text-[#62746B]">
                <strong className="font-semibold text-[#40564C]">Why now:</strong>{" "}
                {salesIntelligence.priority_reason}
              </div>
            ) : null}

            {salesIntelligence.recommended_course_name ? (
              <div className="mt-3 rounded-lg border border-[#DCE8DF] bg-[#F8FBF9] px-3 py-2.5">
                <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#85928B]">
                  Course recommendation evidence
                </div>
                <div className="mt-1 text-[11px] font-semibold text-[#344E42]">
                  {salesIntelligence.recommended_course_name}
                  {salesIntelligence.recommended_course_code
                    ? ` · ${salesIntelligence.recommended_course_code}`
                    : ""}
                </div>
                <div className="mt-1 text-[10px] text-[#718078]">
                  Affinity {numberText(salesIntelligence.recommended_affinity_score)}
                  {salesIntelligence.recommendation_basis
                    ? ` · ${pretty(salesIntelligence.recommendation_basis)}`
                    : ""}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </Section>

      <Section title="Opportunity" eyebrow="Current CRM state">
        <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
          <DataPoint label="Course" value={lead.course || "Not selected"} />
          <DataPoint
            label="Preferred location"
            value={lead.preferredLocation || lead.location || "Not selected"}
            icon={<MapPin size={13} />}
          />
          <DataPoint
            label="Preferred month"
            value={lead.preferredMonth || "Not captured"}
            icon={<CalendarClock size={13} />}
          />
          <DataPoint label="Mode" value={lead.preferredMode || "Not captured"} />
          <DataPoint label="Owner" value={lead.owner || "Unassigned"} />
          <DataPoint label="Stored intent" value={pretty(lead.intent || "unknown")} />
        </div>
      </Section>

      <Section title="Contact" eyebrow="Reachability">
        <div className="space-y-3">
          <CompactRow icon={<Mail size={13} />} label="Email" value={lead.email || "Not captured"} />
          <CompactRow icon={<Phone size={13} />} label="Phone" value={lead.phone || "Not captured"} />
          <CompactRow
            icon={<MessageCircle size={13} />}
            label="Current channel"
            value={pretty(lead.currentContactChannel || "unknown")}
          />
          <CompactRow
            icon={<Clock3 size={13} />}
            label="Last contacted"
            value={formatDateTime(lead.lastContactedAt)}
          />
          <CompactRow
            icon={<CalendarClock size={13} />}
            label="Next follow-up"
            value={formatDateTime(salesIntelligence?.next_followup_at || lead.nextFollowupAt)}
          />
        </div>
      </Section>

      <Section title="Acquisition" eyebrow="Attribution context">
        <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
          <DataPoint
            label="First touch"
            value={pretty(lead.firstTouchSource || "unknown")}
            sub={lead.firstTouchCampaign || undefined}
          />
          <DataPoint label="First medium" value={pretty(lead.firstTouchMedium || "unknown")} />
          <DataPoint
            label="Last touch"
            value={pretty(lead.lastTouchSource || "unknown")}
            sub={lead.lastTouchCampaign || undefined}
          />
          <DataPoint label="Landing page" value={lead.landingPage || "Not captured"} />
          <DataPoint label="Lead origin" value={pretty(lead.leadOrigin || "unknown")} />
          <DataPoint label="Visitor location" value={visitorLocation || "Not captured"} />
        </div>
      </Section>

      <Section title="Revenue & payments" eyebrow="Recorded financial evidence">
        <div className="grid gap-3 sm:grid-cols-2">
          <MetricBox
            label="Potential value"
            value={
              potential != null && potentialCurrency
                ? formatMoney(potential, potentialCurrency)
                : "Not recorded"
            }
          />
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
                  <div className="text-[11px] font-semibold text-[#2C443B]">
                    {pretty(payment.paymentKind)} · {pretty(payment.status)}
                  </div>
                  <div className="mt-0.5 text-[10px] text-[#849188]">
                    {payment.provider || "Provider not recorded"} · {formatDateTime(payment.paidAt || payment.createdAt)}
                  </div>
                </div>
                <div className="text-[12px] font-semibold text-[#192E29]">
                  {formatMoney(payment.amount, payment.currency)}
                </div>
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
              <DataPoint
                label="Behaviour temperature"
                value={pretty(person.latest_lead_behaviour_temperature || "not available")}
              />
              <DataPoint
                label="Engagement score"
                value={
                  person.latest_lead_engagement_score == null
                    ? "Not available"
                    : String(person.latest_lead_engagement_score)
                }
              />
              <DataPoint label="Sessions · 30d" value={numberText(person.sessions_30d)} />
              <DataPoint label="Page views" value={numberText(person.page_view_count)} />
            </div>
            {person.latest_lead_behaviour_reason ? (
              <div className="mt-3 rounded-lg bg-[#F4F7F5] px-3 py-2.5 text-[10px] leading-5 text-[#62746B]">
                {person.latest_lead_behaviour_reason}
              </div>
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
    </div>
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
  const iconClass =
    focus.tone === "attention"
      ? "bg-amber-100 text-amber-700"
      : "bg-[#DDEFE3] text-[#216551]";

  return (
    <section className={`rounded-xl border p-4 ${toneClass}`}>
      <div className="flex items-start gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${iconClass}`}>
          <Sparkles size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[9px] font-bold uppercase tracking-[0.13em] text-[#74837A]">
            {focus.source === "canonical"
              ? "Canonical next best action"
              : "Suggested focus · current evidence"}
          </div>
          <div className="mt-1 text-[14px] font-semibold text-[#203B31]">{focus.action}</div>
          <div className="mt-1 text-[10px] leading-5 text-[#63756B]">{focus.detail}</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {focus.reasons.map((reason) => (
          <span
            key={reason}
            className="rounded-md border border-white/70 bg-white/70 px-2 py-1 text-[9px] font-medium text-[#607269]"
          >
            {reason}
          </span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-black/5 pt-3">
        <Link
          href={`/conversations?lead=${payload.lead.id}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#216551] px-3 text-[10px] font-semibold text-white hover:bg-[#174D3B]"
        >
          <Zap size={12} /> Act now
        </Link>
        <button
          type="button"
          onClick={onSchedule}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#CADBCF] bg-white px-3 text-[10px] font-semibold text-[#456158] hover:bg-[#F8FBF9]"
        >
          <CalendarClock size={12} /> Schedule follow-up
        </button>
        <span className="ml-auto text-[9px] text-[#849188]">
          {focus.source === "canonical"
            ? "Existing sales intelligence · no automatic write"
            : "Guidance only · no score or stage is changed automatically"}
        </span>
      </div>
    </section>
  );
}

function JourneyTab({ payload }: { payload: InspectorPayload }) {
  if (payload.availability.journey === "unavailable") {
    return (
      <EmptyState
        title="Journey unavailable"
        body="The canonical Person journey could not be loaded. The Inspector is not substituting inferred events."
      />
    );
  }
  if (!payload.journey.length) {
    return (
      <EmptyState
        title="No journey events yet"
        body="No canonical Person journey evidence is currently linked to this lead."
      />
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#8B988F]">
            Canonical customer journey
          </div>
          <div className="mt-1 text-sm font-semibold text-[#192E29]">
            {payload.journeyTotal.toLocaleString()} recorded events
          </div>
        </div>
        <span className="rounded-full bg-[#E9F4EC] px-2.5 py-1 text-[10px] font-semibold text-[#216551]">
          Newest first
        </span>
      </div>

      <div className="relative space-y-0 before:absolute before:bottom-3 before:left-[7px] before:top-3 before:w-px before:bg-[#DCE7DF]">
        {payload.journey.map((event) => (
          <div
            key={event.journey_event_key}
            className="relative grid grid-cols-[16px_minmax(0,1fr)] gap-3 pb-5 last:pb-0"
          >
            <span className="relative z-10 mt-1.5 h-[15px] w-[15px] rounded-full border-[4px] border-[#FBFCFB] bg-[#7AA88B]" />
            <div className="rounded-lg border border-[#E4EAE6] bg-white p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-[12px] font-semibold text-[#233C33]">{event.title}</div>
                  <div className="mt-0.5 text-[10px] text-[#85928B]">
                    {pretty(event.event_category)} · {pretty(event.event_type)}
                  </div>
                </div>
                <div className="text-[10px] font-medium text-[#85928B]">
                  {formatDateTime(event.event_at)}
                </div>
              </div>
              {event.summary ? (
                <div className="mt-2 text-[11px] leading-5 text-[#607068]">{event.summary}</div>
              ) : null}
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
    <div className="space-y-4">
      <Section title="Contact history" eyebrow="Structured admissions activity">
        {payload.contactSummary ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricBox label="Total" value={numberText(payload.contactSummary.total_contacts)} />
            <MetricBox label="Connected" value={numberText(payload.contactSummary.successful_contacts)} />
            <MetricBox label="No answer" value={numberText(payload.contactSummary.no_answer_contacts)} />
            <MetricBox label="Follow-up" value={numberText(payload.contactSummary.follow_up_needed_contacts)} />
          </div>
        ) : null}
        <AvailabilityNote
          availability={payload.availability.contactHistory}
          empty="No structured contact logs are stored yet."
          unavailable="Contact history could not be loaded. No empty-state assumption is being made."
        />
        {payload.contactLogs.length ? (
          <div className="mt-3 space-y-2.5">
            {payload.contactLogs.map((log) => (
              <div key={log.id} className="rounded-lg border border-[#E4EAE6] bg-white p-3.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <SmallTag>{pretty(log.method)}</SmallTag>
                  <SmallTag>{pretty(log.direction)}</SmallTag>
                  <SmallTag>{pretty(log.outcome)}</SmallTag>
                  <span className="ml-auto text-[10px] text-[#89968F]">
                    {formatDateTime(log.contacted_at)}
                  </span>
                </div>
                <div className="mt-2 text-[11px] leading-5 text-[#52665C]">{log.comment}</div>
                <div className="mt-2 text-[10px] text-[#89968F]">
                  Logged by {log.employee_name || "System"}
                  {log.call_duration_seconds ? ` · ${formatDuration(log.call_duration_seconds)}` : ""}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </Section>

      <Section title="Recent messages" eyebrow="Conversation activity">
        {!messages.length ? (
          <div className="text-[11px] leading-5 text-[#7D8C84]">
            No recent CRM messages are stored for this lead.
          </div>
        ) : null}
        <div className="space-y-2.5">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.direction === "outbound" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[88%] rounded-xl px-3.5 py-3 text-[11px] leading-5 ${
                  message.direction === "outbound"
                    ? "bg-[#216551] text-white"
                    : "border border-[#E4EAE6] bg-white text-[#52665C]"
                }`}
              >
                <div
                  className={`mb-1 text-[9px] font-semibold uppercase tracking-[0.08em] ${
                    message.direction === "outbound" ? "text-white/65" : "text-[#8B988F]"
                  }`}
                >
                  {message.sender} · {pretty(message.channel)}
                </div>
                <div>{message.body}</div>
                <div
                  className={`mt-1 text-right text-[9px] ${
                    message.direction === "outbound" ? "text-white/60" : "text-[#8B988F]"
                  }`}
                >
                  {formatDateTime(message.timestamp)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[#E4EAE6] bg-white p-4">
      <div className="text-[9px] font-bold uppercase tracking-[0.13em] text-[#8B988F]">{eyebrow}</div>
      <h3 className="mt-1 text-[13px] font-semibold text-[#233C33]">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function DataPoint({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#8A978F]">
        {icon}
        {label}
      </div>
      <div className="mt-1 break-words text-[11px] font-semibold text-[#344E42]">{value}</div>
      {sub ? <div className="mt-0.5 break-words text-[10px] text-[#87948D]">{sub}</div> : null}
    </div>
  );
}

function CompactRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="grid grid-cols-[20px_120px_minmax(0,1fr)] items-start gap-2 border-b border-[#EFF2F0] pb-3 last:border-0 last:pb-0">
      <span className="mt-0.5 text-[#7C9487]">{icon}</span>
      <span className="text-[10px] font-medium text-[#829087]">{label}</span>
      <span className="break-words text-right text-[11px] font-medium text-[#344E42]">{value}</span>
    </div>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[#F4F7F5] px-3 py-3">
      <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#8A978F]">{label}</div>
      <div className="mt-1.5 break-words text-[13px] font-semibold text-[#233C33]">{value}</div>
    </div>
  );
}

function TextBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#8A978F]">{label}</div>
      <div className="mt-1.5 whitespace-pre-wrap text-[11px] leading-5 text-[#586C62]">{value}</div>
    </div>
  );
}

function AvailabilityNote({
  availability,
  empty,
  unavailable,
}: {
  availability: Availability;
  empty: string;
  unavailable: string;
}) {
  if (availability === "available") return null;
  return (
    <div
      className={`mt-3 rounded-lg px-3 py-2 text-[10px] leading-5 ${
        availability === "unavailable"
          ? "border border-amber-200 bg-amber-50 text-amber-800"
          : "bg-[#F5F7F6] text-[#77877E]"
      }`}
    >
      {availability === "unavailable" ? unavailable : empty}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[#DCE5DF] bg-white px-5 py-10 text-center">
      <Route size={20} className="mx-auto text-[#9BAB9F]" />
      <div className="mt-3 text-[12px] font-semibold text-[#344E42]">{title}</div>
      <div className="mx-auto mt-1 max-w-sm text-[10px] leading-5 text-[#829087]">{body}</div>
    </div>
  );
}

function InspectorLoading() {
  return (
    <div className="grid min-h-[280px] place-items-center">
      <div className="text-center">
        <Loader2 size={22} className="mx-auto animate-spin text-[#216551]" />
        <div className="mt-3 text-[11px] font-medium text-[#718078]">Loading verified CRM context…</div>
      </div>
    </div>
  );
}

function InspectorError({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-[11px] leading-5 text-red-700">
      <div className="flex gap-2">
        <AlertCircle size={15} className="mt-0.5 shrink-0" />
        <div>
          <strong className="font-semibold">Unable to load Lead Inspector.</strong>
          <div className="mt-1">{message}</div>
        </div>
      </div>
    </div>
  );
}

function QuickDue({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-[#DDE7DF] bg-white px-2 py-1 text-[9px] font-semibold text-[#61736A] transition hover:border-[#AAC7B4] hover:text-[#216551]"
    >
      {label}
    </button>
  );
}

function StatePill({ value }: { value: string }) {
  return (
    <span className="rounded-full bg-[#E9F4EC] px-2.5 py-1 text-[9px] font-semibold text-[#216551]">
      {pretty(value)}
    </span>
  );
}

function SmallTag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-md bg-[#F0F5F1] px-2 py-1 text-[9px] font-semibold text-[#62786C]">
      {children}
    </span>
  );
}

function buildLeadFocus(payload: InspectorPayload): LeadFocus {
  const { lead, person, salesIntelligence } = payload;
  const now = Date.now();

  if (salesIntelligence?.next_best_action) {
    const reasons: string[] = [];
    if (salesIntelligence.priority_band) {
      const score = salesIntelligence.priority_score == null
        ? ""
        : ` · ${numberText(salesIntelligence.priority_score)}`;
      reasons.push(`${pretty(salesIntelligence.priority_band)} priority${score}`);
    }
    if (salesIntelligence.derived_intent) {
      reasons.push(
        `${pretty(salesIntelligence.derived_intent)} intent${
          salesIntelligence.intent_confidence
            ? ` · ${pretty(salesIntelligence.intent_confidence)} confidence`
            : ""
        }`,
      );
    }
    if (salesIntelligence.behaviour_temperature) {
      reasons.push(`${pretty(salesIntelligence.behaviour_temperature)} behaviour`);
    }
    if (salesIntelligence.payment_status) {
      reasons.push(`Payment: ${pretty(salesIntelligence.payment_status)}`);
    }
    if (salesIntelligence.is_reengaged) reasons.push("Re-engaged");
    if (salesIntelligence.recommended_course_name) {
      reasons.push(`Affinity: ${salesIntelligence.recommended_course_name}`);
    }

    const priority = String(salesIntelligence.priority_band || "").toLowerCase();
    const derivedIntent = String(salesIntelligence.derived_intent || "").toLowerCase();
    const tone: FocusTone =
      priority === "critical" || priority === "high" || lead.stage === "payment_pending"
        ? "attention"
        : derivedIntent === "high" || derivedIntent === "very_high" || salesIntelligence.is_reengaged
          ? "opportunity"
          : "neutral";

    return {
      action: salesIntelligence.next_best_action,
      detail:
        salesIntelligence.priority_reason ||
        "This is the next action returned by the existing canonical lead sales-intelligence model.",
      tone,
      reasons: reasons.slice(0, 4),
      source: "canonical",
    };
  }

  const reasons: string[] = [];
  const dueAt = lead.nextFollowupAt ? Date.parse(lead.nextFollowupAt) : Number.NaN;
  const latest = latestMessage(lead.lastMessages ?? []);
  const temperature = person?.latest_lead_behaviour_temperature;

  if (Number.isFinite(dueAt)) {
    reasons.push(
      dueAt < now
        ? `Follow-up ${formatDelta(dueAt, now)} overdue`
        : `Follow-up in ${formatDelta(now, dueAt)}`,
    );
  } else {
    reasons.push("No follow-up scheduled");
  }

  if (temperature) reasons.push(`${pretty(temperature)} behaviour`);
  if (lead.owner) reasons.push(`Owner: ${lead.owner}`);
  else reasons.push("Unassigned");
  if (payload.journeyTotal > 0) reasons.push(`${payload.journeyTotal} journey events`);

  if (Number.isFinite(dueAt) && dueAt < now) {
    return {
      action: "Follow up now",
      detail: "The scheduled next action is past due. Re-open the conversation or set a new committed follow-up time.",
      tone: "attention",
      reasons: reasons.slice(0, 4),
      source: "presentation",
    };
  }

  if (latest?.direction === "inbound") {
    return {
      action: "Reply to the latest inbound message",
      detail: "The most recent stored CRM message came from the lead, so the clearest next action is to continue that conversation.",
      tone: "opportunity",
      reasons: reasons.slice(0, 4),
      source: "presentation",
    };
  }

  if (lead.stage === "payment_pending") {
    return {
      action: "Resolve the pending payment",
      detail: "This opportunity is already in the payment stage. Confirm the blocker, payment path, or a specific follow-up time.",
      tone: "attention",
      reasons: reasons.slice(0, 4),
      source: "presentation",
    };
  }

  if (!lead.owner) {
    return {
      action: "Assign clear ownership",
      detail: "The lead is currently unassigned. Ownership should be clear before the next admissions action is missed.",
      tone: "attention",
      reasons: reasons.slice(0, 4),
      source: "presentation",
    };
  }

  if (lead.stage === "new" && !lead.lastContactedAt) {
    return {
      action: "Make first contact",
      detail: "No previous contact time is recorded for this new lead. Start the conversation and capture the outcome.",
      tone: "opportunity",
      reasons: reasons.slice(0, 4),
      source: "presentation",
    };
  }

  if (lead.stage === "qualified" || lead.stage === "high_intent") {
    return {
      action: "Move the conversation toward enrollment",
      detail: "The lead is already in an advanced admissions stage. Clarify the remaining decision, batch, or payment step.",
      tone: "opportunity",
      reasons: reasons.slice(0, 4),
      source: "presentation",
    };
  }

  return {
    action: "Continue the active conversation",
    detail: "Use the current CRM stage, journey evidence, and conversation context to decide the next human action.",
    tone: "neutral",
    reasons: reasons.slice(0, 4),
    source: "presentation",
  };
}

function defaultFollowupTitle(payload: InspectorPayload, focus: LeadFocus) {
  const name = payload.lead.name || payload.lead.leadCode || "lead";
  const actionCode = payload.salesIntelligence?.next_action_code;
  if (actionCode?.includes("payment") || focus.action === "Resolve the pending payment") {
    return `Check payment with ${name}`;
  }
  if (actionCode?.includes("first") || focus.action === "Make first contact") {
    return `Contact ${name}`;
  }
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
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: String(currency).toUpperCase(),
      maximumFractionDigits: 0,
    }).format(number);
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
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function initials(value: string) {
  return (
    value
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "L"
  );
}

function formatDateTime(value?: string | null) {
  if (!value) return "Not recorded";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Not recorded";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes <= 0) return `${remainder}s`;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}
