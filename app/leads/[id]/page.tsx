import Link from "next/link";

import { notFound } from "next/navigation";

import {
  ArrowLeft,
  CalendarClock,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  Globe2,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquarePlus,
  Pencil,
  Phone,
  Send,
  UserRound,
} from "lucide-react";

import {
  createFollowUpAction,
  logLeadContactAction,
  recordPaymentAction,
  updateLeadStageAction,
} from "@/app/actions/crm";

import { PaymentCard } from "@/components/payment-card";
import { Person360SummaryCard } from "@/components/person-360-summary";
import { LeadJourneyIntelligence } from "@/components/lead-journey-intelligence";
import { PersonJourneyTimeline } from "@/components/person-journey-timeline";
import { PaidMediaAcquisition } from "@/components/paid-media-acquisition";

import {
  ChannelBadge,
  IntentLabel,
  PageHeader,
  StageBadge,
} from "@/components/ui";

import { getLead, getLeadPayments, isMockMode } from "@/lib/data";

import { createClient } from "@/lib/supabase/server";

import { formatDateTime } from "@/lib/format";
import { getPersonJourneyForLead } from "@/lib/person-journey-data";
import type { Channel, LeadStage } from "@/types/crm";

const stages: Array<[LeadStage, string]> = [
  ["new", "New"],

  ["contacted", "Contacted"],

  ["engaged", "Engaged"],

  ["qualified", "Qualified"],

  ["high_intent", "High Intent"],

  ["payment_pending", "Payment Pending"],

  ["enrolled", "Enrolled"],

  ["nurture", "Nurture"],

  ["not_now", "Not Now"],

  ["lost", "Lost"],

  ["unqualified", "Unqualified"],

  ["duplicate", "Duplicate"],
];

const channels: Array<[Channel, string]> = [
  ["instagram", "Instagram"],

  ["whatsapp", "WhatsApp"],

  ["website", "Website"],

  ["email", "Email"],

  ["phone", "Phone"],

  ["meta_lead_form", "Meta Lead Form"],

  ["other", "Other"],
];

const contactMethods = [
  ["whatsapp", "WhatsApp"],

  ["sms", "SMS / Text"],

  ["phone", "Phone call"],

  ["email", "Email"],

  ["instagram", "Instagram"],

  ["other", "Other"],
] as const;

const contactOutcomes = [
  ["attempted", "Attempted"],

  ["sent", "Sent"],

  ["connected", "Connected"],

  ["replied", "Replied"],

  ["no_answer", "No answer"],

  ["left_message", "Left message"],

  ["follow_up_needed", "Follow-up needed"],

  ["other", "Other"],
] as const;

type ContactLogRow = {
  id: string;

  employee_name?: string | null;

  method: string;

  direction: string;

  outcome: string;

  contacted_at: string;

  comment: string;

  call_duration_seconds?: number | null;

  source?: string | null;
};

type ContactSummaryRow = {
  total_contacts?: number | null;

  successful_contacts?: number | null;

  no_answer_contacts?: number | null;

  follow_up_needed_contacts?: number | null;
};

export default async function LeadDetailPage({
  params,

  searchParams,
}: {
  params: Promise<{ id: string }>;

  searchParams: Promise<{
    notice?: string;

    error?: string;
  }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);

  const supabase = await createClient();

  const [
    lead,
    payments,
    contactLogsResult,
    contactSummaryResult,
    personJourney,
  ] = await Promise.all([
    getLead(id),

    getLeadPayments(id),

    supabase

      .from("v_lead_contact_logs")

      .select(
        "id, employee_name, method, direction, outcome, contacted_at, comment, call_duration_seconds, source",
      )

      .eq(
        "lead_id",

        id,
      )

      .order(
        "contacted_at",

        {
          ascending: false,
        },
      )

      .limit(50),

    supabase

      .from("v_lead_contact_summary")

      .select(
        "total_contacts, successful_contacts, no_answer_contacts, follow_up_needed_contacts",
      )

      .eq("lead_id", id)
      .maybeSingle(),

    getPersonJourneyForLead(id, {
      limit: 200,
    }),
  ]);

  if (!lead) {
    notFound();
  }

  const contactLogs = (contactLogsResult.data ?? []) as ContactLogRow[];

  const contactSummary = (contactSummaryResult.data ??
    null) as ContactSummaryRow | null;

  const contactLogsError =
    contactLogsResult.error?.message ??
    contactSummaryResult.error?.message ??
    null;

  const stageAction = updateLeadStageAction.bind(
    null,

    id,
  );

  const followUpAction = createFollowUpAction.bind(
    null,

    id,
  );

  const contactAction = logLeadContactAction.bind(
    null,

    id,
  );

  const paymentAction = recordPaymentAction.bind(
    null,

    id,
  );

  const mock = isMockMode();

  const defaultContactMethod = contactMethods.some(
    ([value]) => value === lead.currentContactChannel,
  )
    ? lead.currentContactChannel
    : "whatsapp";

  const defaultContactedAt = istDateTimeLocal(new Date());

  const visitorLocation =
    [lead.geoCity, lead.geoRegion, lead.geoCountry]

      .filter(Boolean)

      .join(", ") || "—";


  return (
    <>
      <Link
        href="/leads"
        className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-brand"
      >
        <ArrowLeft size={15} />
        Back to leads
      </Link>

      <PageHeader
        title={lead.name}
        description={`${lead.leadCode} · ${lead.country} · ${lead.course}`}
        actions={
          <>
            <Link href={`/leads/${id}/edit`} className="btn-secondary">
              <Pencil size={16} />
              Edit lead
            </Link>

            <Link href={`/conversations?lead=${id}`} className="btn-primary">
              <MessageCircle size={16} />
              Open conversation
            </Link>
          </>
        }
      />

      {query.error && (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {query.error}
        </div>
      )}

      {query.notice && (
        <div
          className={`mb-4 rounded-xl border px-4 py-3 text-sm font-medium ${
            query.notice.startsWith("mock-")
              ? "border-orange-100 bg-orange-50 text-orange-700"
              : "border-emerald-100 bg-emerald-50 text-emerald-700"
          }`}
        >
          {noticeText(query.notice)}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <StageBadge stage={lead.stage} />

        <IntentLabel intent={lead.intent} />

        <ChannelBadge channel={lead.currentContactChannel} />

        {mock && (
          <span className="inline-flex rounded-lg bg-orange-50 px-2 py-1 text-[11px] font-semibold text-orange-700">
            Mock mode
          </span>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {/* =================================================







              LEAD INTELLIGENCE







          ================================================= */}

          <div className="card-pad">
            <div className="eyebrow">Lead intelligence</div>

            <div className="section-title mt-1">Overview</div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Info
                icon={<MapPin size={16} />}
                label="Preferred location"
                value={lead.location}
              />

              <Info
                icon={<CalendarClock size={16} />}
                label="Preferred month"
                value={lead.preferredMonth ?? "—"}
              />

              <Info
                icon={<UserRound size={16} />}
                label="Mode"
                value={lead.preferredMode ?? "—"}
              />

              <Info
                icon={<CircleDollarSign size={16} />}
                label="Potential value"
                value={
                  lead.potentialValue != null && lead.potentialCurrency
                    ? formatMoney(
                        lead.potentialValue,

                        lead.potentialCurrency,
                      )
                    : lead.value != null && lead.currency
                      ? formatMoney(
                          lead.value,

                          lead.currency,
                        )
                      : "—"
                }
              />
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Info
                icon={<Globe2 size={16} />}
                label="Visitor location"
                value={visitorLocation}
              />

              <Info
                icon={<Clock3 size={16} />}
                label="Visitor timezone"
                value={lead.geoTimezone ?? "—"}
              />

              <Info
                icon={<Send size={16} />}
                label="Lead origin"
                value={prettyOptional(lead.leadOrigin)}
              />

              <Info
                icon={<ExternalLink size={16} />}
                label="Landing page"
                value={lead.landingPage ?? "—"}
              />
            </div>

            <div className="mt-5 grid gap-4 border-t border-slate-100 pt-5 md:grid-cols-2">
              <div>
                <div className="text-xs font-bold uppercase tracking-[.12em] text-slate-400">
                  AI/CRM summary
                </div>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {lead.summary}
                </p>
              </div>

              <div>
                <div className="text-xs font-bold uppercase tracking-[.12em] text-slate-400">
                  Internal notes
                </div>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {lead.notes}
                </p>
              </div>
            </div>
          </div>

          {/* =================================================
              CANONICAL PERSON 360
          ================================================= */}
          <Person360SummaryCard person={personJourney.person} />

          {/* =================================================
              CANONICAL CUSTOMER JOURNEY
          ================================================= */}
          <PersonJourneyTimeline
            events={personJourney.journey}
            total={personJourney.journeyTotal}
          />

          {/* =================================================
              WEBSITE JOURNEY INTELLIGENCE
          ================================================= */}
          <LeadJourneyIntelligence leadId={id} />

          {/* =================================================

              PAID MEDIA ACQUISITION

          ================================================= */}

          <PaidMediaAcquisition leadId={id} />

          {/* =================================================



              PAYMENT MODULE



          ================================================= */}

          <PaymentCard
            potentialValue={lead.potentialValue ?? lead.value}
            potentialCurrency={lead.potentialCurrency ?? lead.currency}
            payments={payments}
            action={paymentAction}
          />

          {/* =================================================



              CONTACT HISTORY



          ================================================= */}

          <div className="card-pad">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="eyebrow">Admissions activity</div>

                <div className="section-title mt-1">Contact history</div>
              </div>

              <span className="text-xs font-semibold text-slate-400">
                {contactSummary?.total_contacts ?? contactLogs.length} logged
                contacts
              </span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                label="Total contacts"
                value={Number(
                  contactSummary?.total_contacts ?? contactLogs.length,
                )}
              />

              <Metric
                label="Connected / replied"
                value={Number(contactSummary?.successful_contacts ?? 0)}
              />

              <Metric
                label="No answer"
                value={Number(contactSummary?.no_answer_contacts ?? 0)}
              />

              <Metric
                label="Follow-up needed"
                value={Number(contactSummary?.follow_up_needed_contacts ?? 0)}
              />
            </div>

            {contactLogsError && (
              <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                Unable to load contact history: {contactLogsError}
              </div>
            )}

            {!contactLogsError && contactLogs.length === 0 && (
              <div className="mt-5 rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
                No structured contacts logged yet.
              </div>
            )}

            <div className="mt-5 space-y-3">
              {contactLogs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex rounded-lg border px-2.5 py-1 text-[11px] font-bold ${contactMethodClass(
                            log.method,
                          )}`}
                        >
                          {contactMethodLabel(log.method)}
                        </span>

                        <span className="inline-flex rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold capitalize text-slate-600">
                          {log.direction}
                        </span>

                        <span
                          className={`inline-flex rounded-lg px-2.5 py-1 text-[11px] font-bold ${contactOutcomeClass(
                            log.outcome,
                          )}`}
                        >
                          {contactOutcomeLabel(log.outcome)}
                        </span>
                      </div>

                      <div className="mt-3 text-sm leading-6 text-slate-700">
                        {log.comment}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                        <span>
                          Logged by{" "}
                          <strong className="font-semibold text-slate-600">
                            {log.employee_name || "System"}
                          </strong>
                        </span>

                        {log.call_duration_seconds != null &&
                          log.call_duration_seconds > 0 && (
                            <span>
                              Duration{" "}
                              <strong className="font-semibold text-slate-600">
                                {formatContactDuration(
                                  log.call_duration_seconds,
                                )}
                              </strong>
                            </span>
                          )}
                      </div>
                    </div>

                    <div className="shrink-0 text-xs font-medium text-slate-400">
                      {formatDateTime(log.contacted_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* =================================================







              RECENT INTERACTIONS







          ================================================= */}

          <div className="card-pad">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="eyebrow">Conversation</div>

                <div className="section-title mt-1">Recent interactions</div>
              </div>

              <Link
                href={`/conversations?lead=${id}`}
                className="text-xs font-semibold text-brand"
              >
                Open inbox →
              </Link>
            </div>

            <div className="mt-5 space-y-3">
              {lead.lastMessages.length === 0 && (
                <div className="text-sm text-slate-400">
                  No message interactions stored yet. WhatsApp and other CRM
                  conversations will appear here.
                </div>
              )}

              {lead.lastMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${
                    msg.direction === "outbound"
                      ? "justify-end"
                      : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[82%] rounded-2xl px-4 py-3 ${
                      msg.direction === "outbound"
                        ? "bg-brand text-white"
                        : "border border-slate-200 bg-slate-50 text-slate-700"
                    }`}
                  >
                    <div
                      className={`mb-1 text-[11px] font-semibold ${
                        msg.direction === "outbound"
                          ? "text-white/65"
                          : "text-slate-400"
                      }`}
                    >
                      {msg.sender} · {msg.channel}
                    </div>

                    <div className="text-sm leading-6">{msg.body}</div>

                    <div
                      className={`mt-1 text-right text-[10px] ${
                        msg.direction === "outbound"
                          ? "text-white/55"
                          : "text-slate-400"
                      }`}
                    >
                      {formatDateTime(msg.timestamp)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ===================================================







            RIGHT SIDEBAR







        =================================================== */}

        <aside className="space-y-4">
          <div className="card-pad">
            <div className="eyebrow">Attribution</div>

            <div className="section-title mt-1">Acquisition path</div>

            <div className="mt-5 space-y-4">
              <KeyValue
                label="First touch"
                value={lead.firstTouchSource}
                sub={lead.firstTouchCampaign}
              />

              <KeyValue
                label="First touch medium"
                value={lead.firstTouchMedium}
              />

              <KeyValue
                label="Last touch"
                value={lead.lastTouchSource}
                sub={lead.lastTouchCampaign}
              />

              <KeyValue
                label="Last touch medium"
                value={lead.lastTouchMedium}
              />

              <KeyValue
                label="Lead created via"
                value={lead.leadCreationChannel}
              />

              <KeyValue
                label="Current channel"
                value={lead.currentContactChannel}
              />
            </div>
          </div>

          <div className="card-pad">
            <div className="eyebrow">Contact</div>

            <div className="section-title mt-1">Contact details</div>

            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="flex items-center gap-2">
                <Mail size={15} className="text-slate-400" />

                {lead.email ?? "Email not captured"}
              </div>

              <div className="flex items-center gap-2">
                <Phone size={15} className="text-slate-400" />

                {lead.phone ?? "Phone not captured"}
              </div>

              <div className="flex items-center gap-2">
                <Clock3 size={15} className="text-slate-400" />
                Last contact: {formatDateTime(lead.lastContactedAt)}
              </div>
            </div>
          </div>

          <div className="card-pad">
            <div className="eyebrow">Admissions activity</div>

            <div className="section-title mt-1">Log contact</div>

            <p className="mt-2 text-xs leading-5 text-slate-400">
              Record calls, texts, email, WhatsApp or Instagram contact made by
              the admissions team. Employee, outcome and time are stored for
              audit and conversion intelligence.
            </p>

            <form action={contactAction} className="mt-4 space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className="field-label">Method</span>

                  <select
                    className="input"
                    name="contact_method"
                    defaultValue={defaultContactMethod}
                  >
                    {contactMethods.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="field-label">Direction</span>

                  <select
                    className="input"
                    name="contact_direction"
                    defaultValue="outbound"
                  >
                    <option value="outbound">Outbound</option>

                    <option value="inbound">Inbound</option>
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="field-label">Outcome</span>

                <select
                  className="input"
                  name="contact_outcome"
                  defaultValue="attempted"
                >
                  {contactOutcomes.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className="field-label">Contacted at · IST</span>

                  <input
                    className="input"
                    name="contacted_at"
                    type="datetime-local"
                    defaultValue={defaultContactedAt}
                    required
                  />
                </label>

                <label className="block">
                  <span className="field-label">Call duration · minutes</span>

                  <input
                    className="input"
                    name="call_duration_minutes"
                    type="number"
                    min="0"
                    max="480"
                    step="1"
                    placeholder="Optional"
                  />
                </label>
              </div>

              <label className="block">
                <span className="field-label">Comment</span>

                <textarea
                  className="input min-h-28 resize-y"
                  name="contact_comment"
                  maxLength={4000}
                  required
                  placeholder="What happened, what the lead asked, and the next useful context…"
                />
              </label>

              <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-500">
                WhatsApp messages sent inside this CRM already have their own
                message history. Automatic syncing into this structured contact
                log is next, so do not double-log the same CRM WhatsApp message.
              </div>

              <button className="btn-primary w-full" type="submit">
                <MessageSquarePlus size={15} />
                Log contact
              </button>
            </form>
          </div>

          <div className="card-pad">
            <div className="eyebrow">Funnel</div>

            <div className="section-title mt-1">Change stage</div>

            <form action={stageAction} className="mt-4 space-y-3">
              <select className="input" name="stage" defaultValue={lead.stage}>
                {stages.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>

              <input
                className="input"
                name="reason"
                placeholder="Reason / context (optional)"
              />

              <button className="btn-secondary w-full" type="submit">
                Update stage
              </button>
            </form>
          </div>

          <div className="card-pad">
            <div className="eyebrow">Next action</div>

            <div className="section-title mt-1">Schedule follow-up</div>

            <form action={followUpAction} className="mt-4 space-y-3">
              <input
                className="input"
                name="title"
                required
                placeholder="e.g. Check deposit payment"
              />

              <input
                className="input"
                name="due_at"
                type="datetime-local"
                required
              />

              <textarea
                className="input min-h-20 resize-y"
                name="description"
                placeholder="Optional note"
              />

              <button className="btn-primary w-full" type="submit">
                <CalendarClock size={15} />
                Create follow-up
              </button>
            </form>

            {lead.nextFollowupAt && (
              <div className="mt-3 text-xs text-slate-400">
                Current next follow-up: {formatDateTime(lead.nextFollowupAt)}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-brand p-5 text-white shadow-card">
            <div className="text-xs font-bold uppercase tracking-[.14em] text-white/60">
              Agent layer later
            </div>

            <div className="mt-2 text-lg font-bold">Human-controlled first</div>

            <p className="mt-2 text-sm leading-6 text-white/70">
              Claude will later recommend the next action and draft replies
              here, while these CRM controls remain the source of truth.
            </p>

            <Link
              href="/follow-ups"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-sm font-bold text-brand"
            >
              View task queue
              <ExternalLink size={14} />
            </Link>
          </div>
        </aside>
      </div>
    </>
  );
}

function noticeText(notice: string) {
  const messages: Record<string, string> = {
    updated: "Lead updated.",

    "stage-updated": "Funnel stage updated and recorded in stage history.",

    "followup-created": "Follow-up scheduled.",

    "interaction-logged":
      "Interaction logged. Contact timestamps, conversation history and funnel assistance were updated.",

    "contact-logged":
      "Contact logged successfully. Employee, method, outcome and time were recorded.",

    "payment-recorded": "Payment recorded successfully.",

    "mock-update": "Mock mode: changes were not persisted.",

    "mock-stage": "Mock mode: stage change was not persisted.",

    "mock-followup": "Mock mode: follow-up was not persisted.",

    "mock-interaction": "Mock mode: interaction was not persisted.",

    "mock-contact-logged": "Mock mode: contact was not persisted.",

    "mock-payment": "Mock mode: payment was not persisted.",
  };

  return messages[notice] ?? notice;
}

function Info({
  icon,

  label,

  value,
}: {
  icon: React.ReactNode;

  label: string;

  value: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
        {icon}

        {label}
      </div>

      <div className="mt-2 break-words text-sm font-bold text-slate-800">
        {value}
      </div>
    </div>
  );
}

function Metric({
  label,

  value,
}: {
  label: string;

  value: number;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <div className="text-xs font-semibold text-slate-400">{label}</div>

      <div className="mt-2 text-xl font-bold text-slate-800">{value}</div>
    </div>
  );
}

function KeyValue({
  label,

  value,

  sub,
}: {
  label: string;

  value?: string;

  sub?: string;
}) {
  const renderedValue = value
    ? value.replaceAll(
        "_",

        " ",
      )
    : "—";

  return (
    <div>
      <div className="text-xs font-semibold text-slate-400">{label}</div>

      <div className="mt-1 text-sm font-bold capitalize text-slate-800">
        {renderedValue}
      </div>

      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function prettyOptional(value?: string) {
  if (!value) {
    return "—";
  }

  return value

    .replaceAll("_", " ")

    .replace(
      /\b\w/g,

      (letter) => letter.toUpperCase(),
    );
}

function contactMethodLabel(value: string) {
  return (
    contactMethods.find(([method]) => method === value)?.[1] ??
    value.replaceAll(
      "_",

      " ",
    )
  );
}

function contactOutcomeLabel(value: string) {
  return (
    contactOutcomes.find(([outcome]) => outcome === value)?.[1] ??
    value.replaceAll(
      "_",

      " ",
    )
  );
}

function contactMethodClass(value: string) {
  if (value === "whatsapp") {
    return "border-emerald-100 bg-emerald-50 text-emerald-700";
  }

  if (value === "instagram") {
    return "border-pink-100 bg-pink-50 text-pink-700";
  }

  if (value === "email") {
    return "border-sky-100 bg-sky-50 text-sky-700";
  }

  if (value === "phone" || value === "sms") {
    return "border-amber-100 bg-amber-50 text-amber-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-600";
}

function contactOutcomeClass(value: string) {
  if (value === "connected" || value === "replied") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (value === "no_answer" || value === "left_message") {
    return "bg-amber-50 text-amber-700";
  }

  if (value === "follow_up_needed") {
    return "bg-orange-50 text-orange-700";
  }

  return "bg-slate-100 text-slate-600";
}

function formatContactDuration(seconds: number) {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);

  const remainingSeconds = seconds % 60;

  return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

function istDateTimeLocal(date: Date) {
  const parts = new Intl.DateTimeFormat(
    "en-CA",

    {
      timeZone: "Asia/Kolkata",

      year: "numeric",

      month: "2-digit",

      day: "2-digit",

      hour: "2-digit",

      minute: "2-digit",

      hourCycle: "h23",
    },
  ).formatToParts(date);

  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function formatMoney(
  value: number,

  currency: string,
) {
  const code = currency.toUpperCase();

  try {
    return new Intl.NumberFormat(
      code === "INR" ? "en-IN" : "en-US",

      {
        style: "currency",

        currency: code,

        maximumFractionDigits: 0,
      },
    ).format(value);
  } catch {
    return `${code} ${value}`;
  }
}
