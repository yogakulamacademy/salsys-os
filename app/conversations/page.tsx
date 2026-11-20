import Link from "next/link";
import {
  ArrowUpRight,
  CalendarClock,
  ChevronDown,
  Clock3,
  MessageCircle,
  Phone,
  Save,
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
import { changeInboxLeadStageAction } from "@/app/conversations/team-actions";
import { buildQuickReplies } from "@/lib/inbox-quick-replies";
import { getUpcomingBatchesForQuickReplies } from "@/lib/inbox-quick-reply-data";
import { InboxHeaderActions } from "@/components/inbox-header-actions";
import { InboxLeadOverview } from "@/components/inbox-lead-overview";
import { InboxOfferCard } from "@/components/inbox-offer-card";
import { InboxOverview } from "@/components/inbox-overview";
import { InboxLeadIntelligence } from "@/components/inbox-lead-intelligence";
import { getLeadSourceForInbox } from "@/lib/lead-source-context-data";
import { InboxHeaderOwner } from "@/components/inbox-header-owner";
import { InboxSnoozedBanner } from "@/components/inbox-snoozed-banner";
import { InboxAutopilotBar, InboxFollowupDraftCard } from "@/components/inbox-autopilot";
import { getInboxAutopilot } from "@/lib/autopilot-inbox-data";
import { InboxCourseLink } from "@/components/inbox-course-link";
import { InboxCourseInterests, type InboxInterest } from "@/components/inbox-course-interests";
import { InboxEnrollment } from "@/components/inbox-enrollment";
import { getEnrollmentPanel } from "@/lib/enrollment-panel-data";
import { countryName } from "@/lib/dm-links";
import { getLeadTrackedLink } from "@/lib/dm-links-data";
import { getOrgSalesAiSettings } from "@/lib/org-sales-ai-settings";
import { buildLeadIntelligence, readSignals } from "@/lib/lead-intelligence";
import { scoreLead } from "@/lib/lead-score";
import { getLeadScoreContext } from "@/lib/lead-score-data";
import { getLeadOfferSuggestion } from "@/lib/offer-suggestion-data";
import { ConversationReadMarker } from "@/components/conversation-read-marker";
import { ConversationSafeComposer } from "@/components/conversation-safe-composer";
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
    topic?: string;
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

  // The conversations page RPC carries no phone column, so contact details
  // come from the authorized, PII-aware contacts RPC (masked values are hidden).
  const selectedContacts = selected && !mock
    ? await resolveConversationContacts(selected.id)
    : null;
  const selectedPhone = mock ? selected?.phone : selectedContacts?.phone ?? undefined;
  const hasTelephoneContact =
    selectedId && selected
      ? mock
        ? Boolean(selected.phone)
        : Boolean(selectedPhone) && await resolveTelephoneCapability(selectedId)
      : false;

  const selectedAttribution = selected ? await getLead(selected.id) : null;

  // AI offer (behind AI_OFFERS_ENABLED): read-only suggestion; a person approves before anything is sent.
  const offerSuggestion = selected && !mock && process.env.AI_OFFERS_ENABLED === "true"
    ? await getLeadOfferSuggestion({
        leadId: selected.id,
        messages: selected.lastMessages.map((m) => ({ direction: m.direction, body: m.body, timestamp: m.timestamp })),
        channel: selected.currentContactChannel,
        interestedCourseId: selected.interestedCourseId ?? null,
        courseName: selected.course && selected.course !== "Not selected" ? selected.course : null,
        waitingSince: selectedSummary?.waitingSince ?? null,
        replyWindowOpen: selected.currentContactChannel === "whatsapp" ? Boolean(whatsappWindow?.open) : null,
        country: selected.country ?? null,
      }).catch(() => null)
    : null;
  // Lead intelligence: where the lead stands + what has happened (read-only, no AI call).
  const leadIntel = selected
    ? buildLeadIntelligence({
        stage: selected.stage,
        messages: selected.lastMessages,
        touchpoints: selectedAttribution?.touchpoints ?? [],
        course: selected.course,
        ownerName: selected.ownerName,
        createdAt: selected.createdAt,
        originLabel: selected.leadCreationChannel ? selected.leadCreationChannel.replaceAll("_", " ") : null,
        waitingSince: selectedSummary?.waitingSince ?? null,
        needsReply: Boolean(selectedSummary?.needsReply),
        needsFirstContact: Boolean(selectedSummary?.needsFirstContact),
      })
    : null;
  // Which Instagram ad the lead came from / what their latest message shares.
  const leadSource = selected && !mock && selected.currentContactChannel === "instagram"
    ? await getLeadSourceForInbox(selected.id, organizationId).catch(() => null)
    : null;
  // AI Autopilot state and any due AI follow-up draft (Sales AI Jobs 2 and 4).
  const autopilot = selected && !mock && selected.currentContactChannel === "instagram"
    ? await getInboxAutopilot(selected.id).catch(() => null)
    : null;
  // Tracked course link: opened or not, and the visit country (DM-LINK). RLS-scoped read.
  const courseLink = selected && !mock && selected.currentContactChannel === "instagram"
    ? await createClient().then((client) => getLeadTrackedLink(client, selected.id)).catch(() => null)
    : null;
  // Course interests, main course and estimated value (RLS-scoped read).
  const interestData = selected && !mock
    ? await createClient().then(async (client) => {
        const [{ data: rows }, { data: lead }] = await Promise.all([
          client.from("lead_course_interests").select("course_id, location, sources, is_primary, estimated_value, value_currency, status, strength, last_seen_at, courses(name)")
            .eq("lead_id", selected.id).neq("status", "dropped").order("is_primary", { ascending: false }).order("strength", { ascending: false }).limit(6),
          client.from("leads").select("potential_value_source").eq("id", selected.id).maybeSingle(),
        ]);
        const interests: InboxInterest[] = (rows ?? []).map((r) => {
          const course = Array.isArray(r.courses) ? r.courses[0] : r.courses;
          return { courseId: String(r.course_id), courseName: (course as { name?: string } | null)?.name ?? "Course", location: r.location ?? null,
            sources: (r.sources as string[]) ?? [], isPrimary: Boolean(r.is_primary),
            estimatedValue: r.estimated_value == null ? null : Number(r.estimated_value), currency: r.value_currency ?? null };
        });
        const src = String(lead?.potential_value_source ?? "");
        const valueNote = src.includes("market_unknown") ? "Value uses the India price: we don't know yet if this lead is in India." : null;
        return { interests, valueNote };
      }).catch(() => null)
    : null;
  // Enrolment and payments for this lead (RLS-scoped); Mark enrolled for owner/admin.
  const enrollmentPanel = selected && !mock
    ? await createClient().then(async (client) => {
        const { data: { user } } = await client.auth.getUser();
        return user ? getEnrollmentPanel(client, selected.id, user.id) : null;
      }).catch(() => null)
    : null;
  // Lead score, conversion confidence and next step (Sales AI Job 3).
  const scoreContext = selected && !mock
    ? await getLeadScoreContext(selected.id, organizationId).catch(() => null)
    : null;
  const leadScore = selected && leadIntel
    ? (() => {
        const lastInbound = [...selected.lastMessages].reverse().find((m) => m.direction === "inbound");
        const lastInboundMs = lastInbound ? Date.parse(lastInbound.timestamp) : NaN;
        const waitingMs = selectedSummary?.waitingSince ? Date.parse(selectedSummary.waitingSince) : NaN;
        return scoreLead({
          stage: selected.stage,
          signals: readSignals(selected.lastMessages).labels,
          courseSelected: Boolean(selected.course && selected.course !== "Not selected"),
          inbound: leadIntel.stats.inbound,
          outbound: leadIntel.stats.outbound,
          needsReply: Boolean(selectedSummary?.needsReply || selectedSummary?.needsFirstContact),
          waitingMinutes: Number.isFinite(waitingMs) ? (Date.now() - waitingMs) / 60_000 : null,
          daysSinceLastInbound: Number.isFinite(lastInboundMs) ? (Date.now() - lastInboundMs) / 86_400_000 : null,
          hasOpenFollowup: Boolean(scoreContext?.nextFollowupAt && Date.parse(scoreContext.nextFollowupAt) > Date.now()),
          engagementScore: scoreContext?.engagementScore ?? null,
          paymentStarts7d: scoreContext?.paymentStarts7d ?? null,
          wonLeadsInOrg: scoreContext?.wonLeadsInOrg ?? 0,
          followupRequested: scoreContext?.followupRequested ?? null,
        });
      })()
    : null;
  const isSnoozedNow = Boolean(selected?.snoozedUntil && new Date(selected.snoozedUntil).getTime() > Date.now());
  const selectedEmail = selectedContacts?.email ?? null;
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
  const stageAction = selectedId
    ? changeInboxLeadStageAction.bind(null, selectedId)
    : undefined;
  const quickBatches = selected && !mock
    ? await getUpcomingBatchesForQuickReplies(selected.interestedCourseId).catch(() => [])
    : [];
  const quickReplies = selected
    ? buildQuickReplies({
        firstName: selected.name.split(" ")[0] ?? null,
        courseName: selected.course,
        batches: quickBatches,
      })
    : null;
  const leadContextAction = selectedId
    ? updateConversationLeadContextWithActivityAction.bind(null, selectedId)
    : undefined;

  // Autopilot is on when the CRM-wide switch is on and this business has it switched on.
  const autopilotLive = !mock && process.env.AI_AUTOPILOT_LIVE_ENABLED === "true" && Boolean(organizationId) &&
    (await createClient().then((client) => getOrgSalesAiSettings(client, String(organizationId))).catch(() => null))?.autopilotEnabled === true;

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

  const hasStartTemplates = whatsappTemplateCatalog.templates.some((template) => template.supported);

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
      {/* Nothing open: show what's waiting today instead of "Select a conversation". */}
      <InboxOverview
        rows={conversationSummary}
        pagination={workspace.pagination}
        hrefFor={(leadId) => `/conversations?lead=${leadId}`}
      />
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
              <InboxHeaderOwner key={`owner-${selected.id}`} leadId={selected.id}
                ownerUserId={selected.ownerUserId} ownerName={selected.ownerName}
                candidates={team.assignmentCandidates} canAssign={team.canManageAssignments} mock={mock}/>
              {selectedSummary?.needsReply || selectedSummary?.needsFirstContact ? (
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${selectedSummary.needsReply ? "bg-warning-soft text-warning" : "bg-sky-50 text-sky-700"}`}>
                  {selectedSummary.needsReply ? "Needs reply" : "First contact"}
                  {selectedSummary.waitingSince ? <><Clock3 size={11} aria-hidden="true" /> {formatWaiting(selectedSummary.waitingSince)}</> : null}
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
          canResolve={workspace.evidence.inboxResolutionAvailable} mock={mock}
          snoozed={isSnoozedNow}/>

      </header>
      {isSnoozedNow && selected.snoozedUntil ? (
        <InboxSnoozedBanner leadId={selected.id} until={selected.snoozedUntil} />
      ) : null}
      {autopilot ? (
        <InboxAutopilotBar key={`ap-${selected.id}`} leadId={selected.id} state={autopilot.state} canHandToAi={selected.currentContactChannel === "instagram"} />
      ) : null}

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
        teamNames={Object.fromEntries(team.assignmentCandidates.map((member) => [member.id, member.name]))}
        logAction={mock ? undefined : interactionAction}
      />

      {/* Shadow drafts no longer run when a conversation is opened (owner request,
          18 Nov 2026). AI drafts come only from the Draft buttons or Autopilot. */}

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
              phone={selectedPhone}
            />
          ) : (
            <div className="p-4 text-[12px] text-copy-muted">
              {messagingEligibility?.userMessage ||
                "WhatsApp sending is currently unavailable for this conversation."}
            </div>
          )
        ) : canStartWhatsApp && whatsappTemplateAction && (hasStartTemplates || whatsappTemplateCatalog.error) ? (
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
            leadId={selected.id}
            channel={selected.currentContactChannel}
            interactionAction={interactionAction}
            eligibility={
              messagingEligibility?.channel === selected.currentContactChannel
                ? messagingEligibility
                : null
            }
            emailTo={selected.currentContactChannel === "instagram" ? null : selectedEmail}
            notice={canStartWhatsApp && !hasStartTemplates
              ? "WhatsApp needs an approved Meta template first; none is approved yet. Reply by email or log a call instead."
              : null}
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
        {hasTelephoneContact && selectedPhone ?
          <a className="ibx-v2-profile-phone" href={`tel:${selectedPhone.replace(/[^0-9+]/g,"")}`}>
            <Phone size={13}/> {selectedPhone}
          </a> :
          <span className="ibx-v2-profile-no-phone">Phone contact unavailable</span>}
      </section>
      {interestData ? (
        <InboxCourseInterests key={`int-${selected.id}`} leadId={selected.id} interests={interestData.interests} valueNote={interestData.valueNote} />
      ) : null}
      {enrollmentPanel ? <InboxEnrollment key={`enr-${selected.id}`} leadId={selected.id} panel={enrollmentPanel} /> : null}
      {selected.currentContactChannel === "instagram" && !mock ? (
        <InboxCourseLink key={`link-${selected.id}`} leadId={selected.id}
          status={courseLink ? { ...courseLink, visitCountryName: countryName(courseLink.visitCountry) } : null} />
      ) : null}
      {leadIntel ? <InboxLeadIntelligence intel={leadIntel} score={leadScore} source={leadSource} /> : null}
      {/* key: remount per lead so the stage/owner selects never keep the previous conversation's value */}
      <InboxLeadOverview key={selected.id} leadId={selected.id} stage={selected.stage}
        ownerUserId={selected.ownerUserId} ownerName={selected.ownerName}
        candidates={team.assignmentCandidates} canAssign={false}
        mock={mock} channel={selected.currentContactChannel}
        attributionSource={selectedAttribution?.firstTouchSource||"Not verified"} interest={selected.course}
        country={selected.country}
        lastContacted={selected.lastContactedAt?formatDateTime(selected.lastContactedAt):"No messages yet"}
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


      {offerSuggestion ? (
        <InboxOfferCard key={`offer-${selected.id}`} leadId={selected.id}
          firstName={selected.name.split(" ")[0] ?? ""} channel={selected.currentContactChannel}
          suggestion={offerSuggestion} canManage={team.canManageAssignments}/>
      ) : null}

      {!mock && process.env.AI_LEAD_INSIGHTS_ENABLED === "true" && process.env.AI_LEAD_INSIGHTS_UI_ENABLED === "true" && (
        <div className="border-b border-line px-3.5 py-3">
          <AILeadInsightPanel leadId={selected.id} compact />
        </div>
      )}

      {autopilot?.followup ? <InboxFollowupDraftCard key={`fu-${autopilot.followup.taskId}`} followup={autopilot.followup} /> : null}

      <InboxQuickActions key={`qa-${selected.id}`} phone={selectedPhone} canCall={Boolean(hasTelephoneContact)}
        profileHref={`/leads/${selected.id}`} channel={selected.currentContactChannel}
        replies={quickReplies!} logAction={interactionAction} stageAction={stageAction} mock={mock}/>

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
          <span className="rounded-ui border border-line bg-surface px-2.5 py-2 text-[11px] font-semibold text-copy-muted"
            title="AI Autopilot replies by itself on new Instagram leads when it is confident, and hands the rest to the team.">
            AI Autopilot: {autopilotLive ? "on (Instagram pilot)" : "off"}
          </span>
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

type ConversationContacts = { email: string | null; phone: string | null };

async function resolveConversationContacts(leadId: string): Promise<ConversationContacts | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_admissions_lead_contacts_secure", {
    p_lead_ids: [leadId],
  });
  if (error || !Array.isArray(data)) return null;
  const row = data.find((value) => value?.lead_id === leadId) as
    | { email?: string | null; phone?: string | null; whatsapp?: string | null; pii_masked?: boolean | null }
    | undefined;
  if (!row) return null;
  // Masked values are for display policy only; never dial or message them.
  const usable = (value?: string | null) =>
    !row.pii_masked && typeof value === "string" && /\d{6,}/.test(value.replace(/\D/g, "")) ? value.trim() : null;
  return {
    email: row.email || null,
    phone: usable(row.whatsapp) ?? usable(row.phone),
  };
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
  if (value === "interaction-logged") return "Call recorded on the lead.";
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
