import type { ReactNode } from "react";

import Link from "next/link";

import {
  ArrowUpRight,
  BookOpen,
  CalendarClock,
  ContactRound,
  Instagram,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Save,
} from "lucide-react";

import { ConversationReadMarker } from "@/components/conversation-read-marker";

import { logLeadInteractionAction } from "@/app/actions/crm";

import {
  sendWhatsAppMessageAction,
  sendWhatsAppTemplateAction,
  updateConversationLeadContextAction,
} from "@/app/conversations/actions";

import { ConversationThread } from "@/components/conversation-thread";

import { ConversationsSidebar } from "@/components/conversations-sidebar";

import { WhatsAppComposer } from "@/components/conversation-composer";

import { PageHeader, StageBadge } from "@/components/ui";

import { getCourses, isMockMode } from "@/lib/data";

import { getConversationsWorkspace } from "@/lib/conversations-data";

import { formatDateTime } from "@/lib/format";

import type { Channel } from "@/types/crm";

import { WhatsAppTemplateComposer } from "@/components/whatsapp-template-composer";

import { getApprovedWhatsAppTemplates } from "@/lib/whatsapp-templates";

import { ConversationsRealtime } from "@/components/conversations-realtime";

const channels: Array<[Channel, string]> = [
  ["instagram", "Instagram"],

  ["whatsapp", "WhatsApp"],

  ["website", "Website"],

  ["email", "Email"],

  ["phone", "Phone"],

  ["meta_lead_form", "Meta Lead Form"],

  ["other", "Other"],
];

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    lead?: string;

    notice?: string;

    error?: string;

    wamid?: string;
  }>;
}) {
  const query = await searchParams;

  const [workspace, courses] = await Promise.all([
    getConversationsWorkspace(query.lead),

    getCourses(),
  ]);

  const { conversationSummary, selectedId, selected, whatsappWindow, metrics } =
    workspace;

  const canStartWhatsApp =
    Boolean(selected?.phone) && selected?.currentContactChannel !== "whatsapp";

  const interactionAction = selectedId
    ? logLeadInteractionAction.bind(null, selectedId)
    : undefined;

  const whatsappAction = selectedId
    ? sendWhatsAppMessageAction.bind(null, selectedId)
    : undefined;

  const whatsappTemplateAction = selectedId
    ? sendWhatsAppTemplateAction.bind(null, selectedId)
    : undefined;

  const leadContextAction = selectedId
    ? updateConversationLeadContextAction.bind(null, selectedId)
    : undefined;

  const mock = isMockMode();

  const noticeText =
    query.notice === "whatsapp-sent"
      ? "WhatsApp message sent and logged in the CRM."
      : query.notice === "whatsapp-template-sent"
        ? "WhatsApp template sent successfully."
        : query.notice === "whatsapp-started"
          ? "WhatsApp conversation started from the lead’s submitted phone number."
          : query.notice === "lead-context-updated"
            ? "Lead course and country updated."
            : query.notice
              ? "Interaction logged."
              : null;

  const shouldLoadWhatsAppTemplates = Boolean(
    selected && (canStartWhatsApp || (whatsappWindow && !whatsappWindow.open)),
  );

  const whatsappTemplateCatalog = shouldLoadWhatsAppTemplates
    ? await getApprovedWhatsAppTemplates()
    : {
        templates: [],

        error: null,
      };

  const whatsappCount = metrics.whatsappCount;

  const highIntentCount = metrics.highIntentCount;

  return (
    <div className="conversations-polish">
      <ConversationsRealtime />

      <PageHeader
        eyebrow="Unified inbox"
        title="Conversations"
        description="Handle WhatsApp, Instagram and CRM conversations from one admissions workspace."
        actions={
          <span
            className={`







              rounded-xl







              px-3







              py-2







              text-xs







              font-bold







              ${
                mock
                  ? "bg-orange-50 text-orange-700"
                  : "bg-emerald-50 text-emerald-700"
              }







            `}
          >
            {mock ? "Mock inbox" : "Live messaging"}
          </span>
        }
      />

      {/* ===================================================







          INBOX METRICS







      =================================================== */}

      <div className="conversation-metrics mb-4 grid gap-3 sm:grid-cols-3">
        <InboxMetric
          label="Active conversations"
          value={metrics.activeConversations}
        />

        <InboxMetric label="WhatsApp" value={whatsappCount} />

        <InboxMetric label="High intent + payment" value={highIntentCount} />
      </div>

      {/* ===================================================







          NOTICES







      =================================================== */}

      {query.error && (
        <div className="mb-4 animate-rise rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {query.error}
        </div>
      )}

      {noticeText && (
        <div className="mb-4 animate-rise rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {noticeText}
        </div>
      )}

      {/* ===================================================







          CONVERSATION WORKSPACE















          Desktop:







          - fixed viewport height







          - contacts scroll independently







          - messages scroll independently







          - context scrolls independently







      =================================================== */}

      <div
        className="







          conversation-workspace







          grid







          overflow-hidden







          rounded-2xl







          border







          border-slate-200







          bg-white







          shadow-card















          lg:h-[calc(100dvh-270px)]







          lg:min-h-[560px]







          lg:grid-cols-[320px_minmax(0,1fr)_300px]







        "
      >
        {/* ===============================================







            LEFT — CONVERSATION LIST







        =============================================== */}

        <div
          className="







            conversation-list-pane







            min-h-0







            overflow-y-auto







            overscroll-contain







            border-r







            border-slate-200







            bg-slate-50/40







          "
        >
          <ConversationsSidebar
            leads={conversationSummary}
            selectedId={selectedId}
          />
        </div>

        {!selected ? (
          <section className="col-span-2 grid min-h-[560px] place-items-center p-8 text-center">
            <div>
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand/10 text-brand">
                <MessageCircle size={23} />
              </div>

              <div className="mt-4 text-lg font-bold text-slate-800">
                No conversation selected
              </div>

              <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
                Incoming WhatsApp messages and CRM interactions will appear
                here.
              </p>

              <Link href="/leads" className="btn-primary mt-4">
                Open leads
              </Link>
            </div>
          </section>
        ) : (
          <>
            {/* ===========================================







                CENTER — CHAT







            =========================================== */}

            <section
              className="







                conversation-chat-pane







                flex







                min-h-0







                min-w-0







                flex-col







                overflow-hidden







                bg-white







              "
            >
              <ConversationReadMarker leadId={selected.id} />

              {/* CHAT HEADER */}

              <div
                className="







                  conversation-chat-header







                  shrink-0







                  border-b







                  border-slate-100







                  bg-white







                  px-4







                  py-3







                "
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand/10 text-xs font-semibold text-brand">
                      {initials(selected.name)}
                    </div>

                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">
                        {selected.name}
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <ChannelBadge
                          channel={selected.currentContactChannel}
                        />

                        <StageBadge stage={selected.stage} />

                        <ContextBadge tone="course">
                          <BookOpen size={11} />

                          {selected.course || "Course not selected"}
                        </ContextBadge>

                        <ContextBadge tone="country">
                          <MapPin size={11} />

                          {selected.country || "Country not set"}
                        </ContextBadge>
                      </div>
                    </div>
                  </div>

                  <Link
                    href={`/leads/${selected.id}`}
                    className="btn-secondary !px-3 !py-2"
                  >
                    Lead profile
                    <ArrowUpRight size={13} />
                  </Link>
                </div>
              </div>

              {/* WHATSAPP WINDOW STATUS */}

              {whatsappWindow && (
                <div
                  className={`







                    shrink-0







                    border-b







                    px-4







                    py-2







                    text-[10px]







                    font-semibold















                    ${
                      whatsappWindow.open
                        ? "border-emerald-100 bg-emerald-50/70 text-emerald-700"
                        : "border-amber-100 bg-amber-50/70 text-amber-700"
                    }







                  `}
                >
                  {whatsappWindow.label}
                </div>
              )}

              {canStartWhatsApp && (
                <div className="border-b border-sky-100 bg-sky-50/70 px-4 py-2 text-[10px] font-semibold text-sky-700">
                  Website/form lead · phone number available · start WhatsApp
                  using an approved template.
                </div>
              )}

              {/* MESSAGE HISTORY */}

              <div
                className="







                  conversation-message-area







                  min-h-0







                  flex-1







                  overflow-y-auto







                  overscroll-contain







                  px-4







                  py-5







                  sm:px-6







                "
              >
                <ConversationThread
                  messages={selected.lastMessages}
                  originChannel={selected.leadCreationChannel}
                  originTimestamp={selected.createdAt}
                  originCourse={selected.course}
                  originDetail={
                    selected.leadCreationChannel === "website"
                      ? "Form enquiry received and added to the CRM."
                      : undefined
                  }
                />
              </div>

              {/* COMPOSER */}

              <div className="shrink-0">
                {selected.currentContactChannel === "whatsapp" ? (
                  whatsappWindow?.open && whatsappAction ? (
                    <WhatsAppComposer
                      action={whatsappAction}
                      windowOpen
                      windowLabel={whatsappWindow.label}
                    />
                  ) : whatsappTemplateAction ? (
                    <WhatsAppTemplateComposer
                      action={whatsappTemplateAction}
                      templates={whatsappTemplateCatalog.templates}
                      loadError={whatsappTemplateCatalog.error}
                      windowLabel={
                        whatsappWindow?.label ??
                        "Use an approved WhatsApp template to continue the conversation."
                      }
                      mode="followup"
                      phone={selected.phone}
                    />
                  ) : null
                ) : canStartWhatsApp && whatsappTemplateAction ? (
                  <WhatsAppTemplateComposer
                    action={whatsappTemplateAction}
                    templates={whatsappTemplateCatalog.templates}
                    loadError={whatsappTemplateCatalog.error}
                    mode="start"
                    phone={selected.phone}
                  />
                ) : interactionAction ? (
                  <form
                    action={interactionAction}
                    className="border-t border-slate-100 bg-white p-4"
                  >
                    <div className="grid gap-2 sm:grid-cols-[125px_145px_minmax(0,1fr)_auto]">
                      <select
                        className="input"
                        name="direction"
                        defaultValue="outbound"
                      >
                        <option value="outbound">Outbound</option>

                        <option value="inbound">Inbound</option>
                      </select>

                      <select
                        className="input"
                        name="channel"
                        defaultValue={selected.currentContactChannel}
                      >
                        {channels.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>

                      <input
                        className="input"
                        name="body"
                        required
                        placeholder="Log a message, email or call note..."
                      />

                      <button className="btn-primary" type="submit">
                        Log
                      </button>
                    </div>

                    <div className="mt-2 text-[10px] font-semibold text-slate-400">
                      Non-WhatsApp channels are logged manually for now.
                    </div>
                  </form>
                ) : null}
              </div>
            </section>

            {/* ===========================================







                RIGHT — LEAD CONTEXT







            =========================================== */}

            <aside
              className="







                conversation-context-pane







                hidden







                min-h-0







                overflow-y-auto







                overscroll-contain







                border-l







                border-slate-200







                bg-slate-50/55







                p-4







                lg:block







              "
            >
              <div>
                <div className="eyebrow">Lead context</div>

                <div className="mt-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">
                      {selected.name}
                    </div>

                    <div className="mt-1 text-[10px] font-semibold text-slate-400">
                      Update the important admissions details without leaving
                      the conversation.
                    </div>
                  </div>

                  <StageBadge stage={selected.stage} />
                </div>
              </div>

              {/* QUICK EDIT */}

              {leadContextAction && (
                <div className="conversation-context-card mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">
                    Quick edit
                  </div>

                  <div className="mt-1 text-sm font-semibold text-slate-800">
                    Admissions details
                  </div>

                  <form action={leadContextAction} className="mt-4 space-y-4">
                    <label className="block">
                      <span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.1em] text-sky-700">
                        <BookOpen size={12} />
                        Course
                      </span>

                      <select
                        className="input"
                        name="course_id"
                        defaultValue={selected.interestedCourseId ?? ""}
                      >
                        <option value="">Not selected</option>

                        {courses.map((course) => (
                          <option key={course.id} value={course.id}>
                            {course.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.1em] text-violet-700">
                        <MapPin size={12} />
                        Country
                      </span>

                      <input
                        className="input"
                        name="country"
                        defaultValue={selected.country || ""}
                        placeholder="e.g. Germany"
                      />
                    </label>

                    <button
                      className="btn-primary flex w-full items-center justify-center gap-2"
                      type="submit"
                    >
                      <Save size={14} />
                      Save details
                    </button>
                  </form>
                </div>
              )}

              {/* CURRENT DETAILS */}

              <div className="mt-5 space-y-3">
                <ContextRow
                  label="Course"
                  value={selected.course || "Not selected"}
                  tone="blue"
                />

                <ContextRow
                  label="Country"
                  value={selected.country || "Not set"}
                  tone="violet"
                />

                <ContextRow
                  label="Current channel"
                  value={selected.currentContactChannel.replaceAll(
                    "_",

                    " ",
                  )}
                  tone={
                    selected.currentContactChannel === "whatsapp"
                      ? "green"
                      : selected.currentContactChannel === "instagram"
                        ? "pink"
                        : "slate"
                  }
                />

                <ContextRow
                  label="Last contacted"
                  value={
                    selected.lastContactedAt
                      ? formatDateTime(selected.lastContactedAt)
                      : "Not contacted"
                  }
                  tone="amber"
                />
              </div>

              {/* QUICK ACTIONS */}

              <div className="conversation-quick-actions mt-5 border-t border-slate-200 pt-4">
                <div className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">
                  Quick actions
                </div>

                <div className="mt-3 space-y-2">
                  <Link
                    href={`/leads/${selected.id}`}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 transition duration-150 hover:-translate-y-0.5 hover:border-brand/20 hover:shadow-sm"
                  >
                    Open full lead
                    <ArrowUpRight size={13} />
                  </Link>

                  <Link
                    href="/follow-ups"
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 transition duration-150 hover:-translate-y-0.5 hover:border-brand/20 hover:shadow-sm"
                  >
                    Follow-up queue
                    <CalendarClock size={13} />
                  </Link>
                </div>
              </div>

              {/* AI PLACEHOLDER */}

              <div className="conversation-ai-note mt-5 rounded-2xl border border-brand/10 bg-brand/[0.045] p-4">
                <div className="text-[10px] font-bold uppercase tracking-[.12em] text-brand/60">
                  AI layer next
                </div>

                <div className="mt-2 text-sm font-semibold text-slate-800">
                  Reply suggestions
                </div>

                <p className="mt-1 text-[11px] leading-5 text-slate-500">
                  AI qualification, conversation summaries, next-best action and
                  suggested replies will appear here after the messaging
                  workspace is finalized.
                </p>
              </div>
            </aside>
          </>
        )}
      </div>
    </div>
  );
}

/* =========================================================







   METRIC







\========================================================= */

function InboxMetric({
  label,

  value,
}: {
  label: string;

  value: number;
}) {
  return (
    <div className="conversation-metric card flex items-center justify-between px-4 py-3.5 animate-rise">
      <div className="text-xs font-semibold text-slate-500">{label}</div>

      <div className="text-lg font-semibold tracking-tight text-slate-900">
        {value.toLocaleString()}
      </div>
    </div>
  );
}

/* =========================================================







   CONTEXT ROW







\========================================================= */

function ContextRow({
  label,

  value,

  tone = "slate",
}: {
  label: string;

  value: string;

  tone?: "blue" | "violet" | "green" | "pink" | "amber" | "slate";
}) {
  const tones = {
    blue: "border-sky-100 bg-sky-50/70 text-sky-800",

    violet: "border-violet-100 bg-violet-50/70 text-violet-800",

    green: "border-emerald-100 bg-emerald-50/70 text-emerald-800",

    pink: "border-pink-100 bg-pink-50/70 text-pink-800",

    amber: "border-amber-100 bg-amber-50/70 text-amber-800",

    slate: "border-slate-100 bg-white text-slate-700",
  };

  return (
    <div
      className={`







        conversation-context-row







        rounded-xl







        border







        p-3







        ${tones[tone]}







      `}
    >
      <div className="text-[9px] font-bold uppercase tracking-[.12em] opacity-60">
        {label}
      </div>

      <div className="mt-1.5 break-words text-xs font-bold capitalize">
        {value}
      </div>
    </div>
  );
}

/* =========================================================







   HEADER CONTEXT BADGE







\========================================================= */

function ContextBadge({
  tone,

  children,
}: {
  tone: "course" | "country";

  children: ReactNode;
}) {
  const className =
    tone === "course"
      ? "border-sky-100 bg-sky-50 text-sky-700"
      : "border-violet-100 bg-violet-50 text-violet-700";

  return (
    <span
      className={`







        inline-flex







        items-center







        gap-1







        rounded-full







        border







        px-2







        py-1







        text-[9px]







        font-bold







        ${className}







      `}
    >
      {children}
    </span>
  );
}

/* =========================================================







   CHANNEL BADGE







\========================================================= */

function ChannelBadge({ channel }: { channel: string }) {
  const classes =
    channel === "whatsapp"
      ? "border-emerald-100 bg-emerald-50 text-emerald-700"
      : channel === "instagram"
        ? "border-pink-100 bg-pink-50 text-pink-700"
        : channel === "email"
          ? "border-sky-100 bg-sky-50 text-sky-700"
          : channel === "phone"
            ? "border-amber-100 bg-amber-50 text-amber-700"
            : channel === "website"
              ? "border-indigo-100 bg-indigo-50 text-indigo-700"
              : "border-slate-200 bg-slate-50 text-slate-600";

  return (
    <span
      className={`







        inline-flex







        items-center







        gap-1







        rounded-full







        border







        px-2







        py-1







        text-[9px]







        font-bold







        capitalize







        ${classes}







      `}
    >
      <ChannelIcon channel={channel} />

      {channel.replaceAll(
        "_",

        " ",
      )}
    </span>
  );
}

/* =========================================================







   CHANNEL ICON







\========================================================= */

function ChannelIcon({ channel }: { channel: string }) {
  if (channel === "instagram") {
    return <Instagram size={11} />;
  }

  if (channel === "whatsapp") {
    return <MessageCircle size={11} />;
  }

  if (channel === "email") {
    return <Mail size={11} />;
  }

  if (channel === "phone") {
    return <Phone size={11} />;
  }

  return <ContactRound size={11} />;
}

/* =========================================================







   INITIALS







\========================================================= */

function initials(name: string) {
  return (
    name

      .split(" ")

      .filter(Boolean)

      .map((part) => Array.from(part)[0] ?? "")

      .slice(0, 2)

      .join("")

      .toLocaleUpperCase("en-IN") || "?"
  );
}
