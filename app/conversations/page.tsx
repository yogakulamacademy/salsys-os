import Link from "next/link";
import {
  ArrowUpRight,
  CalendarClock,
  ChevronDown,
  Clock3,
  MessageCircle,
  Phone,
  Save,
  UserRound,
} from "lucide-react";

import { logLeadInteractionAction } from "@/app/actions/crm";
import {
  sendWhatsAppMessageAction,
  sendWhatsAppTemplateAction,
} from "@/app/conversations/actions";
import { updateConversationLeadContextWithActivityAction } from "@/app/conversations/context-actions";
import { ConversationCenterView } from "@/components/conversation-center-view";
import { ConversationCopilot } from "@/components/conversation-copilot";
import { WhatsAppComposer } from "@/components/conversation-composer";
import { ConversationIntelligencePanel } from "@/components/conversation-intelligence-panel";
import { AILeadInsightPanel } from "@/components/ai-lead-insight-panel";
import { InboxQuickActions } from "@/components/inbox-quick-actions";
import { InboxHeaderActions } from "@/components/inbox-header-actions";
import { InboxLeadOverview } from "@/components/inbox-lead-overview";
import { ConversationReadMarker } from "@/components/conversation-read-marker";
import { ConversationSafeComposer } from "@/components/conversation-safe-composer";
import { ConversationTeamControls } from "@/components/conversation-team-controls";
import { ConversationWorkspaceShell } from "@/components/conversation-workspace-shell";
import { ConversationsRealtime } from "@/components/conversations-realtime";
import { ConversationsSidebar } from "@/components/conversations-sidebar";
import { EmptyState, Notice, StageBadge } from "@/components/ui";
import { WhatsAppTemplateComposer } from "@/components/whatsapp-template-composer";
import { getConversationsWorkspace } from "@/lib/conversations-data";
import { getCourses, getLead, isMockMode } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { getMessagingEligibility } from "@/lib/messaging-eligibility";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceContext } from "@/lib/workspace";
import { getApprovedWhatsAppTemplates } from "@/lib/whatsapp-templates";
import "./inbox-v2.css";
import "./inbox-reference.css";

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    lead?: string;
    notice?: string;
    error?: string;
    wamid?: string;
    page?: string;
    q?: string;
    sort?: string;
    scope?: string;
    filter?: string;
    channel?: string;
    priority?: string;
  }>;
}) {
  const query = await searchParams;
  const mock = isMockMode();

  const [workspace, courses, workspaceContext] = await Promise.all([
    getConversationsWorkspace(query.lead, query),
    getCourses(),
    mock ? Promise.resolve(null) : getCurrentWorkspaceContext(),
  ]);

  const {
    conversationSummary,
    selectedId: resolvedSelectedId,
    selected: resolvedSelected,
    whatsappWindow,
    team,
  } = workspace;
  // Opening the inbox must not select or mark a customer's thread as read.
  const selectedId = query.lead ? resolvedSelectedId : undefined;
  const selected = query.lead ? resolvedSelected : null;

  const selectedSummary = selectedId
    ? conversationSummary.find((lead) => lead.id === selectedId) ?? null
    : null;
  const organizationId = workspaceContext?.activeOrganizationId ?? null;
  const evidenceWarnings = mock ? [] : workspace.evidence.warnings;
  const inboxModeLabel = mock
    ? "Demo data"
    : workspace.evidence.workspaceSource === "legacy_compatibility"
      ? "Compatibility inbox"
      : team.canManageAssignments
        ? "Team inbox"
        : "My workspace";

  const hasTelephoneContact =
    selectedId && selected
      ? mock
        ? Boolean(selected.phone)
        : await resolveTelephoneCapability(selectedId)
      : false;

  const selectedAttribution = selected ? await getLead(selected.id) : null;
  const selectedEmail = selected && !mock
    ? await resolveConversationEmail(selected.id)
    : null;
  const conversationStatus = selectedSummary?.resolved ? "Done"
    : selectedSummary?.needsReply ? "Needs reply"
    : selectedSummary?.needsFirstContact ? "First contact"
    : selectedSummary?.unread ? "Unread"
    : "Active";

  const canStartWhatsApp = Boolean(
    selected &&
      selected.leadCreationChannel === "website" &&
      selected.currentContactChannel !== "whatsapp" &&
      hasTelephoneContact,
  );

  const messagingEligibility =
    selected && !mock
      ? await getMessagingEligibility({
          leadId: selected.id,
          organizationId,
          channel: selected.currentContactChannel,
          whatsappWindow,
          canStartWhatsApp,
        })
      : null;

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
    ? updateConversationLeadContextWithActivityAction.bind(null, selectedId)
    : undefined;

  const noticeText = noticeFor(query.notice);

  const normalizedWhatsAppMode =
    messagingEligibility?.channel === "whatsapp"
      ? messagingEligibility.replyMode
      : whatsappWindow?.open
        ? "freeform"
        : "template";

  const shouldLoadWhatsAppTemplates = Boolean(
    normalizedWhatsAppMode === "template" || canStartWhatsApp,
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

  const copilotEnabled = mock
    ? copilotChannel === "instagram" ||
      (copilotChannel === "whatsapp" && Boolean(whatsappWindow?.open))
    : Boolean(
        copilotChannel &&
          messagingEligibility?.channel === copilotChannel &&
          messagingEligibility.freeformAllowed,
      );

  const inbox = (
    <ConversationsSidebar
      leads={conversationSummary}
      selectedId={selectedId}
      currentUserId={team.currentUserId}
      canManageAssignments={team.canManageAssignments}
      pagination={workspace.pagination}
    />
  );

  const chat = !selected ? (
    <section className="inbox-unselected h-full bg-surface">
      <EmptyState variant="conversation" title="Select a conversation" description="Choose a conversation on the left to see messages and customer details." />
    </section>
  ) : (
    <section className="ibx-v2-chat flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-surface">
      <ConversationReadMarker leadId={selected.id} />

      <header className="ibx-v2-chat-header shrink-0 border-b border-line bg-surface px-4 py-3.5 pr-32 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-700">
            {initials(selected.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-[15px] font-semibold text-copy-strong">
                {selected.name}
              </h2>
              <StageBadge stage={selected.stage} />
              <span className="ibx-v3-header-channel"><MessageCircle size={12}/>
                {selected.currentContactChannel.replaceAll("_"," ")}
              </span>
              <span className="ibx-v3-header-owner"><UserRound size={12}/>
                Owner: {selected.ownerName||"Unassigned"}
              </span>
              {selectedSummary?.needsReply ? (
                <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning">
                  Needs reply
                </span>
              ) : selectedSummary?.needsFirstContact ? (
                <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                  First contact
                </span>
              ) : null}
              {selectedSummary?.waitingSince &&
              (selectedSummary.needsReply || selectedSummary.needsFirstContact) ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-copy-muted">
                  <Clock3 size={11} /> Waiting {formatWaiting(selectedSummary.waitingSince)}
                </span>
              ) : null}
            </div>
            <div className="ibx-v3-lead-meta">
              <span>Lead · {selectedSummary?.needsReply ? "Inbound inquiry" : "Customer inquiry"}</span>
              <span aria-hidden="true">·</span>
              <span>Created {formatDateTime(selected.createdAt)}</span>
            </div>
          </div>
        </div>
        <InboxHeaderActions leadId={selected.id}
          resolved={Boolean(selectedSummary?.resolved)}
          canResolve={workspace.evidence.inboxResolutionAvailable} mock={mock}/>

      </header>

      <ConversationCenterView
        messages={selected.lastMessages}
        originChannel={selected.leadCreationChannel}
        originTimestamp={selected.createdAt}
        originCourse={selected.course}
        originDetail={
          selected.leadCreationChannel === "website"
            ? "Form enquiry received and added to the CRM."
            : undefined
        }
        course={selected.course}
        country={selected.country}
        stage={selected.stage}
      />

      {copilotChannel ? (
        <section className="ibx-v2-ai-toolbar" aria-label="AI reply suggestions">
          <ConversationCopilot
            compactToolbar
            messages={selected.lastMessages}
            leadId={selected.id}
            channel={copilotChannel}
            enabled={copilotEnabled}
            disabledReason={
              !copilotEnabled
                ? messagingEligibility?.userMessage ||
                  (copilotChannel === "whatsapp"
                    ? "The WhatsApp service window is closed. Use an approved template instead of a free-text draft."
                    : "This channel is not currently eligible for a direct reply.")
                : undefined
            }
          />
        </section>
      ) : null}


      <div className="shrink-0 border-t border-line bg-surface">
        {selected.currentContactChannel === "whatsapp" &&
        normalizedWhatsAppMode === "template" ? (
          <div className="border-b border-amber-100 bg-amber-50 px-4 py-2.5 dark:border-amber-900/40 dark:bg-amber-950/15">
            <div className="text-[12px] font-semibold text-amber-800 dark:text-amber-300">
              Approved template required
            </div>
            <div className="mt-0.5 text-[11px] text-amber-700/80 dark:text-amber-400">
              {messagingEligibility?.userMessage ||
                "An approved template is required before another WhatsApp message can be sent."}
            </div>
          </div>
        ) : null}

        {selected.currentContactChannel === "whatsapp" ? (
          normalizedWhatsAppMode === "freeform" && whatsappAction ? (
            <WhatsAppComposer
              action={whatsappAction}
              leadId={selected.id}
              windowOpen
              windowLabel={
                messagingEligibility?.userMessage ||
                whatsappWindow?.label ||
                "WhatsApp free-form reply is available."
              }
            />
          ) : normalizedWhatsAppMode === "template" && whatsappTemplateAction ? (
            <WhatsAppTemplateComposer
              action={whatsappTemplateAction}
              templates={whatsappTemplateCatalog.templates}
              loadError={whatsappTemplateCatalog.error}
              windowLabel={
                messagingEligibility?.userMessage ||
                whatsappWindow?.label ||
                "Choose an approved template to continue."
              }
              mode="followup"
              phone={selected.phone}
            />
          ) : (
            <div className="p-4 text-[12px] text-copy-muted">
              {messagingEligibility?.userMessage ||
                "WhatsApp sending is currently unavailable for this conversation."}
            </div>
          )
        ) : canStartWhatsApp && whatsappTemplateAction ? (
          <WhatsAppTemplateComposer
            action={whatsappTemplateAction}
            leadId={selected.id}
            templates={whatsappTemplateCatalog.templates}
            loadError={whatsappTemplateCatalog.error}
            windowLabel={
              messagingEligibility?.channel === "whatsapp"
                ? messagingEligibility.userMessage
                : "Use an approved template to start WhatsApp from this website enquiry."
            }
            mode="start"
          />
        ) : (
          <ConversationSafeComposer
            instagramVariantsEnabled={process.env.IG_REPLY_VARIANTS_ENABLED === "true"}
            leadId={selected.id}
            channel={selected.currentContactChannel}
            interactionAction={interactionAction}
            eligibility={
              messagingEligibility?.channel === selected.currentContactChannel
                ? messagingEligibility
                : null
            }
          />
        )}
      </div>
    </section>
  );

  const context = selected ? (
    <div className="ibx-v2-context conversation-context-pane min-h-full bg-surface-soft">

      <section className="ibx-v2-profile-card border-b border-line px-4 py-4">
        <div className="ibx-v2-profile-heading">
          <div className="ibx-v2-profile-avatar">{initials(selected.name)}</div>
          <div className="ibx-v2-profile-name">
            <strong>{selected.name}</strong>
            <span className="ibx-v3-profile-email">
              {selectedEmail ? <a href={`mailto:${selectedEmail}`}>{selectedEmail}</a> : "Email not recorded / unavailable"}
            </span>
          </div>
          <Link href={`/leads/${selected.id}`} aria-label="Open customer profile"
            title="Open customer profile" className="ibx-v2-profile-link">
            <ArrowUpRight size={16}/>
          </Link>
        </div>
        {hasTelephoneContact && selected.phone ?
          <a className="ibx-v2-profile-phone" href={`tel:${selected.phone.replace(/[^0-9+]/g,"")}`}>
            <Phone size={13}/> {selected.phone}
          </a> :
          <span className="ibx-v2-profile-no-phone">Phone contact unavailable</span>}
      </section>
      <InboxLeadOverview leadId={selected.id} stage={selected.stage}
        ownerUserId={selected.ownerUserId} ownerName={selected.ownerName}
        candidates={team.assignmentCandidates} canAssign={team.canManageAssignments}
        mock={mock} channel={selected.currentContactChannel}
        attributionSource={selectedAttribution?.firstTouchSource||"Not verified"} interest={selected.course}
        country={selected.country}
        lastContacted={selected.lastContactedAt?formatDateTime(selected.lastContactedAt):"Not contacted"}
        state={conversationStatus}/>

      <section id="inbox-next-steps" className="ibx-v2-next-step-card border-b border-line px-3.5 py-4">
        <ConversationIntelligencePanel
          compact
          leadId={selected.id}
          stage={selected.stage}
          priority={selectedSummary?.priority ?? "normal"}
          needsReply={Boolean(selectedSummary?.needsReply)}
          needsFirstContact={Boolean(selectedSummary?.needsFirstContact)}
          waitingSince={selectedSummary?.waitingSince ?? null}
        />
      </section>


      {!mock && process.env.AI_LEAD_INSIGHTS_ENABLED === "true" && process.env.AI_LEAD_INSIGHTS_UI_ENABLED === "true" && (
        <div className="border-b border-line px-3.5 py-3">
          <AILeadInsightPanel leadId={selected.id} compact />
        </div>
      )}

      <InboxQuickActions phone={selected.phone} canCall={Boolean(hasTelephoneContact)}
        canAssign={team.canManageAssignments} profileHref={`/leads/${selected.id}`}/>
      <details id="inbox-assignment" className="ibx-v2-assignment-card ibx-v2-advanced-panel">
        <summary>Team & ownership <ChevronDown size={14}/></summary>
        <ConversationTeamControls
        leadId={selected.id}
        ownerUserId={selected.ownerUserId}
        ownerName={selected.ownerName}
        snoozedUntil={selected.snoozedUntil}
        canManageAssignments={team.canManageAssignments}
        assignmentCandidates={team.assignmentCandidates}
      />
      </details>

      {leadContextAction ? (
        <section className="border-b border-line px-4 py-4">
          <details className="group rounded-ui border border-line bg-surface">
            <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3 text-[12px] font-semibold text-copy-muted">
              Edit lead details
              <ChevronDown
                size={14}
                className="text-copy-subtle transition group-open:rotate-180"
              />
            </summary>
            <div className="ibx-v3-advanced-evidence"><ContextLine label="Lead creation" value={selected.leadCreationChannel.replaceAll("_"," ")}/></div>
            <form
              action={leadContextAction}
              className="space-y-3 border-t border-line p-3"
            >
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-copy-muted">
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
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-copy-muted">
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
        </section>
      ) : null}


    </div>
  ) : null;

  return (
    <div className="ibx-v2 conversations-polish gap-2">
      {!mock ? <ConversationsRealtime /> : null}

      <section className="inbox-page-heading ibx-v2-page-heading flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-700">
            Customer conversations
          </div>
          <h1 className="mt-1.5 text-[30px] font-semibold tracking-[-0.035em] text-copy-strong">
            Inbox
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/follow-ups" className="btn-secondary">Follow-ups</Link>
          <span className="rounded-ui border border-line bg-surface px-2.5 py-2 text-[11px] font-semibold text-copy-muted">
            {inboxModeLabel}
          </span>
        </div>
      </section>

      {evidenceWarnings.map((warning, index) => (
        <Notice key={`${index}-${warning}`} tone="warning" title="Compatibility evidence active">
          {warning}
        </Notice>
      ))}
      {query.error ? <Notice tone="error">{query.error}</Notice> : null}
      {noticeText ? <Notice tone="success">{noticeText}</Notice> : null}

      <ConversationWorkspaceShell
        inbox={inbox}
        chat={chat}
        context={context}
        hasConversation={Boolean(selected)}
      />
    </div>
  );
}

async function resolveConversationEmail(leadId:string):Promise<string|null> {
  const supabase=await createClient();
  const {data,error}=await supabase.rpc('get_admissions_lead_contacts_secure',{
    p_lead_ids:[leadId],
  });
  if(error||!Array.isArray(data)) return null;
  const row=data.find(value=>value?.lead_id===leadId) as {email?:string|null}|undefined;
  return row?.email||null;
}

async function resolveTelephoneCapability(leadId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("has_lead_telephone_contact", {
    p_lead_id: leadId,
  });

  if (error) {
    console.error("Unable to resolve lead telephone capability:", error.message);
    return false;
  }

  return data === true;
}

function noticeFor(value?: string) {
  if (value === "whatsapp-sent") return "WhatsApp message sent.";
  if (value === "whatsapp-template-sent") return "WhatsApp template sent.";
  if (value === "whatsapp-started") return "WhatsApp conversation started.";
  if (value === "lead-context-updated") return "Lead details updated.";
  if (value === "owner-updated") return "Conversation owner updated across CRM and open work.";
  if (value === "conversation-snoozed") return "Conversation snoozed in your inbox.";
  if (value === "conversation-unsnoozed") return "Conversation returned to your active inbox.";
  if (value === "conversation-done") return "Conversation marked done. New inbound messages will reopen it.";
  if (value === "conversation-reopened") return "Conversation returned to the active reply queue.";
  if (value === "inbox-stage-updated") return "Lead stage updated and recorded in CRM history.";
  return value ? "Interaction logged." : null;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-copy-muted">
      {children}
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
      className={`min-w-[78px] rounded-ui border px-2.5 py-1.5 ${
        attention ? "border-brand-100 bg-brand-50" : "border-line bg-surface"
      }`}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.07em] text-copy-muted">
        {label}
      </div>
      <div className={`mt-0.5 text-[14px] font-semibold ${attention ? "text-brand-700" : "text-copy-strong"}`}>
        {value.toLocaleString("en-IN")}
      </div>
    </div>
  );
}

function ContextLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="text-[12px] text-copy-muted">{label}</dt>
      <dd className="m-0 max-w-[175px] text-right text-[12px] font-medium capitalize text-copy-strong">
        {value}
      </dd>
    </div>
  );
}

function formatWaiting(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "—";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function isFuture(value: string | null) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp > Date.now();
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
