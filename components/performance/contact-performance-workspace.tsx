import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Clock3,
  ContactRound,
  MessageSquareText,
  MessagesSquare,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { DecisionMetricCard } from "@/components/intelligence/decision-metric-card";
import { createClient } from "@/lib/supabase/server";

type ContactPerformanceMode = "response" | "communication";

type OverviewRow = {
  accessible_leads: number | string | null;
  contacted_leads: number | string | null;
  never_contacted_leads: number | string | null;
  total_contacts: number | string | null;
  outbound_contacts: number | string | null;
  inbound_contacts: number | string | null;
  successful_contacts: number | string | null;
  enrolled_leads: number | string | null;
  median_first_response_minutes: number | string | null;
  median_first_inbound_response_minutes: number | string | null;
};

type EmployeeRow = {
  employee_user_id: string;
  employee_name: string | null;
  contacted_leads: number | string | null;
  total_contacts: number | string | null;
  outbound_contacts: number | string | null;
  inbound_contacts: number | string | null;
  successful_contacts: number | string | null;
  whatsapp_contacts: number | string | null;
  phone_contacts: number | string | null;
  last_contact_at: string | null;
};

type ChannelRow = {
  method: string;
  contacted_leads: number | string | null;
  total_contacts: number | string | null;
  outbound_contacts: number | string | null;
  inbound_contacts: number | string | null;
  successful_contacts: number | string | null;
};

type TimeRow = {
  day_name: string | null;
  hour_of_day: number | string | null;
  contacted_leads: number | string | null;
  total_contacts: number | string | null;
  successful_contacts: number | string | null;
  successful_contact_rate_pct: number | string | null;
};

type LeadRow = {
  lead_id: string;
  lead_code: string;
  lead_name: string | null;
  owner_name: string | null;
  current_stage: string;
  course_name: string | null;
  country: string | null;
  total_contacts: number | string | null;
  outbound_contacts: number | string | null;
  inbound_contacts: number | string | null;
  successful_contacts: number | string | null;
  last_contact_at: string | null;
};

export async function ContactPerformanceWorkspace({ mode }: { mode: ContactPerformanceMode }) {
  const supabase = await createClient();

  const [overviewResult, employeeResult, channelResult, timeResult, highTouchResult, neverContactedResult] = await Promise.all([
    supabase.from("v_contact_intelligence_overview").select("*").maybeSingle(),
    supabase.from("v_contact_intelligence_employee").select("*").order("total_contacts", { ascending: false }).limit(12),
    supabase.from("v_contact_intelligence_channel").select("*").order("total_contacts", { ascending: false }),
    supabase.from("v_contact_intelligence_time_ist").select("*").order("total_contacts", { ascending: false }).limit(8),
    supabase.from("v_contact_intelligence_lead").select("lead_id,lead_code,lead_name,owner_name,current_stage,course_name,country,total_contacts,outbound_contacts,inbound_contacts,successful_contacts,last_contact_at").gt("total_contacts", 0).order("total_contacts", { ascending: false }).limit(8),
    supabase.from("v_contact_intelligence_lead").select("lead_id,lead_code,lead_name,owner_name,current_stage,course_name,country,total_contacts,outbound_contacts,inbound_contacts,successful_contacts,last_contact_at").eq("total_contacts", 0).order("lead_created_at", { ascending: false }).limit(8),
  ]);

  const overview = (overviewResult.data ?? null) as OverviewRow | null;
  const employees = (employeeResult.data ?? []) as EmployeeRow[];
  const channels = (channelResult.data ?? []) as ChannelRow[];
  const timeSlots = (timeResult.data ?? []) as TimeRow[];
  const highTouchLeads = (highTouchResult.data ?? []) as LeadRow[];
  const neverContactedLeads = (neverContactedResult.data ?? []) as LeadRow[];
  const errors = [overviewResult.error, employeeResult.error, channelResult.error, timeResult.error, highTouchResult.error, neverContactedResult.error].filter(Boolean);

  const accessibleLeads = numberValue(overview?.accessible_leads);
  const contactedLeads = numberValue(overview?.contacted_leads);
  const neverContacted = numberValue(overview?.never_contacted_leads);
  const totalContacts = numberValue(overview?.total_contacts);
  const successfulContacts = numberValue(overview?.successful_contacts);
  const coveragePct = accessibleLeads > 0 ? (contactedLeads / accessibleLeads) * 100 : null;
  const markedSuccessPct = totalContacts > 0 ? (successfulContacts / totalContacts) * 100 : null;
  const maxChannelContacts = Math.max(1, ...channels.map((row) => numberValue(row.total_contacts)));

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-line bg-surface px-5 py-5 shadow-sm">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-700">
          {mode === "response" ? "Performance · Response & SLA" : "Performance · Communication"}
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-copy-strong">
          {mode === "response" ? "Response & SLA" : "Communication Performance"}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-copy-muted">
          {mode === "response"
            ? "See contact coverage, first-response evidence and the leads most likely to need attention because no structured contact has been recorded."
            : "Understand how the team communicates across channels, owners and observed contact windows without treating contact volume as a conversion score."}
        </p>
      </section>

      {errors.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Some contact-performance data is unavailable. Metrics below use only the records that loaded successfully.
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-copy-muted">
          Historical records may be incomplete. Metrics use available structured contact logs and preserve unknown evidence as unknown.
        </div>
      )}

      {mode === "response" ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Response performance metrics">
            <DecisionMetricCard
              icon={<ShieldCheck size={16} />}
              label="Contact coverage"
              value={coveragePct == null ? "—" : `${coveragePct.toFixed(1)}%`}
              detail={accessibleLeads > 0 ? `${contactedLeads} of ${accessibleLeads} visible leads` : "No accessible leads"}
              evidenceLabel="Structured contact logs"
              definition="Share of visible leads with at least one structured contact record. Historical imports may be incomplete."
            />
            <DecisionMetricCard
              icon={<Clock3 size={16} />}
              label="Median first response"
              value={formatMinutes(overview?.median_first_response_minutes)}
              detail="Recorded first outbound contacts"
              evidenceLabel="Observed response evidence"
              definition="Median elapsed time to the first recorded outbound contact where the required timestamps are available."
            />
            <DecisionMetricCard
              icon={<Clock3 size={16} />}
              label="Median inbound response"
              value={formatMinutes(overview?.median_first_inbound_response_minutes)}
              detail="Recorded inbound-response evidence"
              evidenceLabel="Observed response evidence"
              definition="Median recorded response time following inbound contact. Missing historical events remain unknown."
            />
            <DecisionMetricCard
              icon={<AlertTriangle size={16} />}
              label="Never contacted"
              value={formatNumber(neverContacted)}
              detail="Visible leads without structured contact"
              tone={neverContacted > 0 ? "warning" : "positive"}
              statusLabel={neverContacted > 0 ? "Attention" : "Clear"}
              evidenceLabel="Coverage gap"
              definition="Visible leads with no structured contact event in the available CRM evidence. This does not prove no contact happened outside the system."
            />
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,.95fr)]">
            <Panel title="Leads without recorded contact" eyebrow="Coverage gaps" value={formatNumber(overview?.never_contacted_leads)}>
              {neverContactedLeads.length ? (
                <div className="divide-y divide-line">
                  {neverContactedLeads.map((row) => <LeadRowView key={row.lead_id} row={row} mode="uncontacted" />)}
                </div>
              ) : (
                <Empty title="No recorded coverage gaps" detail="Every visible lead has at least one structured contact record." />
              )}
            </Panel>

            <section className="rounded-2xl border border-line bg-surface p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-copy-subtle">Observed response windows</div>
              <h2 className="mt-1 text-base font-semibold text-copy-strong">When contact activity happens</h2>
              <p className="mt-1 text-xs leading-5 text-copy-muted">Activity evidence only. Small samples are not recommendations.</p>
              <div className="mt-4 space-y-2">
                {timeSlots.length ? timeSlots.map((row, index) => {
                  const contacts = numberValue(row.total_contacts);
                  return (
                    <div key={`${row.day_name}-${row.hour_of_day}-${index}`} className="flex items-center justify-between gap-4 rounded-xl border border-line px-3.5 py-3">
                      <div>
                        <div className="text-sm font-medium text-copy-strong">{row.day_name || "Day"} · {formatHour(row.hour_of_day)}</div>
                        <div className="mt-0.5 text-xs text-copy-muted">{contacts} contacts · {formatNumber(row.contacted_leads)} leads</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-copy-strong">{contacts >= 5 ? `${numberValue(row.successful_contact_rate_pct).toFixed(0)}%` : "—"}</div>
                        <div className="text-[10px] text-copy-subtle">{contacts >= 5 ? "marked successful" : "sample too small"}</div>
                      </div>
                    </div>
                  );
                }) : <Empty title="No timing data" detail="Response-window evidence will appear as structured contacts accumulate." compact />}
              </div>
            </section>
          </section>

          <OwnerTable employees={employees} title="Response activity by owner" />
        </>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Communication performance metrics">
            <DecisionMetricCard
              icon={<MessageSquareText size={16} />}
              label="Inbound contacts"
              value={formatNumber(overview?.inbound_contacts)}
              detail="Recorded inbound events"
              evidenceLabel="Communication activity"
              definition="Structured contact events recorded as inbound. Volume is descriptive and is not a performance score."
            />
            <DecisionMetricCard
              icon={<MessageSquareText size={16} />}
              label="Outbound contacts"
              value={formatNumber(overview?.outbound_contacts)}
              detail="Recorded outbound events"
              evidenceLabel="Communication activity"
              definition="Structured contact events recorded as outbound. Higher volume is not automatically better."
            />
            <DecisionMetricCard
              icon={<MessagesSquare size={16} />}
              label="Total contacts"
              value={formatNumber(totalContacts)}
              detail="Structured contact events"
              evidenceLabel="Communication activity"
              definition="Total available structured inbound and outbound contact events in the current contact-intelligence view."
            />
            <DecisionMetricCard
              icon={<ShieldCheck size={16} />}
              label="Marked successful"
              value={markedSuccessPct == null ? "—" : `${markedSuccessPct.toFixed(1)}%`}
              detail="CRM contact outcome label, not sales conversion"
              evidenceLabel="Contact outcome label"
              definition="Share of structured contact events explicitly marked successful in the CRM. It must not be interpreted as lead or sales conversion."
            />
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,.85fr)_minmax(0,1.15fr)]">
            <section className="rounded-2xl border border-line bg-surface p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-copy-subtle">Channel activity</div>
              <h2 className="mt-1 text-base font-semibold text-copy-strong">Recorded contacts by channel</h2>
              <div className="mt-4 space-y-4">
                {channels.length ? channels.map((row) => {
                  const total = numberValue(row.total_contacts);
                  const width = Math.max(total > 0 ? 3 : 0, Math.round((total / maxChannelContacts) * 100));
                  return (
                    <div key={row.method}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-copy-strong">{pretty(row.method)}</div>
                          <div className="mt-0.5 text-xs text-copy-muted">{formatNumber(row.inbound_contacts)} inbound · {formatNumber(row.outbound_contacts)} outbound</div>
                        </div>
                        <div className="text-sm font-semibold text-copy-strong">{formatNumber(total)}</div>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                        <div className="h-full rounded-full bg-brand-600" style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  );
                }) : <Empty title="No channel activity" detail="Channel evidence will appear after contacts are recorded." compact />}
              </div>
            </section>

            <Panel title="Most contacted leads" eyebrow="Detailed activity">
              {highTouchLeads.length ? (
                <div className="divide-y divide-line">
                  {highTouchLeads.map((row) => <LeadRowView key={row.lead_id} row={row} mode="contacted" />)}
                </div>
              ) : (
                <Empty title="No contacted leads yet" detail="Detailed contact journeys will appear after contacts are recorded." />
              )}
            </Panel>
          </section>

          <OwnerTable employees={employees} title="Communication activity by owner" />
        </>
      )}
    </div>
  );
}

function OwnerTable({ employees, title }: { employees: EmployeeRow[]; title: string }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="border-b border-line px-5 py-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-copy-subtle">Team activity</div>
        <h2 className="mt-1 text-base font-semibold text-copy-strong">{title}</h2>
      </div>
      {employees.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full text-left">
            <thead className="bg-surface-muted text-[11px] font-semibold text-copy-muted">
              <tr>
                <th className="px-5 py-3">Owner</th>
                <th className="px-4 py-3">Leads</th>
                <th className="px-4 py-3">Contacts</th>
                <th className="px-4 py-3">Inbound</th>
                <th className="px-4 py-3">Outbound</th>
                <th className="px-4 py-3">Marked successful</th>
                <th className="px-4 py-3">Last contact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {employees.map((row) => (
                <tr key={row.employee_user_id}>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-surface-muted text-copy-muted"><UserRound size={14} /></span>
                      <span className="text-sm font-medium text-copy-strong">{row.employee_name || "Unknown owner"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-sm text-copy-muted">{formatNumber(row.contacted_leads)}</td>
                  <td className="px-4 py-3.5 text-sm text-copy-muted">{formatNumber(row.total_contacts)}</td>
                  <td className="px-4 py-3.5 text-sm text-copy-muted">{formatNumber(row.inbound_contacts)}</td>
                  <td className="px-4 py-3.5 text-sm text-copy-muted">{formatNumber(row.outbound_contacts)}</td>
                  <td className="px-4 py-3.5 text-sm text-copy-muted">{formatNumber(row.successful_contacts)}</td>
                  <td className="px-4 py-3.5 text-sm text-copy-subtle">{formatDateTime(row.last_contact_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty title="No owner-attributed activity" detail="Team activity will appear when human contacts are recorded." />}
    </section>
  );
}

function Panel({ title, eyebrow, value, children }: { title: string; eyebrow: string; value?: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-copy-subtle">{eyebrow}</div>
          <h2 className="mt-1 text-base font-semibold text-copy-strong">{title}</h2>
        </div>
        {value ? <span className="text-sm font-semibold text-copy-strong">{value}</span> : null}
      </div>
      {children}
    </section>
  );
}

function LeadRowView({ row, mode }: { row: LeadRow; mode: "uncontacted" | "contacted" }) {
  return (
    <Link href={`/leads/${row.lead_id}`} className="group flex items-center gap-4 px-5 py-4 transition hover:bg-surface-muted">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-muted text-copy-muted"><ContactRound size={15} /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-copy-strong">{row.lead_name || row.lead_code || "Lead"}</span>
        <span className="mt-0.5 block truncate text-xs text-copy-muted">{[row.lead_code, row.course_name, row.owner_name || "Unassigned"].filter(Boolean).join(" · ")}</span>
      </span>
      <span className="text-right">
        <span className="block text-sm font-semibold text-copy-strong">{mode === "contacted" ? formatNumber(row.total_contacts) : pretty(row.current_stage || "new")}</span>
        <span className="block text-[10px] text-copy-subtle">{mode === "contacted" ? "contacts" : "stage"}</span>
      </span>
      <ArrowRight size={14} className="text-copy-subtle transition group-hover:translate-x-0.5" />
    </Link>
  );
}

function Empty({ title, detail, compact = false }: { title: string; detail: string; compact?: boolean }) {
  return (
    <div className={compact ? "py-5" : "px-5 py-9"}>
      <div className="text-sm font-semibold text-copy-strong">{title}</div>
      <div className="mt-1 text-sm text-copy-muted">{detail}</div>
    </div>
  );
}

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: number | string | null | undefined) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(numberValue(value));
}

function formatMinutes(value: number | string | null | undefined) {
  if (value == null || value === "") return "—";
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) return "—";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = Math.round(minutes % 60);
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(date);
}

function formatHour(value: number | string | null | undefined) {
  const hour = Number(value);
  if (!Number.isFinite(hour)) return "Time unavailable";
  const date = new Date(Date.UTC(2026, 0, 1, hour, 0));
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: true, timeZone: "UTC" }).format(date);
}

function pretty(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
