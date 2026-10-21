import Link from "next/link";
import {
  ArrowUpRight,
  CalendarClock,
  ChevronDown,
  MessageCircle,
  Save,
} from "lucide-react";

import { logLeadInteractionAction } from "@/app/actions/crm";
import {
  sendWhatsAppMessageAction,
  sendWhatsAppTemplateAction,
  updateConversationLeadContextAction,
} from "@/app/conversations/actions";
import { ConversationCopilot } from "@/components/conversation-copilot";
import { WhatsAppComposer } from "@/components/conversation-composer";
import { ConversationIntelligencePanel } from "@/components/conversation-intelligence-panel";
import { ConversationReadMarker } from "@/components/conversation-read-marker";
import { ConversationThread } from "@/components/conversation-thread";
import { ConversationWorkspaceShell } from "@/components/conversation-workspace-shell";
import { ConversationsRealtime } from "@/components/conversations-realtime";
import { ConversationsSidebar } from "@/components/conversations-sidebar";
import { StageBadge } from "@/components/ui";
import { WhatsAppTemplateComposer } from "@/components/whatsapp-template-composer";
import { getConversationsWorkspace } from "@/lib/conversations-data";
import { getCourses, isMockMode } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { getCurrentWorkspaceContext } from "@/lib/workspace";
import { getApprovedWhatsAppTemplates } from "@/lib/whatsapp-templates";
import type { Channel } from "@/types/crm";

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
  const mock = isMockMode();

  const [workspace, courses, workspaceContext] = await Promise.all([
    getConversationsWorkspace(query.lead),
    getCourses(),
    mock ? Promise.resolve(null) : getCurrentWorkspaceContext(),
  ]);

  const { conversationSummary, selectedId, selected, whatsappWindow } = workspace;
  const selectedSummary = selectedId
    ? conversationSummary.find((lead) => lead.id === selectedId) ?? null
    : null;
  const organizationId = workspaceContext?.activeOrganizationId ?? null;
  const canStartWhatsApp =
    Boolean(selected?.phone) && selected?.currentContactChannel !== "whatsapp";

  const attentionCount = conversationSummary.filter(
    (lead) => lead.needsReply || lead.needsFirstContact,
  ).length;
  const unreadCount = conversationSummary.filter((lead) => lead.unread).length;
  const priorityCount = conversationSummary.filter(
    (lead) => lead.priority === "urgent" || lead.priority === "high",
  ).length;

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

  const noticeText =
    query.notice === "whatsapp-sent"
      ? "WhatsApp message sent."
      : query.notice === "whatsapp-template-sent"
        ? "WhatsApp template sent."
        : query.notice === "whatsapp-started"
          ? "WhatsApp conversation started."
          : query.notice === "lead-context-updated"
            ? "Lead details updated."
            : query.notice
              ? "Interaction logged."
              : null;

  const shouldLoadWhatsAppTemplates = Boolean(
    selected && (canStartWhatsApp || (whatsappWindow && !whatsappWindow.open)),
  );

  const whatsappTemplateCatalog =
    shouldLoadWhatsAppTemplates && !mock
      ? organizationId
        ? await getApprovedWhatsAppTemplates(organizationId)
        : {
            templates: [],
            error: "Unable to resolve the active workspace for WhatsApp templates.",
          }
      : { templates: [], error: null };

  const copilotChannel =
    selected?.currentContactChannel === "whatsapp" ||
    selected?.currentContactChannel === "instagram"
      ? selected.currentContactChannel
      : null;

  const copilotEnabled =
    copilotChannel === "instagram" ||
    (copilotChannel === "whatsapp" && Boolean(whatsappWindow?.open));

  const inbox = (
    <ConversationsSidebar leads={conversationSummary} selectedId={selectedId} />
  );

  const chat = !selected ? (
    <section className="grid h-full min-h-[560px] place-items-center bg-white p-8 text-center dark:bg-slate-950">
      <div>
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-[#E8F2EB] text-[#5E8770] dark:bg-slate-900">
          <MessageCircle size={20} />
        </div>
        <div className="mt-4 text-sm font-semibold text-[#263D35] dark:text-slate-100">
          Select a conversation
        </div>
        <p className="mt-1 max-w-sm text-xs leading-5 text-[#87948D]">
          See what needs attention, reply with context, and plan the next human action without leaving the inbox.
        </p>
      </div>
    </section>
  ) : (
    <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-white dark:bg-slate-950">
      <ConversationReadMarker leadId={selected.id} />

      <div className="shrink-0 border-b border-[#E8EEEA] bg-white px-4 py-3 pr-32 dark:border-slate-900 dark:bg-slate-950">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#E4F2E8] text-[10px] font-bold text-[#216551] dark:bg-slate-900 dark:text-slate-200">
            {initials(selected.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="truncate text-[13px] font-semibold text-[#192E29] dark:text-white">
                {selected.name}
              </div>
              {selectedSummary?.needsReply ? (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[8px] font-semibold text-amber-700">
                  Needs reply
                </span>
              ) : selectedSummary?.needsFirstContact ? (
                <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[8px] font-semibold text-sky-700">
                  First contact
                </span>
              ) : null}
              {selectedSummary?.priority === "urgent" || selectedSummary?.priority === "high" ? (
                <span className="rounded-full bg-[#E9F4EC] px-2 py-0.5 text-[8px] font-semibold capitalize text-[#216551]">
                  {selectedSummary.priority} priority
                </span>
              ) : null}
            </div>
            <div className="mt-1 flex items-center gap-2 text-[10px] text-[#89968F]">
              <span className="capitalize">
                {selected.currentContactChannel.replaceAll("_", " ")}
              </span>
              <span>·</span>
              <span className="truncate">{selected.course || "Course not selected"}</span>
              {selected.country ? (
                <>
                  <span>·</span>
                  <span>{selected.country}</span>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
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

      <div className="shrink-0 border-t border-[#E8EEEA] bg-white dark:border-slate-900 dark:bg-slate-950">
        {selected.currentContactChannel === "whatsapp" &&
        whatsappWindow &&
        !whatsappWindow.open ? (
          <div className="border-b border-amber-100 bg-amber-50 px-4 py-2.5 dark:border-amber-900/40 dark:bg-amber-950/15">
            <div className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
              Reply window closed
            </div>
            <div className="mt-0.5 text-[10px] text-amber-700/80 dark:text-amber-400">
              Choose an approved template to continue this conversation.
            </div>
          </div>
        ) : null}

        {canStartWhatsApp ? (
          <div className="border-b border-sky-100 bg-sky-50 px-4 py-2.5 dark:border-sky-900/40 dark:bg-sky-950/15">
            <div className="text-[11px] font-semibold text-sky-800 dark:text-sky-300">
              Start WhatsApp
            </div>
            <div className="mt-0.5 text-[10px] text-sky-700/80 dark:text-sky-400">
              Use an approved template to begin messaging this submitted phone number.
            </div>
          </div>
        ) : null}

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
                "Choose an approved template to continue."
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
          <form action={interactionAction} className="p-3">
            <div className="grid gap-2 sm:grid-cols-[110px_130px_minmax(0,1fr)_auto]">
              <select className="input" name="direction" defaultValue="outbound">
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
          </form>
        ) : null}
      </div>
    </section>
  );

  const context = selected ? (
    <div className="conversation-context-pane p-3.5">
      <div className="flex items-start justify-between gap-3 px-0.5">
        <div className="min-w-0">
          <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#87978E]">
            Customer context
          </div>
          <div className="mt-1 truncate text-sm font-semibold text-[#203B31] dark:text-white">
            {selected.name}
          </div>
        </div>
        <StageBadge stage={selected.stage} />
      </div>

      <div className="mt-3">
        <ConversationIntelligencePanel
          leadId={selected.id}
          stage={selected.stage}
          priority={selectedSummary?.priority ?? "normal"}
          needsReply={Boolean(selectedSummary?.needsReply)}
          needsFirstContact={Boolean(selectedSummary?.needsFirstContact)}
          waitingSince={selectedSummary?.waitingSince ?? null}
        />
      </div>

      {copilotChannel ? (
        <div className="mt-3">
          <ConversationCopilot
            leadId={selected.id}
            channel={copilotChannel}
            enabled={copilotEnabled}
            disabledReason={
              copilotChannel === "whatsapp" && !whatsappWindow?.open
                ? "The WhatsApp service window is closed. Use an approved template instead of a free-text draft."
                : undefined
            }
          />
        </div>
      ) : null}

      <section className="mt-3 rounded-xl border border-[#E4EAE6] bg-white px-3.5 py-2 dark:border-slate-800 dark:bg-slate-950">
        <div className="space-y-0 divide-y divide-[#EEF2EF] dark:divide-slate-800">
          <ContextLine label="Course" value={selected.course || "Not selected"} />
          <ContextLine label="Country" value={selected.country || "Not set"} />
          <ContextLine
            label="Channel"
            value={selected.currentContactChannel.replaceAll("_", " ")}
          />
          <ContextLine
            label="Last contacted"
            value={
              selected.lastContactedAt
                ? formatDateTime(selected.lastContactedAt)
                : "Not contacted"
            }
          />
        </div>
      </section>

      {leadContextAction ? (
        <details className="group mt-3 rounded-xl border border-[#E4EAE6] bg-white dark:border-slate-800 dark:bg-slate-950">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3 text-[11px] font-semibold text-[#4D6258] dark:text-slate-200">
            Edit lead details
            <ChevronDown
              size={14}
              className="text-[#89968F] transition group-open:rotate-180"
            />
          </summary>
          <form
            action={leadContextAction}
            className="space-y-3 border-t border-[#EEF2EF] p-3 dark:border-slate-900"
          >
            <label className="block">
              <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.08em] text-[#89968F]">
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
              <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.08em] text-[#89968F]">
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
              <Save size={13} /> Save details
            </button>
          </form>
        </details>
      ) : null}

      <div className="mt-3 grid gap-2">
        <Link
          href={`/leads/${selected.id}`}
          className="flex items-center justify-between rounded-lg border border-[#E4EAE6] bg-white px-3 py-2.5 text-[10px] font-semibold text-[#52665C] transition hover:bg-[#F5F8F6] hover:text-[#216551] dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
        >
          Open lead profile <ArrowUpRight size={13} />
        </Link>
        <Link
          href="/follow-ups"
          className="flex items-center justify-between rounded-lg border border-[#E4EAE6] bg-white px-3 py-2.5 text-[10px] font-semibold text-[#52665C] transition hover:bg-[#F5F8F6] hover:text-[#216551] dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
        >
          Follow-up queue <CalendarClock size={13} />
        </Link>
      </div>
    </div>
  ) : null;

  return (
    <div className="conversations-polish space-y-4">
      <ConversationsRealtime />

      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#87998E]">
            Inbox · Admissions Operations
          </div>
          <h1 className="mt-1.5 text-[29px] font-semibold tracking-[-0.04em] text-[#192E29] dark:text-white">
            Conversations
          </h1>
          <p className="mt-1 text-[13px] leading-5 text-[#6D7C76]">
            Prioritize the right reply, understand the lead, and move every conversation toward a clear next step.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <InboxMetric label="Needs reply" value={attentionCount} attention={attentionCount > 0} />
          <InboxMetric label="Unread" value={unreadCount} attention={unreadCount > 0} />
          <InboxMetric label="Priority" value={priorityCount} attention={priorityCount > 0} />
          <span
            className={`rounded-lg px-2.5 py-2 text-[9px] font-semibold ${
              mock
                ? "bg-orange-50 text-orange-700"
                : "bg-[#E9F4EC] text-[#216551]"
            }`}
          >
            {mock ? "Mock inbox" : "Live messaging"}
          </span>
        </div>
      </section>

      {query.error ? (
        <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-xs font-medium text-red-700 dark:border-red-900/40 dark:bg-red-950/15 dark:text-red-300">
          {query.error}
        </div>
      ) : null}
      {noticeText ? (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-xs font-medium text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/15 dark:text-emerald-300">
          {noticeText}
        </div>
      ) : null}

      <ConversationWorkspaceShell
        inbox={inbox}
        chat={chat}
        context={context}
        hasConversation={Boolean(selected)}
      />
    </div>
  );
}

function InboxMetric({
  label,
  value,
  attention,
}: {
  label: string;
  value: number;
  attention?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-2.5 py-1.5 ${
        attention
          ? "border-[#D6E6DB] bg-[#F2F8F4]"
          : "border-[#E4EAE6] bg-white"
      }`}
    >
      <div className="text-[8px] font-semibold uppercase tracking-[0.08em] text-[#89968F]">
        {label}
      </div>
      <div className={`mt-0.5 text-[12px] font-semibold ${attention ? "text-[#216551]" : "text-[#40564C]"}`}>
        {value.toLocaleString("en-IN")}
      </div>
    </div>
  );
}

function ContextLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="text-[10px] text-[#89968F]">{label}</span>
      <span className="max-w-[170px] text-right text-[11px] font-medium capitalize text-[#40564C] dark:text-slate-200">
        {value}
      </span>
    </div>
  );
}

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
