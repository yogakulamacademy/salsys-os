import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, MessageCircle, ReceiptText, Search } from "lucide-react";

import { initialsOf } from "@/components/crm/action-cards";
import { FitBadge } from "@/components/reengaged-act-now";
import { fitForLeads } from "@/lib/course-persona-data";
import { InterestProfileCard } from "@/components/interest-profile-card";
import { getLeads } from "@/lib/data";
import { suggestNextStep } from "@/lib/interest-profile";
import { getInterestProfile } from "@/lib/interest-profile-data";
import { getPersonViewData } from "@/lib/person-360-data";
import { getRecordCheck } from "@/lib/person-checks-data";
import { RecordVsConversation, SignalsCard } from "@/components/customer-360/record-check";
import { buildPersonTimeline, personSummary, STAGE_LABEL, type TimelineKind } from "@/lib/person-story";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";

type PersonRow = {
  person_id: string;
  person_status: string | null;
  latest_lead_name: string | null;
  person_created_at: string | null;
  verified_identifier_count: number | string | null;
  session_count: number | string | null;
  sessions_30d: number | string | null;
  touchpoint_count: number | string | null;
  page_view_count: number | string | null;
  last_message_at: string | null;
  latest_lead_engagement_score: number | string | null;
  latest_lead_behaviour_temperature: string | null;
  latest_lead_behaviour_reason: string | null;
};

type TaskRow = {
  id: string;
  lead_id: string;
  task_type: string;
  title: string;
  status: string;
  due_at: string | null;
};

type PaymentRow = {
  id: string;
  lead_id: string;
  payment_kind: string;
  status: string;
  amount: number | string;
  currency: string;
  provider: string | null;
  paid_at: string | null;
  created_at: string;
};

type EnrollmentRow = {
  id: string;
  lead_id: string;
  status: string;
  total_value: number | string | null;
  currency: string | null;
  enrolled_at: string | null;
  created_at: string;
};

type ConversationRow = {
  id: string;
  lead_id: string;
  channel: string;
  status: string | null;
  last_message_at: string | null;
};

export default async function Customer360DetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ personId: string }>;
  searchParams: Promise<{ opportunity?: string; q?: string }>;
}) {
  const { personId } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) notFound();

  const organizationId = await requireCurrentOrganizationId(supabase, user.id);

  const linkResult = await supabase
    .from("person_leads")
    .select("lead_id")
    .eq("organization_id", organizationId)
    .eq("person_id", personId);

  if (linkResult.error) {
    throw new Error(`Unable to load customer opportunities: ${linkResult.error.message}`);
  }

  const linkedLeadIds = (linkResult.data ?? []).map((row) => row.lead_id as string);
  // Only this person's leads, with the same visibility rules as the Leads list
  // (a person whose lead is older than the newest 500 used to show "not found").
  const leads = await getLeads({ ids: linkedLeadIds });
  const accessibleLeadById = new Map(leads.map((lead) => [lead.id, lead]));
  const accessibleLeads = linkedLeadIds
    .map((leadId) => accessibleLeadById.get(leadId))
    .filter((lead) => Boolean(lead));

  if (!accessibleLeads.length) notFound();

  const requestedOpportunity = query.opportunity?.trim() || "";
  const activeLead =
    accessibleLeads.find((lead) => lead?.id === requestedOpportunity) ??
    accessibleLeads.find((lead) => !["enrolled", "closed_won", "lost", "unqualified", "duplicate"].includes(lead?.stage ?? "")) ??
    accessibleLeads[0];

  if (!activeLead) notFound();

  const accessibleIds = accessibleLeads.map((lead) => lead!.id);

  // Interest profile: admin reads, scoped to this business and to leads this user can already see.
  const admin = createAdminClient();
  const interestProfilePromise = getInterestProfile(admin, organizationId, accessibleIds);
  const viewPromise = getPersonViewData(admin, organizationId, personId, accessibleIds, activeLead.id);
  const peoplePromise = getPeopleList(supabase, organizationId, (query.q ?? "").trim());

  const [personResult, tasksResult, paymentsResult, enrollmentsResult, conversationsResult] =
    await Promise.all([
      // Read with the server client: under row-level security this view times
      // out. Access was already checked above (this person's leads are visible
      // to the user), and the read is scoped to this business and person.
      admin
        .from("v_person_360_operational")
        .select(
          "person_id,person_status,latest_lead_name,person_created_at,verified_identifier_count,session_count,sessions_30d,touchpoint_count,page_view_count,last_message_at,latest_lead_engagement_score,latest_lead_behaviour_temperature,latest_lead_behaviour_reason",
        )
        .eq("organization_id", organizationId)
        .eq("person_id", personId)
        .maybeSingle(),
      supabase
        .from("tasks")
        .select("id,lead_id,task_type,title,status,due_at")
        .eq("organization_id", organizationId)
        .in("lead_id", accessibleIds)
        .in("status", ["open", "snoozed"])
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(20),
      supabase
        .from("payments")
        .select("id,lead_id,payment_kind,status,amount,currency,provider,paid_at,created_at")
        .eq("organization_id", organizationId)
        .in("lead_id", accessibleIds)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("enrollments")
        .select("id,lead_id,status,total_value,currency,enrolled_at,created_at")
        .eq("organization_id", organizationId)
        .in("lead_id", accessibleIds)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("conversations")
        .select("id,lead_id,channel,status,last_message_at")
        .eq("organization_id", organizationId)
        .in("lead_id", accessibleIds)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(20),
    ]);

  const person = (personResult.error ? null : personResult.data ?? null) as PersonRow | null;
  const interestProfile = await interestProfilePromise;
  const tasks = tasksResult.error ? [] : ((tasksResult.data ?? []) as TaskRow[]);
  const payments = paymentsResult.error ? [] : ((paymentsResult.data ?? []) as PaymentRow[]);
  const enrollments = enrollmentsResult.error ? [] : ((enrollmentsResult.data ?? []) as EnrollmentRow[]);
  const conversations = conversationsResult.error
    ? []
    : ((conversationsResult.data ?? []) as ConversationRow[]);

  const [view, people] = await Promise.all([viewPromise, peoplePromise]);
  // Placeholders like "—" or "Unassigned" mean nothing is known.
  const known = (value: string | null | undefined) => {
    const text = (value ?? "").trim();
    return text && !/^(—|-|unknown|unassigned|none|not selected)$/i.test(text) ? text : null;
  };
  const leadLocation = known(view?.facts.location) ?? known(activeLead.location);
  const owner = known(activeLead.owner);
  const fit = interestProfile
    ? (await fitForLeads(admin, organizationId, [activeLead.id], new Map([[activeLead.id, interestProfile]]))).get(activeLead.id) ?? null
    : (await fitForLeads(admin, organizationId, [activeLead.id], new Map())).get(activeLead.id) ?? null;
  const displayName = activeLead.name || person?.latest_lead_name || "Customer";
  const course = activeLead.course && !/^(not selected|unknown)$/i.test(activeLead.course) ? activeLead.course : null;
  const timeline = view
    ? buildPersonTimeline({
        ...view.timeline,
        payments: payments.map((p) => ({ at: p.paid_at || p.created_at, status: p.status, amount: Number(p.amount || 0), currency: p.currency || "INR" })),
      })
    : [];
  const summary = personSummary(
    {
      name: displayName, course, location: leadLocation, month: known(view?.facts.month),
      mode: known(view?.facts.mode), country: view?.facts.country ?? null, countryLikely: view?.facts.countryLikely ?? false, stage: activeLead.stage,
    },
    {
      pagesViewed: interestProfile?.pagesViewed ?? 0,
      formAt: view?.formAt ?? null,
      lastInboundAt: view?.lastInboundAt ?? null,
      lastOutboundAt: view?.lastOutboundAt ?? null,
    },
  );
  const step = interestProfile ? suggestNextStep(interestProfile, course) : null;
  const waiting = Boolean(view?.lastInboundAt && (!view.lastOutboundAt || Date.parse(view.lastInboundAt) > Date.parse(view.lastOutboundAt)));
  const stageText = STAGE_LABEL[activeLead.stage] ?? pretty(activeLead.stage);
  // The record vs the conversation, and signals (owner-approved mockup, 25 Nov 2026).
  const recordCheck = await getRecordCheck(admin, organizationId, activeLead.id, stageText);
  const value = activeLead.value ? `worth about ${formatMoney(activeLead.value, activeLead.currency || "INR")}` : null;
  const facts: { label: string; value: string | null; source: string | null }[] = [
    { label: "Course", value: course, source: course ? "Their enquiry" : null },
    { label: "When", value: known(view?.facts.month), source: known(view?.facts.month) ? "Their messages" : null },
    { label: "Where", value: leadLocation, source: leadLocation ? "Their messages" : null },
    { label: "Online or in person", value: known(view?.facts.mode) ? pretty(view!.facts.mode!) : null, source: known(view?.facts.mode) ? "Their messages" : null },
    { label: "Came from the ad", value: view?.ads.length ? `“${view.ads[0].title}”${view.ads.length > 1 ? ` + ${view.ads.length - 1} more` : ""}` : null, source: view?.ads.length ? `Instagram, ${new Date(view.ads[0].firstSeenAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : null },
    { label: "Country", value: view?.facts.country ? `${view.facts.country}${view.facts.countryLikely ? " (likely)" : ""}` : null, source: view?.facts.country ? (view.facts.countryLikely ? "Worked out from clues" : "Their details") : null },
  ];
  const identityRows = identityList(view);

  return (
    <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_400px] 2xl:grid-cols-[340px_minmax(0,1fr)_420px]">
      {/* People */}
      <aside className="flex min-h-0 flex-col gap-3 rounded-2xl border border-line bg-surface p-3 shadow-xs xl:sticky xl:top-20 xl:max-h-[calc(100vh-7rem)]">
        <form action={`/customer-360/${personId}`} className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-copy-subtle" />
          <input name="q" defaultValue={query.q ?? ""} placeholder="Search name, phone, email…" aria-label="Search people" className="h-10 w-full rounded-ui border border-line bg-surface pl-9 pr-3 text-[13px] outline-none placeholder:text-copy-subtle focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
        </form>
        <Link href="/customer-360" className="px-1 text-[12px] font-semibold text-brand-700 hover:underline">All people →</Link>
        <nav aria-label="People" className="-mx-1 flex-1 space-y-1 overflow-y-auto px-1">
          {people.map((row) => {
            const active = row.personId === personId;
            return (
              <Link
                key={row.personId}
                href={`/customer-360/${row.personId}?opportunity=${row.leadId}${query.q ? `&q=${encodeURIComponent(query.q)}` : ""}`}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-2.5 py-2 transition ${active ? "bg-brand-50 outline outline-2 -outline-offset-2 outline-brand-600 dark:bg-brand-950/30" : "hover:bg-surface-soft"}`}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-[12px] font-bold text-brand-700 dark:bg-brand-950/40">{initialsOf(row.name)}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-semibold text-copy-strong">{row.name}</span>
                  <span className="block truncate text-[12px] text-copy-muted">{[STAGE_LABEL[row.stage] ?? pretty(row.stage), row.course || "course not known"].join(" · ")}</span>
                </span>
              </Link>
            );
          })}
          {!people.length ? <p className="px-2 py-4 text-[12px] text-copy-muted">No one matches.</p> : null}
        </nav>
      </aside>

      {/* What happened */}
      <div className="flex min-w-0 flex-col gap-4">
        <section className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-brand-700">Summary · from their own messages and visits</span>
          </div>
          <p className="mt-2 text-[16px] font-semibold leading-7 text-copy-strong">{summary}</p>
          {step || waiting ? (
            <div className={`mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 ${step?.needsPerson ? "bg-amber-50 dark:bg-amber-950/25" : "bg-brand-50/70 dark:bg-brand-950/25"}`}>
              <div className="min-w-0">
                <div className={`text-[12px] font-bold ${step?.needsPerson ? "text-amber-800 dark:text-amber-300" : "text-brand-700 dark:text-brand-300"}`}>{step?.needsPerson ? "For a person" : "Next best action"}</div>
                <div className="text-[14px] font-semibold text-copy-strong">{step?.action ?? "Reply to their last message"}</div>
              </div>
              <Link href={`/conversations?lead=${activeLead.id}`} className="btn-primary shrink-0">{waiting ? "Reply" : "Open conversation"}</Link>
            </div>
          ) : null}
        </section>

        {recordCheck && recordCheck.messages ? <SignalsCard s={recordCheck.signals} /> : null}

        <section className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-copy-muted">Everything that happened</h2>
          {timeline.length ? (
            <ol className="mt-2">
              {[...timeline].reverse().map((item, i) => (
                <li key={`${item.at}-${i}`} className="grid grid-cols-[110px_14px_minmax(0,1fr)] gap-3 border-t border-line py-3 first:border-t-0">
                  <span className="text-[12px] text-copy-muted">{formatWhen(item.at)}</span>
                  <span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${DOT[item.kind]}`} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold text-copy-strong">{item.title}</span>
                    {item.detail ? <span className="block truncate text-[13px] text-copy-muted" title={item.detail}>{item.detail}</span> : null}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-[13px] text-copy-muted">Nothing recorded yet.</p>
          )}
        </section>

        <div className="grid gap-4 lg:grid-cols-3">
          <ListPanel title="Tasks" icon={<CalendarClock size={15} />} empty="No open tasks.">
            {tasks.slice(0, 6).map((task) => (
              <ListRow key={task.id} title={task.title} detail={pretty(task.task_type)} meta={formatDateTime(task.due_at)} />
            ))}
          </ListPanel>
          <ListPanel title="Payments" icon={<ReceiptText size={15} />} empty="No payments recorded.">
            {payments.slice(0, 6).map((payment) => (
              <ListRow key={payment.id} title={`${payment.currency} ${Number(payment.amount || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`} detail={`${pretty(payment.payment_kind)} · ${pretty(payment.status)}`} meta={formatDate(payment.paid_at || payment.created_at)} />
            ))}
          </ListPanel>
          <ListPanel title="Conversations" icon={<MessageCircle size={15} />} empty="No conversations.">
            {conversations.slice(0, 6).map((conversation) => (
              <div key={conversation.id} className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0">
                <div>
                  <div className="text-[13px] font-semibold text-copy-strong">{pretty(conversation.channel)}</div>
                  <div className="mt-0.5 text-[12px] text-copy-muted">{formatDateTime(conversation.last_message_at)}</div>
                </div>
                <Link href={`/conversations?lead=${conversation.lead_id}`} className="text-[13px] font-semibold text-brand-700 hover:underline">Open</Link>
              </div>
            ))}
          </ListPanel>
        </div>
      </div>

      {/* Who they are */}
      <div className="flex min-w-0 flex-col gap-4">
        <section className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 shadow-xs">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-50 text-[15px] font-bold text-brand-700 dark:bg-brand-950/40">{initialsOf(displayName)}</span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[18px] font-bold text-copy-strong">{displayName}</h1>
            <div className="truncate text-[12.5px] text-copy-muted">{[stageText, Number(person?.latest_lead_engagement_score ?? 0) > 0 ? `score ${person!.latest_lead_engagement_score}` : null, value].filter(Boolean).join(" · ")}</div>
            {fit ? (
              <div className="mt-1 flex items-center gap-2 text-[12px] text-copy-muted">
                <FitBadge fit={fit} />
                <span className="truncate">{fit.reasons[0]?.text ?? "Little in common with people who joined yet"}</span>
              </div>
            ) : null}
          </div>
          {owner ? (
            <span className="shrink-0 text-[13px] text-copy">{owner}</span>
          ) : (
            <Link href={`/leads/${activeLead.id}`} className="shrink-0 text-[13px] font-semibold text-brand-700 hover:underline">+ Assign</Link>
          )}
        </section>

        {accessibleLeads.length > 1 ? (
          <section className="rounded-2xl border border-line bg-surface p-4 shadow-xs">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-copy-muted">Enquiries</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {accessibleLeads.map((lead) => lead ? (
                <Link
                  key={lead.id}
                  href={`/customer-360/${personId}?opportunity=${lead.id}`}
                  className={`rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition ${lead.id === activeLead.id ? "border-brand-300 bg-brand-50 text-brand-700" : "border-line text-copy-muted hover:border-line-strong"}`}
                >
                  {lead.course || lead.leadCode} · {STAGE_LABEL[lead.stage] ?? pretty(lead.stage)}
                </Link>
              ) : null)}
            </div>
          </section>
        ) : null}

        {recordCheck ? <RecordVsConversation check={recordCheck.check} leadId={activeLead.id} personId={personId} messages={recordCheck.messages} /> : null}

        <section className="rounded-2xl border border-line bg-surface p-4 shadow-xs">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-copy-muted">What we know</h2>
          <p className="mt-1 text-[12px] text-copy-muted">From their enquiry, messages and visits.</p>
          <dl className="mt-2">
            {facts.map((fact) => (
              <div key={fact.label} className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 border-t border-line py-2.5 first:border-t-0">
                <dt className="text-[13px] text-copy-muted">{fact.label}</dt>
                <dd className="min-w-0">
                  <span className={`block truncate text-[13.5px] font-semibold ${fact.value ? "text-copy-strong" : "text-copy-subtle"}`}>{fact.value ?? "Not mentioned"}</span>
                  {fact.source ? <span className="block text-[11.5px] text-copy-muted">{fact.source}</span> : null}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <InterestProfileCard profile={interestProfile} />

        <section className="rounded-2xl border border-line bg-surface p-4 shadow-xs">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-copy-muted">Identity</h2>
          <ul className="mt-2">
            {identityRows.map((row) => (
              <li key={row.label} className="flex items-center justify-between gap-3 border-t border-line py-2.5 text-[13px] first:border-t-0">
                <span className="text-copy">{row.label}</span>
                <span className={`rounded-lg px-2 py-0.5 text-[12px] font-semibold ${row.tone === "good" ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300" : "bg-surface-muted text-copy-muted"}`}>{row.status}</span>
              </li>
            ))}
          </ul>
          {person ? <p className="mt-2 text-[11.5px] text-copy-muted">Known since {formatDate(person.person_created_at)} · {Number(person.session_count ?? 0)} website sessions</p> : null}
        </section>
      </div>
    </div>
  );
}

const DOT: Record<TimelineKind, string> = {
  web: "bg-blue-600", form: "bg-brand-600", message: "bg-brand-600", reply: "bg-slate-400",
  stage: "bg-slate-500", ai: "bg-emerald-600", payment: "bg-emerald-600", warn: "bg-orange-600",
};

const IDENTITY_LABEL: Record<string, string> = {
  email: "Email", phone: "Phone", whatsapp: "WhatsApp", instagram_id: "Instagram", instagram_igsid: "Instagram", instagram: "Instagram",
};

function identityList(view: Awaited<ReturnType<typeof getPersonViewData>>) {
  const rows: { label: string; status: string; tone: "good" | "none" }[] = [];
  const seen = new Set<string>();
  for (const id of view?.identity ?? []) {
    const label = IDENTITY_LABEL[id.type] ?? pretty(id.type);
    if (seen.has(label)) continue;
    seen.add(label);
    rows.push({ label, status: id.verified ? "Confirmed" : "Not confirmed", tone: id.verified ? "good" : "none" });
  }
  rows.push({ label: "Website visitor", status: view?.websiteLinked ? "Linked" : "Not linked", tone: view?.websiteLinked ? "good" : "none" });
  for (const channel of ["instagram", "whatsapp"]) {
    const label = IDENTITY_LABEL[channel];
    if (!seen.has(label)) rows.push({ label, status: view?.channels.includes(channel) ? "Chatting" : "Not found", tone: view?.channels.includes(channel) ? "good" : "none" });
  }
  return rows;
}

/** People for the side list: newest leads the user can see, one row per person. */
async function getPeopleList(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  q: string,
): Promise<{ personId: string; leadId: string; name: string; stage: string; course: string | null }[]> {
  try {
    const needle = q.toLowerCase();
    const leads = (await getLeads())
      .filter((lead) => !needle || [lead.name, lead.email, lead.phone, lead.course].filter(Boolean).join(" ").toLowerCase().includes(needle))
      .slice(0, 80);
    if (!leads.length) return [];
    const { data } = await supabase.from("person_leads").select("person_id, lead_id")
      .eq("organization_id", organizationId).in("lead_id", leads.map((lead) => lead.id));
    const personByLead = new Map(((data ?? []) as { person_id: string; lead_id: string }[]).map((row) => [row.lead_id, row.person_id]));
    const seen = new Set<string>();
    const out: { personId: string; leadId: string; name: string; stage: string; course: string | null }[] = [];
    for (const lead of leads) {
      const personId = personByLead.get(lead.id);
      if (!personId || seen.has(personId)) continue;
      seen.add(personId);
      out.push({ personId, leadId: lead.id, name: lead.name || lead.leadCode, stage: lead.stage, course: lead.course && !/^(not selected|unknown)$/i.test(lead.course) ? lead.course : null });
    }
    return out.slice(0, 50);
  } catch {
    return [];
  }
}



function ListPanel({ title, icon, empty, children }: { title: string; icon: React.ReactNode; empty: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <section className="overflow-hidden rounded-panel border border-line bg-surface shadow-xs">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3 text-[13px] font-semibold text-copy-strong">
        <span className="text-brand-700">{icon}</span>{title}
      </div>
      {hasChildren ? children : <div className="px-4 py-6 text-center text-[12px] text-copy-muted">{empty}</div>}
    </section>
  );
}

function ListRow({ title, detail, meta }: { title: string; detail: string; meta: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0">
      <div className="min-w-0">
        <div className="truncate text-[13px] font-semibold text-copy-strong">{title}</div>
        <div className="mt-0.5 truncate text-[12px] text-copy-muted">{detail}</div>
      </div>
      <div className="shrink-0 text-[12px] text-copy-muted">{meta}</div>
    </div>
  );
}


function pretty(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(date);
}


function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(date);
}

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString("en-IN")}`;
  }
}
