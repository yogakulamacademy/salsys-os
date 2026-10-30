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
  id: string;
  status: string | null;
  created_at: string | null;
};

type IdentifierRow = {
  person_id: string;
  identifier_type: string;
  verified: boolean;
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

  // Keep the Customer index on lightweight canonical tables. The richer
  // Person 360 views are intentionally reserved for one-customer detail reads;
  // loading the operational aggregate for the full tenant can exceed the
  // database statement timeout as the workspace grows.
  const [linksResult, personsResult, identifiersResult] = await Promise.all([
    supabase
      .from("person_leads")
      .select("person_id,lead_id,resolution_method,confidence")
      .eq("organization_id", organizationId),
    supabase
      .from("persons")
      .select("id,status,created_at")
      .eq("organization_id", organizationId),
    supabase
      .from("person_identifiers")
      .select("person_id,identifier_type,verified")
      .eq("organization_id", organizationId)
      .eq("verified", true),
  ]);

  if (linksResult.error) {
    throw new Error(`Unable to load customer identity links: ${linksResult.error.message}`);
  }
  if (personsResult.error) {
    throw new Error(`Unable to load customer records: ${personsResult.error.message}`);
  }
  if (identifiersResult.error) {
    throw new Error(`Unable to load customer identity evidence: ${identifiersResult.error.message}`);
  }

  const links = ((linksResult.data ?? []) as PersonLinkRow[]).filter((row) =>
    accessibleLeadIds.has(row.lead_id),
  );
  const accessiblePersonIds = new Set(links.map((row) => row.person_id).filter(Boolean));
  const persons = ((personsResult.data ?? []) as PersonRow[]).filter((row) =>
    accessiblePersonIds.has(row.id),
  );
  const verifiedIdentifiers = ((identifiersResult.data ?? []) as IdentifierRow[]).filter((row) =>
    accessiblePersonIds.has(row.person_id),
  );

  const leadById = new Map(leads.map((lead) => [lead.id, lead]));
  const linksByPerson = new Map<string, PersonLinkRow[]>();
  const identifiersByPerson = new Map<string, IdentifierRow[]>();

  for (const link of links) {
    const current = linksByPerson.get(link.person_id) ?? [];
    current.push(link);
    linksByPerson.set(link.person_id, current);
  }

  for (const identifier of verifiedIdentifiers) {
    const current = identifiersByPerson.get(identifier.person_id) ?? [];
    current.push(identifier);
    identifiersByPerson.set(identifier.person_id, current);
  }

  const customers = persons
    .map((person) => {
      const linked = linksByPerson.get(person.id) ?? [];
      const accessibleLeads = linked
        .map((link) => leadById.get(link.lead_id))
        .filter((lead): lead is NonNullable<typeof lead> => Boolean(lead));

      const openLead = accessibleLeads.find(
        (lead) => !["enrolled", "closed_won", "lost", "unqualified", "duplicate"].includes(lead.stage),
      );
      const latestLead = openLead ?? accessibleLeads[0] ?? null;
      const firstOpportunityAt = accessibleLeads
        .map((lead) => lead.createdAt)
        .filter(Boolean)
        .sort()[0] ?? person.created_at;

      return {
        person,
        accessibleLeads,
        latestLead,
        firstOpportunityAt,
        verifiedIdentifiers: identifiersByPerson.get(person.id) ?? [],
      };
    })
    .filter((row) => row.accessibleLeads.length > 0)
    .sort((a, b) => {
      const aTime = new Date(a.latestLead?.createdAt ?? a.person.created_at ?? 0).getTime();
      const bTime = new Date(b.latestLead?.createdAt ?? b.person.created_at ?? 0).getTime();
      return bTime - aTime;
    });

  const linkedLeadIds = new Set(links.map((row) => row.lead_id));
  const unlinkedLeads = leads.filter((lead) => !linkedLeadIds.has(lead.id));
  const multiOpportunity = customers.filter((row) => row.accessibleLeads.length > 1).length;
  const activeOpportunities = leads.filter(
    (lead) => !["enrolled", "closed_won", "lost", "unqualified", "duplicate"].includes(lead.stage),
  ).length;
  const verifiedIdentity = customers.filter((row) => row.verifiedIdentifiers.length > 0).length;

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
                <Header>Identity evidence</Header>
                <th className="w-28 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {customers.length ? (
                customers.map(({ person, accessibleLeads, latestLead, firstOpportunityAt, verifiedIdentifiers }) => {
                  const displayName = latestLead?.name || "Customer";
                  const identifierTypes = [...new Set(verifiedIdentifiers.map((row) => pretty(row.identifier_type)))];

                  return (
                    <tr key={person.id} className="border-b border-line last:border-b-0 hover:bg-surface-soft/70">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-[10px] font-bold text-brand-700">
                            {initials(displayName)}
                          </span>
                          <div className="min-w-0">
                            <div className="max-w-[220px] truncate text-[12px] font-semibold text-copy-strong">{displayName}</div>
                            <div className="mt-0.5 text-[10px] text-copy-subtle">Contact status · {pretty(person.status || "active")}</div>
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
                        <div>Since {formatDate(firstOpportunityAt)}</div>
                        <div className="mt-0.5 text-copy-subtle">Owner · {latestLead?.owner || "Unassigned"}</div>
                      </td>
                      <td className="px-4 py-3.5 text-[11px] text-copy-muted">
                        {verifiedIdentifiers.length ? (
                          <>
                            <div>{verifiedIdentifiers.length} verified identifier{verifiedIdentifiers.length === 1 ? "" : "s"}</div>
                            <div className="mt-0.5 text-copy-subtle">{identifierTypes.slice(0, 2).join(" · ") || "Verified identity"}</div>
                          </>
                        ) : (
                          <>
                            <div>No verified identifier</div>
                            <div className="mt-0.5 text-copy-subtle">Identity remains evidence-limited</div>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <Link
                          href={`/customer-360/${person.id}${latestLead ? `?opportunity=${latestLead.id}` : ""}`}
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
