import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  MessageCircle,
  ReceiptText,
  Route,
  UsersRound,
} from "lucide-react";

import { PageHeader } from "@/components/ui";
import { getLeads } from "@/lib/data";
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
  searchParams: Promise<{ opportunity?: string }>;
}) {
  const { personId } = await params;
  const query = await searchParams;
  const leads = await getLeads();
  const accessibleLeadById = new Map(leads.map((lead) => [lead.id, lead]));
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

  const [personResult, tasksResult, paymentsResult, enrollmentsResult, conversationsResult] =
    await Promise.all([
      supabase
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

  if (personResult.error) {
    throw new Error(`Unable to load customer relationship summary: ${personResult.error.message}`);
  }

  const person = (personResult.data ?? null) as PersonRow | null;
  const tasks = tasksResult.error ? [] : ((tasksResult.data ?? []) as TaskRow[]);
  const payments = paymentsResult.error ? [] : ((paymentsResult.data ?? []) as PaymentRow[]);
  const enrollments = enrollmentsResult.error ? [] : ((enrollmentsResult.data ?? []) as EnrollmentRow[]);
  const conversations = conversationsResult.error
    ? []
    : ((conversationsResult.data ?? []) as ConversationRow[]);

  const displayName = activeLead.name || person?.latest_lead_name || "Customer";
  const paidPayments = payments.filter((payment) => payment.status === "paid");
  const paidByCurrency = paidPayments.reduce<Record<string, number>>((accumulator, payment) => {
    const currency = payment.currency || "INR";
    accumulator[currency] = (accumulator[currency] ?? 0) + Number(payment.amount || 0);
    return accumulator;
  }, {});
  const overdueTasks = tasks.filter((task) => {
    if (!task.due_at) return false;
    const timestamp = Date.parse(task.due_at);
    return Number.isFinite(timestamp) && timestamp < Date.now();
  });

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sales · Customer 360"
        title={displayName}
        description={`One Contact · ${accessibleLeads.length} accessible opportunit${accessibleLeads.length === 1 ? "y" : "ies"}. Commercial state changes with the selected Opportunity; relationship identity does not.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/customer-360" className="btn-secondary">
              <ArrowLeft size={14} /> Customers
            </Link>
            <Link href={`/conversations?lead=${activeLead.id}`} className="btn-primary">
              <MessageCircle size={14} /> Open conversation
            </Link>
          </div>
        }
      />

      <section className="rounded-panel border border-line bg-surface p-4 shadow-xs">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="eyebrow">Opportunity context</div>
            <div className="mt-1 text-sm font-semibold text-copy-strong">Choose the commercial context for this Contact</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {accessibleLeads.map((lead) => {
              if (!lead) return null;
              const active = lead.id === activeLead.id;
              return (
                <Link
                  key={lead.id}
                  href={`/customer-360/${personId}?opportunity=${lead.id}`}
                  className={`rounded-ui border px-3 py-2 text-[11px] font-semibold transition ${
                    active
                      ? "border-brand-300 bg-brand-50 text-brand-700"
                      : "border-line bg-surface text-copy-muted hover:border-line-strong hover:bg-surface-soft"
                  }`}
                >
                  {lead.course || lead.leadCode} · {pretty(lead.stage)}
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<Route size={16} />} label="Opportunities" value={String(accessibleLeads.length)} note="Accessible commercial records for this Contact" />
        <Metric icon={<CalendarClock size={16} />} label="Open tasks" value={String(tasks.length)} note={overdueTasks.length ? `${overdueTasks.length} overdue` : "No overdue tasks"} />
        <Metric icon={<CreditCard size={16} />} label="Paid payments" value={String(paidPayments.length)} note={formatMoneyMap(paidByCurrency)} />
        <Metric icon={<CheckCircle2 size={16} />} label="Enrollments" value={String(enrollments.length)} note="Enrollment state remains separate from payment" />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
        <section className="overflow-hidden rounded-panel border border-line bg-surface shadow-xs">
          <div className="border-b border-line px-5 py-4">
            <div className="eyebrow">Opportunities</div>
            <h2 className="section-title mt-1">Commercial history</h2>
          </div>
          <div className="divide-y divide-line">
            {accessibleLeads.map((lead) => {
              if (!lead) return null;
              const selected = lead.id === activeLead.id;
              return (
                <div key={lead.id} className={`px-5 py-4 ${selected ? "bg-brand-50/40" : ""}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-copy-strong">{lead.course || "Course not selected"}</span>
                        <Pill>{pretty(lead.stage)}</Pill>
                        {lead.intent ? <Pill>{pretty(lead.intent)} intent</Pill> : null}
                      </div>
                      <div className="mt-1 text-[11px] text-copy-subtle">
                        {lead.leadCode} · {lead.location || "Location not selected"} · {lead.owner || "Unassigned"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link href={`/conversations?lead=${lead.id}`} className="btn-secondary">Conversation</Link>
                      <Link href={`/leads/${lead.id}`} className="btn-secondary">Opportunity <ArrowRight size={12} /></Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-panel border border-line bg-surface p-5 shadow-xs">
          <div className="eyebrow">Relationship</div>
          <h2 className="section-title mt-1">Contact-level signals</h2>
          <div className="mt-4 space-y-3">
            <RelationshipRow label="Relationship since" value={formatDate(person?.person_created_at)} />
            <RelationshipRow label="Verified identifiers" value={String(Number(person?.verified_identifier_count ?? 0))} />
            <RelationshipRow label="Sessions" value={String(Number(person?.session_count ?? 0))} />
            <RelationshipRow label="Sessions · 30d" value={String(Number(person?.sessions_30d ?? 0))} />
            <RelationshipRow label="Touchpoints" value={String(Number(person?.touchpoint_count ?? 0))} />
            <RelationshipRow label="Page views" value={String(Number(person?.page_view_count ?? 0))} />
            <RelationshipRow label="Last message" value={formatDateTime(person?.last_message_at)} />
            <RelationshipRow label="Engagement score" value={person?.latest_lead_engagement_score == null ? "—" : String(person.latest_lead_engagement_score)} />
            <RelationshipRow label="Behaviour" value={person?.latest_lead_behaviour_temperature ? pretty(person.latest_lead_behaviour_temperature) : "—"} />
          </div>
          {person?.latest_lead_behaviour_reason ? (
            <div className="mt-4 rounded-ui bg-brand-50 p-3 text-[11px] leading-5 text-brand-700">
              {person.latest_lead_behaviour_reason}
            </div>
          ) : null}
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <ListPanel title="Tasks & follow-ups" icon={<CalendarClock size={16} />} empty="No open tasks for accessible opportunities.">
          {tasks.slice(0, 8).map((task) => (
            <ListRow key={task.id} title={task.title} detail={`${pretty(task.task_type)} · ${pretty(task.status)}`} meta={formatDateTime(task.due_at)} />
          ))}
        </ListPanel>

        <ListPanel title="Payments" icon={<ReceiptText size={16} />} empty="No payment records for accessible opportunities.">
          {payments.slice(0, 8).map((payment) => (
            <ListRow key={payment.id} title={`${payment.currency} ${Number(payment.amount || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`} detail={`${pretty(payment.payment_kind)} · ${pretty(payment.status)}`} meta={formatDate(payment.paid_at || payment.created_at)} />
          ))}
        </ListPanel>

        <ListPanel title="Conversations" icon={<MessageCircle size={16} />} empty="No conversations for accessible opportunities.">
          {conversations.slice(0, 8).map((conversation) => (
            <div key={conversation.id} className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0">
              <div>
                <div className="text-[11px] font-semibold text-copy-strong">{pretty(conversation.channel)}</div>
                <div className="mt-0.5 text-[10px] text-copy-subtle">{formatDateTime(conversation.last_message_at)}</div>
              </div>
              <Link href={`/conversations?lead=${conversation.lead_id}`} className="text-[11px] font-semibold text-brand-700 hover:underline">Open</Link>
            </div>
          ))}
        </ListPanel>
      </div>
    </div>
  );
}

function Metric({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note: string }) {
  return (
    <div className="rounded-panel border border-line bg-surface p-4 shadow-xs">
      <div className="flex items-center justify-between gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-ui bg-brand-50 text-brand-700">{icon}</span>
        <span className="text-2xl font-semibold tracking-tight text-copy-strong">{value}</span>
      </div>
      <div className="mt-3 text-[11px] font-semibold text-copy-strong">{label}</div>
      <div className="mt-1 text-[10px] leading-4 text-copy-subtle">{note}</div>
    </div>
  );
}

function RelationshipRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line pb-2.5 text-[11px] last:border-b-0">
      <span className="text-copy-subtle">{label}</span>
      <span className="text-right font-semibold text-copy-strong">{value}</span>
    </div>
  );
}

function ListPanel({ title, icon, empty, children }: { title: string; icon: React.ReactNode; empty: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <section className="overflow-hidden rounded-panel border border-line bg-surface shadow-xs">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3.5 text-sm font-semibold text-copy-strong">
        <span className="text-brand-700">{icon}</span>{title}
      </div>
      {hasChildren ? children : <div className="px-4 py-8 text-center text-[11px] text-copy-subtle">{empty}</div>}
    </section>
  );
}

function ListRow({ title, detail, meta }: { title: string; detail: string; meta: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0">
      <div className="min-w-0">
        <div className="truncate text-[11px] font-semibold text-copy-strong">{title}</div>
        <div className="mt-0.5 truncate text-[10px] text-copy-subtle">{detail}</div>
      </div>
      <div className="shrink-0 text-[10px] text-copy-subtle">{meta}</div>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-brand-50 px-2 py-1 text-[9px] font-semibold text-brand-700">{children}</span>;
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

function formatMoneyMap(value: Record<string, number>) {
  const entries = Object.entries(value);
  if (!entries.length) return "No collected revenue";
  return entries.map(([currency, amount]) => `${currency} ${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`).join(" · ");
}
