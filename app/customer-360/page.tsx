import Link from "next/link";
import { Search } from "lucide-react";

import { ActionCards, initialsOf } from "@/components/crm/action-cards";
import { EmptyState, PageHeader } from "@/components/ui";
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

type Customer360SearchParams = Promise<{ view?: string | string[]; q?: string | string[] }>;

const CHANNEL_DOT: Record<string, string> = {
  instagram: "bg-pink-500", whatsapp: "bg-emerald-500", website: "bg-blue-500", email: "bg-slate-400",
};

export default async function Customer360Page({ searchParams }: { searchParams?: Customer360SearchParams }) {
  const params = (await searchParams) ?? {};
  const view = ["confirmed", "unconfirmed", "multi"].includes(String(one(params.view))) ? String(one(params.view)) : "all";
  const q = String(one(params.q) ?? "").trim().toLowerCase();
  const leads = await getLeads();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const organizationId = await requireCurrentOrganizationId(supabase, user.id);
  const accessibleLeadIds = new Set(leads.map((lead) => lead.id));
  const warnings: string[] = [];

  // Keep the Customer index on lightweight canonical tables. Rich Person 360
  // views are reserved for one-customer detail reads so a large tenant cannot
  // time out the entire customer list.
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

  if (linksResult.error) warnings.push("Customer identity links are temporarily unavailable.");
  if (personsResult.error) warnings.push("Customer profile status is temporarily unavailable.");
  if (identifiersResult.error) warnings.push("Verified identity evidence is temporarily unavailable.");

  const links = (((linksResult.error ? [] : linksResult.data) ?? []) as PersonLinkRow[]).filter((row) =>
    accessibleLeadIds.has(row.lead_id),
  );
  const accessiblePersonIds = new Set(links.map((row) => row.person_id).filter(Boolean));

  // If the lightweight persons read degrades, keep the page usable by deriving
  // minimal Contact shells from the already-authorized identity links.
  const persons = personsResult.error
    ? [...accessiblePersonIds].map((id) => ({ id, status: null, created_at: null } as PersonRow))
    : ((personsResult.data ?? []) as PersonRow[]).filter((row) => accessiblePersonIds.has(row.id));

  const verifiedIdentifiers = identifiersResult.error
    ? []
    : ((identifiersResult.data ?? []) as IdentifierRow[]).filter((row) =>
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
  const multiCourse = customers.filter((row) => new Set(row.accessibleLeads.map((lead) => lead.course).filter(Boolean)).size > 1).length;
  const activeOpportunities = leads.filter(
    (lead) => !["enrolled", "closed_won", "lost", "unqualified", "duplicate"].includes(lead.stage),
  ).length;
  const verifiedIdentity = customers.filter((row) => row.verifiedIdentifiers.length > 0).length;

  const shown = customers.filter((row) => {
    if (view === "confirmed" && !row.verifiedIdentifiers.length) return false;
    if (view === "unconfirmed" && row.verifiedIdentifiers.length) return false;
    if (view === "multi" && new Set(row.accessibleLeads.map((lead) => lead.course).filter(Boolean)).size < 2) return false;
    if (q) {
      const haystack = row.accessibleLeads
        .map((lead) => [lead.name, lead.email, lead.phone, lead.course, lead.leadCode].filter(Boolean).join(" "))
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const tabs: { key: string; label: string; count: number }[] = [
    { key: "all", label: "All people", count: customers.length },
    { key: "confirmed", label: "Confirmed", count: verifiedIdentity },
    { key: "unconfirmed", label: "Not confirmed", count: customers.length - verifiedIdentity },
    { key: "multi", label: "2+ courses", count: multiCourse },
  ];
  const tabHref = (key: string) => {
    const search = new URLSearchParams();
    if (key !== "all") search.set("view", key);
    if (q) search.set("q", q);
    const text = search.toString();
    return text ? `/customer-360?${text}` : "/customer-360";
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Customer 360"
        description={
          <span className="text-[15px] leading-7 text-copy">
            Each person once, with all their enquiries.{" "}
            <strong className="font-semibold text-copy-strong">{customers.length.toLocaleString("en-IN")} people</strong>:{" "}
            <strong className="font-semibold text-copy-strong">{verifiedIdentity.toLocaleString("en-IN")} have a confirmed identity</strong>
            {multiCourse ? <> and <strong className="font-semibold text-copy-strong">{multiCourse.toLocaleString("en-IN")} asked about more than one course</strong>.</> : " and none has asked about more than one course yet."}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <Link href="/leads" className="btn-secondary">
              <Search size={14} /> Find a person
            </Link>
            <Link href="/data-quality" className="btn-secondary">
              Data quality
            </Link>
          </div>
        }
      />

      {warnings.length ? (
        <section className="rounded-xl bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900 dark:bg-amber-950/25 dark:text-amber-100">
          <strong>Some customer data didn&apos;t load.</strong> {warnings.join(" ")} Leads are still available.
        </section>
      ) : null}

      {customers.length > 0 ? (
        <ActionCards
          label="Customer overview"
          items={[
            { count: customers.length, title: "People", detail: "One record each, with all their enquiries", cta: "View", href: "/customer-360", tone: "brand" },
            { count: activeOpportunities, title: "Open enquiries", detail: "Across everyone in the CRM", cta: "Leads", href: "/leads", tone: "neutral" },
            { count: verifiedIdentity, title: "Identity confirmed", detail: "Instagram ID, phone or email", cta: "View", href: "/customer-360?view=confirmed", tone: "money" },
            { count: multiCourse, title: "Asked about 2+ courses", detail: "Repeat interest across courses", cta: "View", href: "/customer-360?view=multi", tone: "attention" },
          ]}
        />
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <nav aria-label="Customer views" className="flex flex-wrap items-center gap-1 self-start rounded-xl bg-surface-soft p-1">
            {tabs.map((tab) => (
              <Link
                key={tab.key}
                href={tabHref(tab.key)}
                aria-current={view === tab.key ? "page" : undefined}
                className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition ${view === tab.key ? "bg-brand-700 text-white shadow-sm" : "text-copy-muted hover:bg-surface hover:text-copy-strong"}`}
              >
                {tab.label}
                <span className={`text-[12px] tabular-nums ${view === tab.key ? "text-white/85" : "text-copy-subtle"}`}>{tab.count.toLocaleString("en-IN")}</span>
              </Link>
            ))}
          </nav>
          <form action="/customer-360" className="relative w-full lg:w-[320px]">
            {view !== "all" ? <input type="hidden" name="view" value={view} /> : null}
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-copy-subtle" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search name, phone, email…"
              aria-label="Search people"
              className="h-10 w-full rounded-ui border border-line bg-surface pl-9 pr-3 text-[13px] text-copy outline-none placeholder:text-copy-subtle focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </form>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] border-collapse">
            <thead>
              <tr className="border-b border-line text-left">
                <Header>Person</Header>
                <Header>Interested in</Header>
                <Header>Stage</Header>
                <Header>Enquiries</Header>
                <Header>Identity</Header>
                <Header>Known</Header>
                <Header>Owner</Header>
                <th className="w-24 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {shown.length ? (
                shown.map(({ person, accessibleLeads, latestLead, firstOpportunityAt, verifiedIdentifiers }) => {
                  const displayName = latestLead?.name || "Customer";
                  const identifierTypes = [...new Set(verifiedIdentifiers.map((row) => pretty(row.identifier_type)))];
                  const channel = String(latestLead?.currentContactChannel || "").toLowerCase();
                  const href = `/customer-360/${person.id}${latestLead ? `?opportunity=${latestLead.id}` : ""}`;

                  return (
                    <tr key={person.id} className="border-b border-line last:border-b-0 hover:bg-surface-soft/70">
                      <td className="px-4 py-3">
                        <Link href={href} className="flex items-center gap-3">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-[12px] font-bold text-brand-700">{initialsOf(displayName)}</span>
                          <span className="min-w-0">
                            <span className="block max-w-[240px] truncate text-[14px] font-semibold text-copy-strong">{displayName}</span>
                            {channel ? (
                              <span className="flex items-center gap-1.5 text-[12px] text-copy-muted">
                                <span className={`h-1.5 w-1.5 rounded-full ${CHANNEL_DOT[channel] ?? "bg-slate-400"}`} aria-hidden="true" />
                                {pretty(channel)}
                              </span>
                            ) : null}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-[13px]">
                        {latestLead?.course && !/^(not selected|unknown)$/i.test(latestLead.course)
                          ? <span className="text-copy-strong">{latestLead.course}</span>
                          : <span className="font-medium text-amber-700 dark:text-amber-300">Course not known yet</span>}
                      </td>
                      <td className="px-4 py-3">{latestLead ? <Pill>{pretty(latestLead.stage)}</Pill> : null}</td>
                      <td className="px-4 py-3 text-[13px] text-copy">{accessibleLeads.length} {accessibleLeads.length === 1 ? "enquiry" : "enquiries"}</td>
                      <td className="px-4 py-3">
                        {verifiedIdentifiers.length ? (
                          <span className="rounded-lg bg-emerald-50 px-2 py-1 text-[12px] font-semibold text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                            Confirmed{identifierTypes[0] ? ` · ${identifierTypes[0]}` : ""}
                          </span>
                        ) : (
                          <span className="rounded-lg bg-surface-muted px-2 py-1 text-[12px] font-semibold text-copy-muted">Not confirmed</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-copy">Since {formatShortDate(firstOpportunityAt)}</td>
                      <td className="px-4 py-3 text-[13px]">
                        {latestLead?.owner && !/^(unassigned|—|-)$/i.test(latestLead.owner.trim()) ? <span className="text-copy">{latestLead.owner}</span> : <Link href={`/leads/${latestLead?.id ?? ""}`} className="font-semibold text-brand-700 hover:underline">+ Assign</Link>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={href} className="inline-flex h-8 items-center rounded-lg bg-brand-50 px-3 text-[13px] font-semibold text-brand-700 transition hover:bg-brand-100">
                          Open
                        </Link>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8}>
                    <EmptyState title={warnings.length ? "Customer profiles are temporarily unavailable" : q || view !== "all" ? "No one matches this view" : "No customer profiles available"} description={warnings.length ? "Some identity data could not be loaded. Your accessible enquiries remain available in Leads." : q || view !== "all" ? "Try another view or search." : "Profiles appear when enquiries are linked to customer identities. Your enquiries remain available in Leads."} action={<Link href={q || view !== "all" ? "/customer-360" : "/leads"} className="btn-secondary">{q || view !== "all" ? "Show everyone" : "Open leads"}</Link>} />
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


function Header({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-copy-muted">{children}</th>;
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[12px] font-semibold text-brand-700">{children}</span>;
}


function pretty(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}


function formatShortDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(date);
}

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
