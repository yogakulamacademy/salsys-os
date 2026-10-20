import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  CalendarClock,
  ChevronDown,
  ContactRound,
  Instagram,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
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
import { ConversationReadMarker } from "@/components/conversation-read-marker";
import { ConversationThread } from "@/components/conversation-thread";
import { ConversationWorkspaceShell } from "@/components/conversation-workspace-shell";
import { ConversationsRealtime } from "@/components/conversations-realtime";
import { ConversationsSidebar } from "@/components/conversations-sidebar";
import { PageHeader, StageBadge } from "@/components/ui";
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
  const organizationId = workspaceContext?.activeOrganizationId ?? null;
  const canStartWhatsApp = Boolean(selected?.phone) && selected?.currentContactChannel !== "whatsapp";

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
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-900">
          <MessageCircle size={20} />
        </div>
        <div className="mt-4 text-sm font-semibold text-slate-800 dark:text-slate-100">Select a conversation</div>
        <p className="mt-1 max-w-sm text-xs leading-5 text-slate-400">
          Read messages, reply, and review lead context without leaving the inbox.
        </p>
      </div>
    </section>
  ) : (
    <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-white dark:bg-slate-950">
      <ConversationReadMarker leadId={selected.id} />

      <div className="shrink-0 border-b border-slate-100 bg-white px-4 py-3 pr-32 dark:border-slate-900 dark:bg-slate-950">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-violet-100 text-[10px] font-bold text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
            {initials(selected.name)}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-slate-950 dark:text-white">{selected.name}</div>
            <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-400">
              <span className="capitalize">{selected.currentContactChannel.replaceAll("_", " ")}</span>
              <span>·</span>
              <span className="truncate">{selected.course || "Course not selected"}</span>
              {selected.country ? <><span>·</span><span>{selected.country}</span></> : null}
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

      <div className="shrink-0 border-t border-slate-100 bg-white dark:border-slate-900 dark:bg-slate-950">
        {selected.currentContactChannel === "whatsapp" && whatsappWindow && !whatsappWindow.open ? (
          <div className="border-b border-amber-100 bg-amber-50 px-4 py-2.5 dark:border-amber-900/40 dark:bg-amber-950/15">
            <div className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">Reply window closed</div>
            <div className="mt-0.5 text-[10px] text-amber-700/80 dark:text-amber-400">Choose an approved template to continue this conversation.</div>
          </div>
        ) : null}

        {canStartWhatsApp ? (
          <div className="border-b border-sky-100 bg-sky-50 px-4 py-2.5 dark:border-sky-900/40 dark:bg-sky-950/15">
            <div className="text-[11px] font-semibold text-sky-800 dark:text-sky-300">Start WhatsApp</div>
            <div className="mt-0.5 text-[10px] text-sky-700/80 dark:text-sky-400">Use an approved template to begin messaging this submitted phone number.</div>
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
              windowLabel={whatsappWindow?.label ?? "Choose an approved template to continue."}
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
              <select className="input" name="channel" defaultValue={selected.currentContactChannel}>
                {channels.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <input className="input" name="body" required placeholder="Log a message, email or call note..." />
              <button className="btn-primary" type="submit">Log</button>
            </div>
          </form>
        ) : null}
      </div>
    </section>
  );

  const context = selected ? (
    <div className="conversation-context-pane p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Context</div>
          <div className="mt-1 truncate text-sm font-semibold text-slate-950 dark:text-white">{selected.name}</div>
        </div>
        <StageBadge stage={selected.stage} />
      </div>

      <div className="mt-4 space-y-0 divide-y divide-slate-200 dark:divide-slate-800">
        <ContextLine label="Course" value={selected.course || "Not selected"} />
        <ContextLine label="Country" value={selected.country || "Not set"} />
        <ContextLine label="Channel" value={selected.currentContactChannel.replaceAll("_", " ")} />
        <ContextLine label="Last contacted" value={selected.lastContactedAt ? formatDateTime(selected.lastContactedAt) : "Not contacted"} />
      </div>

      {copilotChannel ? (
        <div className="mt-4">
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

      {leadContextAction ? (
        <details className="group mt-4 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
            Edit lead details
            <ChevronDown size={14} className="text-slate-400 transition group-open:rotate-180" />
          </summary>
          <form action={leadContextAction} className="space-y-3 border-t border-slate-100 p-3 dark:border-slate-900">
            <label className="block">
              <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-400">Course</span>
              <select className="input" name="course_id" defaultValue={selected.interestedCourseId ?? ""}>
                <option value="">Not selected</option>
                {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-400">Country</span>
              <input className="input" name="country" defaultValue={selected.country || ""} placeholder="e.g. Germany" />
            </label>
            <button className="btn-primary flex w-full items-center justify-center gap-2" type="submit">
              <Save size={13} /> Save details
            </button>
          </form>
        </details>
      ) : null}

      <div className="mt-4 grid gap-2">
        <Link href={`/leads/${selected.id}`} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900">
          Open lead profile <ArrowUpRight size={13} />
        </Link>
        <Link href="/follow-ups" className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900">
          Follow-up queue <CalendarClock size={13} />
        </Link>
      </div>
    </div>
  ) : null;

  return (
    <div className="conversations-polish space-y-4">
      <ConversationsRealtime />

      <PageHeader
        eyebrow="Inbox"
        title="Conversations"
        description="Manage customer messages and follow-ups in one place."
        actions={
          <span className={`rounded-lg px-2.5 py-1.5 text-[10px] font-semibold ${mock ? "bg-orange-50 text-orange-700" : "bg-emerald-50 text-emerald-700"}`}>
            {mock ? "Mock inbox" : "Live messaging"}
          </span>
        }
      />

      {query.error ? (
        <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-xs font-medium text-red-700 dark:border-red-900/40 dark:bg-red-950/15 dark:text-red-300">{query.error}</div>
      ) : null}
      {noticeText ? (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-xs font-medium text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/15 dark:text-emerald-300">{noticeText}</div>
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

function ContextLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="text-[10px] text-slate-400">{label}</span>
      <span className="max-w-[170px] text-right text-[11px] font-medium capitalize text-slate-700 dark:text-slate-200">{value}</span>
    </div>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => Array.from(part)[0] ?? "")
    .slice(0, 2)
    .join("")
    .toLocaleUpperCase("en-IN") || "?";
}
