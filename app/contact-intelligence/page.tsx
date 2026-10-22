import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Clock3,
  ContactRound,
  MessageCircle,
  TimerReset,
  UserRound,
  UsersRound,
} from "lucide-react";

import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

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

export default async function ContactPerformancePage() {
  const supabase = await createClient();
  const mock = process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false";

  if (!mock) {
    const { data: isAdmin, error: adminError } = await supabase.rpc("is_crm_admin");
    if (adminError || isAdmin !== true) redirect("/dashboard?restricted=1");
  }

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
  const totalContacts = numberValue(overview?.total_contacts);
  const successfulContacts = numberValue(overview?.successful_contacts);
  const coveragePct = accessibleLeads > 0 ? (contactedLeads / accessibleLeads) * 100 : null;
  const markedSuccessPct = totalContacts > 0 ? (successfulContacts / totalContacts) * 100 : null;
  const maxChannelContacts = Math.max(1, ...channels.map((row) => numberValue(row.total_contacts)));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Contact Performance"
        description="Understand response speed, activity, and contact coverage."
        actions={
          <Link href="/team-performance" className="btn-secondary">
            <UsersRound size={15} /> Team performance
          </Link>
        }
      />

      {errors.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Some contact-performance data is unavailable. Metrics below use the records that loaded successfully.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950">
          Historical records may be incomplete. Metrics use available structured contact logs.
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Contact coverage" value={coveragePct == null ? "—" : `${coveragePct.toFixed(1)}%`} detail={accessibleLeads > 0 ? `${contactedLeads} of ${accessibleLeads} leads` : "No accessible leads"} />
        <Kpi label="Median first response" value={formatMinutes(overview?.median_first_response_minutes)} detail="Recorded first outbound contacts" />
        <Kpi label="Inbound contacts" value={formatNumber(overview?.inbound_contacts)} detail="Recorded inbound events" />
        <Kpi label="Outbound contacts" value={formatNumber(overview?.outbound_contacts)} detail="Recorded outbound events" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,.95fr)]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-900">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">Coverage gaps</div>
              <h2 className="mt-1 text-base font-semibold text-slate-950 dark:text-white">Leads without recorded contact</h2>
            </div>
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{formatNumber(overview?.never_contacted_leads)}</span>
          </div>

          {neverContactedLeads.length ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-900">
              {neverContactedLeads.map((row) => (
                <LeadRowView key={row.lead_id} row={row} mode="uncontacted" />
              ))}
            </div>
          ) : (
            <Empty title="No recorded coverage gaps" detail="Every visible lead has at least one structured contact record." />
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">Channel activity</div>
          <h2 className="mt-1 text-base font-semibold text-slate-950 dark:text-white">Recorded contacts by channel</h2>
          <div className="mt-4 space-y-4">
            {channels.length ? channels.map((row) => {
              const total = numberValue(row.total_contacts);
              const width = Math.max(3, Math.round((total / maxChannelContacts) * 100));
              return (
                <div key={row.method}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{pretty(row.method)}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{formatNumber(row.inbound_contacts)} inbound · {formatNumber(row.outbound_contacts)} outbound</div>
                    </div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">{formatNumber(total)}</div>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-900">
                    <div className="h-full rounded-full bg-violet-500" style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            }) : <div className="text-sm text-slate-500">No channel activity recorded yet.</div>}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-900">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">Team activity</div>
          <h2 className="mt-1 text-base font-semibold text-slate-950 dark:text-white">Contact activity by owner</h2>
        </div>
        {employees.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full text-left">
              <thead className="bg-slate-50 text-[11px] font-semibold text-slate-500 dark:bg-slate-900/60">
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
              <tbody className="divide-y divide-slate-100 dark:divide-slate-900">
                {employees.map((row) => (
                  <tr key={row.employee_user_id}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-900"><UserRound size={14} /></span>
                        <span className="text-sm font-medium text-slate-900 dark:text-white">{row.employee_name || "Unknown owner"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-600 dark:text-slate-300">{formatNumber(row.contacted_leads)}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-600 dark:text-slate-300">{formatNumber(row.total_contacts)}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-600 dark:text-slate-300">{formatNumber(row.inbound_contacts)}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-600 dark:text-slate-300">{formatNumber(row.outbound_contacts)}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-600 dark:text-slate-300">{formatNumber(row.successful_contacts)}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-500">{formatDateTime(row.last_contact_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty title="No owner-attributed contact activity" detail="Team activity will appear when human contacts are recorded." />}
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">Conversation activity by time</div>
          <h2 className="mt-1 text-base font-semibold text-slate-950 dark:text-white">Observed contact windows</h2>
          <p className="mt-1 text-sm text-slate-500">Activity only. Small samples are not recommendations.</p>
          <div className="mt-4 space-y-2">
            {timeSlots.length ? timeSlots.map((row, index) => {
              const contacts = numberValue(row.total_contacts);
              return (
                <div key={`${row.day_name}-${row.hour_of_day}-${index}`} className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 px-3.5 py-3 dark:border-slate-800">
                  <div>
                    <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{row.day_name || "Day"} · {formatHour(row.hour_of_day)}</div>
                    <div className="mt-0.5 text-xs text-slate-500">{contacts} contacts · {formatNumber(row.contacted_leads)} leads</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">{contacts >= 5 ? `${numberValue(row.successful_contact_rate_pct).toFixed(0)}%` : "—"}</div>
                    <div className="text-[10px] text-slate-400">{contacts >= 5 ? "marked successful" : "sample too small"}</div>
                  </div>
                </div>
              );
            }) : <div className="text-sm text-slate-500">No timing data recorded yet.</div>}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
          <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-900">
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">Detailed activity</div>
            <h2 className="mt-1 text-base font-semibold text-slate-950 dark:text-white">Most contacted leads</h2>
          </div>
          {highTouchLeads.length ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-900">
              {highTouchLeads.map((row) => <LeadRowView key={row.lead_id} row={row} mode="contacted" />)}
            </div>
          ) : <Empty title="No contacted leads yet" detail="Detailed contact journeys will appear after contacts are recorded." />}
        </div>
      </section>

      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950">
        Contacts marked successful: {markedSuccessPct == null ? "not enough data" : `${markedSuccessPct.toFixed(1)}%`} ({successfulContacts} of {totalContacts} recorded contacts). This is a CRM outcome label, not a sales conversion rate.
      </div>
    </div>
  );
}

function Kpi({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
      <div className="text-[11px] font-semibold text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950 dark:text-white">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{detail}</div>
    </div>
  );
}

function LeadRowView({ row, mode }: { row: LeadRow; mode: "uncontacted" | "contacted" }) {
  return (
    <Link href={`/leads/${row.lead_id}`} className="group flex items-center gap-4 px-5 py-4 transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-300"><ContactRound size={15} /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">{row.lead_name || row.lead_code || "Lead"}</span>
        <span className="mt-0.5 block truncate text-xs text-slate-500">{[row.lead_code, row.course_name, row.owner_name || "Unassigned"].filter(Boolean).join(" · ")}</span>
      </span>
      <span className="text-right">
        <span className="block text-sm font-semibold text-slate-900 dark:text-white">{mode === "contacted" ? formatNumber(row.total_contacts) : pretty(row.current_stage || "new")}</span>
        <span className="block text-[10px] text-slate-400">{mode === "contacted" ? "contacts" : "stage"}</span>
      </span>
      <ArrowRight size={14} className="text-slate-300 transition group-hover:translate-x-0.5" />
    </Link>
  );
}

function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="px-5 py-9">
      <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</div>
      <div className="mt-1 text-sm text-slate-500">{detail}</div>
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
