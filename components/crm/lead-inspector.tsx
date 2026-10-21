"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Route,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type InspectorTab = "overview" | "journey" | "activity";
type Availability = "available" | "empty" | "unavailable";

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
  availability: {
    payments: Availability;
    person360: Availability;
    journey: Availability;
    contactHistory: Availability;
  };
  warnings: string[];
};

type ApiResponse =
  | { ok: true; data: InspectorPayload }
  | { ok: false; error: string };

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

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!leadId) {
      setPayload(null);
      setError(null);
      setLoading(false);
      return;
    }

    setTab("overview");
    setPayload(null);
    setError(null);
    setLoading(true);

    const controller = new AbortController();
    void fetch(`/api/leads/${encodeURIComponent(leadId)}/inspector`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as ApiResponse;
        if (!response.ok || !body.ok) {
          throw new Error(body.ok ? "Unable to load lead." : body.error);
        }
        setPayload(body.data);
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "Unable to load lead.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [leadId]);

  useEffect(() => {
    if (!leadId) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [leadId, onClose]);

  if (!mounted || !leadId) return null;

  return createPortal(
    <div className="fixed inset-0 z-[140] flex justify-end" role="dialog" aria-modal="true" aria-label="Lead Inspector">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close Lead Inspector"
        className="absolute inset-0 bg-slate-950/20"
      />

      <aside className="relative flex h-full w-full flex-col border-l border-[#DDE7DF] bg-[#FBFCFB] shadow-[-18px_0_50px_rgba(19,46,38,0.14)] sm:max-w-[590px]">
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
              <Link href={`/leads/${payload.lead.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#216551] px-3 text-[11px] font-semibold text-white transition hover:bg-[#174D3B]">
                Open profile <ArrowRight size={12} />
              </Link>
              <Link href={`/conversations?lead=${payload.lead.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#DDE7DF] bg-white px-3 text-[11px] font-semibold text-[#456158] transition hover:bg-[#F0F7F3]">
                <MessageCircle size={12} /> Conversation
              </Link>
              <Link href={`/leads/${payload.lead.id}/edit`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#DDE7DF] bg-white px-3 text-[11px] font-semibold text-[#456158] transition hover:bg-[#F0F7F3]">
                Edit lead
              </Link>
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
                  tab === value ? "text-[#216551]" : "text-[#7A8981] hover:text-[#40594F]"
                }`}
              >
                <Icon size={13} /> {label}
                {tab === value ? <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[#216551]" /> : null}
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

              {tab === "overview" ? <OverviewTab payload={payload} /> : null}
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
        className={className || "inline-flex h-8 items-center gap-1.5 rounded-md border border-[#DDE7DF] bg-white px-2.5 text-[11px] font-semibold text-[#456158] transition hover:bg-[#F0F7F3] hover:text-[#216551]"}
      >
        {label} <ExternalLink size={11} />
      </button>
      <LeadInspector leadId={open ? leadId : null} onClose={() => setOpen(false)} />
    </>
  );
}

function OverviewTab({ payload }: { payload: InspectorPayload }) {
  const { lead, person, payments } = payload;
  const recordedPaid = useMemo(() => sumPaidByCurrency(payments), [payments]);
  const potential = lead.potentialValue ?? lead.value;
  const potentialCurrency = lead.potentialCurrency ?? lead.currency;
  const visitorLocation = [lead.geoCity, lead.geoRegion, lead.geoCountry]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-4">
      <Section title="Opportunity" eyebrow="Current CRM state">
        <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
          <DataPoint label="Course" value={lead.course || "Not selected"} />
          <DataPoint label="Preferred location" value={lead.preferredLocation || lead.location || "Not selected"} icon={<MapPin size={13} />} />
          <DataPoint label="Preferred month" value={lead.preferredMonth || "Not captured"} icon={<CalendarClock size={13} />} />
          <DataPoint label="Mode" value={lead.preferredMode || "Not captured"} />
          <DataPoint label="Owner" value={lead.owner || "Unassigned"} />
          <DataPoint label="Intent" value={pretty(lead.intent || "unknown")} />
        </div>
      </Section>

      <Section title="Contact" eyebrow="Reachability">
        <div className="space-y-3">
          <CompactRow icon={<Mail size={13} />} label="Email" value={lead.email || "Not captured"} />
          <CompactRow icon={<Phone size={13} />} label="Phone" value={lead.phone || "Not captured"} />
          <CompactRow icon={<MessageCircle size={13} />} label="Current channel" value={pretty(lead.currentContactChannel || "unknown")} />
          <CompactRow icon={<Clock3 size={13} />} label="Last contacted" value={formatDateTime(lead.lastContactedAt)} />
          <CompactRow icon={<CalendarClock size={13} />} label="Next follow-up" value={formatDateTime(lead.nextFollowupAt)} />
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
        <AvailabilityNote availability={payload.availability.payments} empty="No payment records are stored for this lead." unavailable="Payment history could not be loaded. No zero value is assumed." />
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
        <AvailabilityNote availability={payload.availability.person360} empty="This lead is not yet linked to a Person 360 record." unavailable="Person 360 intelligence is temporarily unavailable." />
        {person ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetricBox label="Sessions" value={numberText(person.session_count)} />
              <MetricBox label="Touchpoints" value={numberText(person.touchpoint_count)} />
              <MetricBox label="Messages" value={numberText(person.message_count)} />
              <MetricBox label="Enrollments" value={numberText(person.enrollment_count)} />
            </div>
            <div className="mt-3 grid gap-x-5 gap-y-4 sm:grid-cols-2">
              <DataPoint label="Behaviour temperature" value={pretty(person.latest_lead_behaviour_temperature || "not available")} />
              <DataPoint label="Engagement score" value={person.latest_lead_engagement_score == null ? "Not available" : String(person.latest_lead_engagement_score)} />
              <DataPoint label="Sessions · 30d" value={numberText(person.sessions_30d)} />
              <DataPoint label="Page views" value={numberText(person.page_view_count)} />
            </div>
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

function JourneyTab({ payload }: { payload: InspectorPayload }) {
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
            <span className="relative z-10 mt-1.5 h-[15px] w-[15px] rounded-full border-[4px] border-[#FBFCFB] bg-[#7AA88B]" />
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
        <AvailabilityNote availability={payload.availability.contactHistory} empty="No structured contact logs are stored yet." unavailable="Contact history could not be loaded. No empty-state assumption is being made." />
        {payload.contactLogs.length ? (
          <div className="mt-3 space-y-2.5">
            {payload.contactLogs.map((log) => (
              <div key={log.id} className="rounded-lg border border-[#E4EAE6] bg-white p-3.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <SmallTag>{pretty(log.method)}</SmallTag>
                  <SmallTag>{pretty(log.direction)}</SmallTag>
                  <SmallTag>{pretty(log.outcome)}</SmallTag>
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
    </div>
  );
}

function Section({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[#E4EAE6] bg-white p-4">
      <div className="text-[9px] font-bold uppercase tracking-[0.13em] text-[#8B988F]">{eyebrow}</div>
      <h3 className="mt-1 text-[13px] font-semibold text-[#233C33]">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function DataPoint({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#8A978F]">{icon}{label}</div>
      <div className="mt-1 break-words text-[11px] font-semibold text-[#344E42]">{value}</div>
      {sub ? <div className="mt-0.5 break-words text-[10px] text-[#87948D]">{sub}</div> : null}
    </div>
  );
}

function CompactRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
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

function AvailabilityNote({ availability, empty, unavailable }: { availability: Availability; empty: string; unavailable: string }) {
  if (availability === "available") return null;
  return (
    <div className={`mt-3 rounded-lg px-3 py-2 text-[10px] leading-5 ${availability === "unavailable" ? "border border-amber-200 bg-amber-50 text-amber-800" : "bg-[#F5F7F6] text-[#77877E]"}`}>
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
      <div className="flex gap-2"><AlertCircle size={15} className="mt-0.5 shrink-0" /><div><strong className="font-semibold">Unable to load Lead Inspector.</strong><div className="mt-1">{message}</div></div></div>
    </div>
  );
}

function StatePill({ value }: { value: string }) {
  return <span className="rounded-full bg-[#E9F4EC] px-2.5 py-1 text-[9px] font-semibold text-[#216551]">{pretty(value)}</span>;
}

function SmallTag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md bg-[#F0F5F1] px-2 py-1 text-[9px] font-semibold text-[#62786C]">{children}</span>;
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
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
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
