import Link from "next/link";
import {
  ArrowRight,
  ContactRound,
  Search,
  ShieldCheck,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";

import { PageHeader } from "@/components/ui";
import { getLeads } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";

type PersonLinkRow = {
  person_id: string;
  lead_id: string;
  resolution_method: string | null;
  confidence: number | string | null;
};

type PersonRow = {
  person_id: string;
  person_status: string | null;
  lead_count: number | string | null;
  latest_lead_id: string | null;
  latest_lead_name: string | null;
  current_stage: string | null;
  intent: string | null;
  latest_lead_at: string | null;
  last_message_at: string | null;
  enrollment_count: number | string | null;
  paid_payment_count: number | string | null;
  paid_amount_by_currency: Record<string, number | string> | null;
  verified_identifier_count: number | string | null;
};

export default async function Customer360Page() {
  const leads = await getLeads();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const organizationId = await requireCurrentOrganizationId(supabase, user.id);
  const accessibleLeadIds = new Set(leads.map((lead) => lead.id));

  /*
   * Read the tenant-scoped identity graph once, then intersect it with the
   * already-authorized Lead list in memory. Avoid passing hundreds of UUIDs
   * through PostgREST `in(...)` filters, which can exceed practical request-URL
   * limits for larger workspaces.
   */
  const linksResult = await supabase
    .from("person_leads")
    .select("person_id,lead_id,resolution_method,confidence")
    .eq("organization_id", organizationId);

  if (linksResult.error) {
    throw new Error(`Unable to load customer identity links: ${linksResult.error.message}`);
  }

  const links = ((linksResult.data ?? []) as PersonLinkRow[]).filter((row) =>
    accessibleLeadIds.has(row.lead_id),
  );
  const accessiblePersonIds = new Set(links.map((row) => row.person_id).filter(Boolean));

  /*
   * Same strategy for Person 360: organization-scoped read first, in-memory
   * intersection second. RLS/view permissions remain authoritative while the
   * request stays compact and predictable.
   */
  const personResult = await supabase
    .from("v_person_360_operational")
    .select(
      "person_id,person_status,lead_count,latest_lead_id,latest_lead_name,current_stage,intent,latest_lead_at,last_message_at,enrollment_count,paid_payment_count,paid_amount_by_currency,verified_identifier_count",
    )
    .eq("organization_id", organizationId)
    .order("latest_lead_at", { ascending: false, nullsFirst: false });

  if (personResult.error) {
    throw new Error(`Unable to load Customer 360 records: ${personResult.error.message}`);
  }

  const persons = ((personResult.data ?? []) as PersonRow[]).filter((row) =>
    accessiblePersonIds.has(row.person_id),
  );
  const leadById = new Map(leads.map((lead) => [lead.id, lead]));
  const linksByPerson = new Map<string, PersonLinkRow[]>();

  for (const link of links) {
    const current = linksByPerson.get(link.person_id) ?? [];
    current.push(link);
    linksByPerson.set(link.person_id, current);
  }

  const customers = persons.map((person) => {
    const linked = linksByPerson.get(person.person_id) ?? [];
    const accessibleLeads = linked
      .map((link) => leadById.get(link.lead_id))
      .filter((lead): lead is NonNullable<typeof lead> => Boolean(lead));
    const latestLead =
      accessibleLeads.find((lead) => lead.id === person.latest_lead_id) ??
      accessibleLeads[0] ??
      null;

    return { person, accessibleLeads, latestLead };
  });

  const linkedLeadIds = new Set(links.map((row) => row.lead_id));
  const unlinkedLeads = leads.filter((lead) => !linkedLeadIds.has(lead.id));
  const multiOpportunity = customers.filter((row) => row.accessibleLeads.length > 1).length;
  const activeOpportunities = leads.filter(
    (lead) => !["enrolled", "closed_won", "lost", "unqualified", "duplicate"].includes(lead.stage),
  ).length;
  const verifiedIdentity = customers.filter(
    ({ person }) => Number(person.verified_identifier_count ?? 0) > 0,
  ).length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sales · Customers"
        title="Customer 360"
        description="One relationship record per Contact, with linked Opportunities kept separate for stage, intent, ownership and commercial action."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/leads" className="btn-secondary">
              <Search size={14} /> Find opportunity
            </Link>
            <Link href="/data-quality" className="btn-primary">
              Data quality <ArrowRight size={13} />
            </Link>
          </div>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<UsersRound size={17} />} label="Contacts" value={customers.length} note="Canonical Person records visible here" />
        <Metric icon={<ContactRound size={17} />} label="Active opportunities" value={activeOpportunities} note="Open sales opportunities across contacts" />
        <Metric icon={<UserRoundCheck size={17} />} label="Multi-opportunity" value={multiOpportunity} note="Contacts with more than one accessible opportunity" />
        <Metric icon={<ShieldCheck size={17} />} label="Verified identity" value={verifiedIdentity} note="Contacts with verified identifiers" />
      </section>

      <section className="overflow-hidden rounded-panel border border-line bg-surface shadow-xs">
        <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="eyebrow">Relationship records</div>
            <h2 className="section-title mt-1">Contacts and their opportunities</h2>
            <p className="mt-1 text-xs text-copy-subtle">
              Customer identity is grouped by Person. Opportunity stage and commercial context remain on each Lead.
            </p>
          </div>
          <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[10px] font-semibold text-brand-700">
            {customers.length.toLocaleString("en-IN")} contacts
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse">
            <thead>
              <tr className="border-b border-line bg-surface-soft text-left">
                <Header>Contact</Header>
                <Header>Opportunities</Header>
                <Header>Current context</Header>
                <Header>Relationship</Header>
                <Header>Revenue evidence</Header>
                <th className="w-28 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {customers.length ? (
                customers.map(({ person, accessibleLeads, latestLead }) => {
                  const displayName = latestLead?.name || person.latest_lead_name || "Customer";
                  return (
                    <tr key={person.person_id} className="border-b border-line last:border-b-0 hover:bg-surface-soft/70">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-[10px] font-bold text-brand-700">
                            {initials(displayName)}
                          </span>
                          <div className="min-w-0">
                            <div className="max-w-[220px] truncate text-[12px] font-semibold text-copy-strong">{displayName}</div>
                            <div className="mt-0.5 text-[10px] text-copy-subtle">Relationship since {formatDate(person.latest_lead_at)}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="text-[12px] font-semibold text-copy-strong">{accessibleLeads.length}</div>
                        <div className="mt-0.5 text-[10px] text-copy-subtle">{accessibleLeads.length === 1 ? "accessible opportunity" : "accessible opportunities"}</div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="text-[11px] font-medium text-copy">{latestLead?.course || "No course selected"}</div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {latestLead ? <Pill>{pretty(latestLead.stage)}</Pill> : null}
                          {latestLead?.intent ? <Pill>{pretty(latestLead.intent)} intent</Pill> : null}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-[11px] text-copy-muted">
                        <div>{Number(person.enrollment_count ?? 0)} enrollment{Number(person.enrollment_count ?? 0) === 1 ? "" : "s"}</div>
                        <div className="mt-0.5 text-copy-subtle">Last message {formatDate(person.last_message_at)}</div>
                      </td>
                      <td className="px-4 py-3.5 text-[11px] text-copy-muted">
                        <div>{Number(person.paid_payment_count ?? 0)} paid payment{Number(person.paid_payment_count ?? 0) === 1 ? "" : "s"}</div>
                        <div className="mt-0.5 text-copy-subtle">{formatCurrencyMap(person.paid_amount_by_currency)}</div>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <Link
                          href={`/customer-360/${person.person_id}${latestLead ? `?opportunity=${latestLead.id}` : ""}`}
                          className="inline-flex h-8 items-center gap-1.5 rounded-ui border border-line bg-surface px-2.5 text-[11px] font-semibold text-brand-700 transition hover:border-line-strong hover:bg-brand-50"
                        >
                          Open <ArrowRight size={12} />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <UsersRound size={20} className="mx-auto text-copy-subtle" />
                    <div className="mt-2 text-sm font-semibold text-copy-strong">No canonical customer records yet</div>
                    <div className="mt-1 text-xs text-copy-subtle">Accessible leads will appear here once identity resolution links them to a Person.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {unlinkedLeads.length ? (
        <section className="rounded-panel border border-amber-200 bg-amber-50/70 p-4 text-amber-900">
          <div className="text-xs font-semibold">{unlinkedLeads.length} accessible opportunity{unlinkedLeads.length === 1 ? " is" : " are"} not linked to a canonical Contact yet.</div>
          <div className="mt-1 text-[11px] text-amber-700">They remain available in Leads; Customer 360 will not guess identity from names alone.</div>
        </section>
      ) : null}
    </div>
  );
}

function Metric({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: number; note: string }) {
  return (
    <div className="rounded-panel border border-line bg-surface p-4 shadow-xs">
      <div className="flex items-center justify-between gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-ui bg-brand-50 text-brand-700">{icon}</span>
        <span className="text-2xl font-semibold tracking-tight text-copy-strong">{value.toLocaleString("en-IN")}</span>
      </div>
      <div className="mt-3 text-[11px] font-semibold text-copy-strong">{label}</div>
      <div className="mt-1 text-[10px] leading-4 text-copy-subtle">{note}</div>
    </div>
  );
}

function Header({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-[10px] font-medium text-copy-subtle">{children}</th>;
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-brand-50 px-2 py-1 text-[9px] font-semibold text-brand-700">{children}</span>;
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "C";
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

function formatCurrencyMap(value: Record<string, number | string> | null) {
  if (!value || !Object.keys(value).length) return "No collected revenue";
  return Object.entries(value)
    .slice(0, 2)
    .map(([currency, amount]) => `${currency} ${Number(amount || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`)
    .join(" · ");
}
