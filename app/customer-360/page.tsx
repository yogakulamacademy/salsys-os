import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
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
import type { LeadOverview } from "@/types/crm";

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

type RelationshipSignal = {
  label: string;
  reason: string;
  tone: "attention" | "priority" | "active" | "settled" | "neutral";
  rank: number;
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
        .filter((lead): lead is LeadOverview => Boolean(lead));

      const openLeads = accessibleLeads.filter(isOpenOpportunity);
      const openLead = pickCurrentOpportunity(openLeads);
      const latestLead = openLead ?? newestOpportunity(accessibleLeads) ?? null;
      const firstOpportunityAt = accessibleLeads
        .map((lead) => lead.createdAt)
        .filter(Boolean)
        .sort()[0] ?? person.created_at;
      const lastContactAt = latestTimestamp(accessibleLeads.map((lead) => lead.lastContactedAt));
      const nextFollowupAt = earliestTimestamp(accessibleLeads.map((lead) => lead.nextFollowupAt));
      const verified = identifiersByPerson.get(person.id) ?? [];
      const signal = relationshipSignal(accessibleLeads, openLeads, lastContactAt, nextFollowupAt);

      return {
        person,
        accessibleLeads,
        openLeads,
        latestLead,
        firstOpportunityAt,
        lastContactAt,
        nextFollowupAt,
        verifiedIdentifiers: verified,
        signal,
      };
    })
    .filter((row) => row.accessibleLeads.length > 0)
    .sort((a, b) => {
      if (a.signal.rank !== b.signal.rank) return a.signal.rank - b.signal.rank;
      const aTime = new Date(a.lastContactAt ?? a.latestLead?.createdAt ?? a.person.created_at ?? 0).getTime();
      const bTime = new Date(b.lastContactAt ?? b.latestLead?.createdAt ?? b.person.created_at ?? 0).getTime();
      return bTime - aTime;
    });

  const linkedLeadIds = new Set(links.map((row) => row.lead_id));
  const unlinkedLeads = leads.filter((lead) => !linkedLeadIds.has(lead.id));
  const multiOpportunity = customers.filter((row) => row.accessibleLeads.length > 1).length;
  const activeOpportunities = leads.filter(isOpenOpportunity).length;
  const verifiedIdentity = customers.filter((row) => row.verifiedIdentifiers.length > 0).length;
  const attentionRelationships = customers.filter((row) => row.signal.tone === "attention").length;
  const priorityRelationships = customers.filter((row) => row.signal.tone === "priority").length;
  const unassignedOpen = customers.filter((row) => row.openLeads.some((lead) => !lead.owner)).length;
  const identityCoverage = customers.length ? Math.round((verifiedIdentity / customers.length) * 1000) / 10 : null;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sales · Customers"
        title="Customer 360"
        description="One relationship record per Contact, with explainable attention signals and linked Opportunities kept separate for stage, intent, ownership and commercial action."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/opportunities" className="btn-secondary">
              <Search size={14} /> Find opportunity
            </Link>
            <Link href="/opportunities?surface=quality" className="btn-primary">
              Data quality <ArrowRight size={13} />
            </Link>
          </div>
        }
      />

      {warnings.length ? (
        <section className="rounded-panel border border-amber-200 bg-amber-50/70 px-4 py-3 text-amber-900">
          <div className="text-xs font-semibold">Customer 360 is partially degraded</div>
          <div className="mt-1 text-[11px] text-amber-700">{warnings.join(" ")} Core Sales records remain available.</div>
        </section>
      ) : null}

      <section className="grid gap-4 rounded-panel border border-line bg-surface p-5 shadow-xs xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,.85fr)] xl:items-center">
        <div>
          <div className="eyebrow">Relationship brief</div>
          <h2 className="mt-1 text-[20px] font-semibold tracking-tight text-copy-strong">
            {relationshipHeadline(attentionRelationships, priorityRelationships)}
          </h2>
          <p className="mt-2 max-w-3xl text-[12px] leading-6 text-copy-muted">
            {relationshipBrief({
              attentionRelationships,
              priorityRelationships,
              unassignedOpen,
              unlinkedLeads: unlinkedLeads.length,
              identityCoverage,
            })}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {attentionRelationships > 0 ? (
              <Link href="#relationships" className="btn-primary">
                Review attention relationships <ArrowRight size={13} />
              </Link>
            ) : (
              <Link href="/opportunities" className="btn-primary">
                Review opportunities <ArrowRight size={13} />
              </Link>
            )}
            <Link href="/opportunities?owner=unassigned" className="btn-secondary">
              <UserRoundCheck size={14} /> Ownership gaps
            </Link>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <BriefEvidence
            icon={<AlertTriangle size={14} />}
            label="Needs attention"
            value={attentionRelationships.toLocaleString("en-IN")}
            note="Overdue follow-up relationships"
            attention={attentionRelationships > 0}
          />
          <BriefEvidence
            icon={<ContactRound size={14} />}
            label="High-intent open"
            value={priorityRelationships.toLocaleString("en-IN")}
            note="High/very-high intent or high-intent/payment stage"
            attention={priorityRelationships > 0}
          />
          <BriefEvidence
            icon={<UserRoundCheck size={14} />}
            label="Open without owner"
            value={unassignedOpen.toLocaleString("en-IN")}
            note="Relationship contains an unassigned open opportunity"
            attention={unassignedOpen > 0}
          />
          <BriefEvidence
            icon={<ShieldCheck size={14} />}
            label="Verified identity coverage"
            value={identityCoverage == null ? "—" : `${identityCoverage}%`}
            note="Contacts with at least one verified identifier"
          />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<UsersRound size={17} />} label="Contacts" value={customers.length} note="Canonical Person records visible here" />
        <Metric icon={<ContactRound size={17} />} label="Active opportunities" value={activeOpportunities} note="Open sales opportunities across contacts" />
        <Metric icon={<UserRoundCheck size={17} />} label="Multi-opportunity" value={multiOpportunity} note="Contacts with more than one accessible opportunity" />
        <Metric icon={<ShieldCheck size={17} />} label="Verified identity" value={verifiedIdentity} note="Contacts with verified identifiers" />
      </section>

      <section className="overflow-hidden rounded-panel border border-line bg-surface shadow-xs" id="relationships">
        <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="eyebrow">Relationship records</div>
            <h2 className="section-title mt-1">Contacts ordered by attention</h2>
            <p className="mt-1 text-xs text-copy-subtle">
              Attention comes from visible CRM evidence: overdue follow-up first, then high-intent open work, then normal active or settled relationships. No hidden health score is used.
            </p>
          </div>
          <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[10px] font-semibold text-brand-700">
            {customers.length.toLocaleString("en-IN")} contacts
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] border-collapse">
            <thead>
              <tr className="border-b border-line bg-surface-soft text-left">
                <Header>Contact</Header>
                <Header>Relationship state</Header>
                <Header>Opportunities</Header>
                <Header>Current context</Header>
                <Header>Last / next action</Header>
                <Header>Identity evidence</Header>
                <th className="w-28 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {customers.length ? (
                customers.map(({ person, accessibleLeads, openLeads, latestLead, firstOpportunityAt, lastContactAt, nextFollowupAt, verifiedIdentifiers, signal }) => {
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
                            <div className="mt-0.5 text-[10px] text-copy-subtle">Relationship since {formatDate(firstOpportunityAt)}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <RelationshipPill signal={signal} />
                        <div className="mt-1 max-w-[230px] text-[10px] leading-4 text-copy-subtle">{signal.reason}</div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="text-[12px] font-semibold text-copy-strong">{accessibleLeads.length}</div>
                        <div className="mt-0.5 text-[10px] text-copy-subtle">{openLeads.length} currently open</div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="text-[11px] font-medium text-copy">{latestLead?.course || "No course selected"}</div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {latestLead ? <Pill>{pretty(latestLead.stage)}</Pill> : null}
                          {latestLead?.intent ? <Pill>{pretty(latestLead.intent)} intent</Pill> : null}
                          {latestLead?.owner ? <Pill>{latestLead.owner}</Pill> : openLeads.length ? <AttentionPill>Unassigned</AttentionPill> : null}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-[11px] text-copy-muted">
                        <div className="flex items-center gap-1.5"><Clock3 size={12} /> Last contact · {formatRelative(lastContactAt)}</div>
                        <div className={`mt-1 ${isPast(nextFollowupAt) ? "font-semibold text-amber-700" : "text-copy-subtle"}`}>
                          Next follow-up · {nextFollowupAt ? formatDateTime(nextFollowupAt) : "Not scheduled"}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-[11px] text-copy-muted">
                        {verifiedIdentifiers.length ? (
                          <>
                            <div className="flex items-center gap-1.5 font-medium text-emerald-700"><CheckCircle2 size={12} /> {verifiedIdentifiers.length} verified</div>
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
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <UsersRound size={20} className="mx-auto text-copy-subtle" />
                    <div className="mt-2 text-sm font-semibold text-copy-strong">No canonical customer records are available</div>
                    <div className="mt-1 text-xs text-copy-subtle">Use Opportunities while identity resolution data is unavailable or no Person links exist yet.</div>
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
          <div className="mt-1 text-[11px] text-amber-700">They remain available in Opportunities; Customer 360 will not guess identity from names alone.</div>
          <Link href="/opportunities?surface=quality" className="mt-3 inline-flex items-center gap-1 text-[10px] font-semibold text-amber-900 hover:underline">
            Review identity quality <ArrowRight size={11} />
          </Link>
        </section>
      ) : null}
    </div>
  );
}

function relationshipSignal(
  allLeads: LeadOverview[],
  openLeads: LeadOverview[],
  lastContactAt: string | null,
  nextFollowupAt: string | null,
): RelationshipSignal {
  if (isPast(nextFollowupAt)) {
    return {
      label: "Follow-up overdue",
      reason: `A scheduled follow-up is already overdue${nextFollowupAt ? ` by ${formatAge(nextFollowupAt)}` : ""}.`,
      tone: "attention",
      rank: 0,
    };
  }

  const highIntent = openLeads.some(
    (lead) =>
      lead.intent === "high" ||
      lead.intent === "very_high" ||
      lead.stage === "high_intent" ||
      lead.stage === "payment_pending",
  );
  if (highIntent) {
    return {
      label: "High-intent open",
      reason: lastContactAt
        ? `An open opportunity has high-intent evidence; last contact was ${formatRelative(lastContactAt)}.`
        : "An open opportunity has high-intent evidence but no last-contact timestamp is recorded.",
      tone: "priority",
      rank: 1,
    };
  }

  const unassigned = openLeads.some((lead) => !lead.owner);
  if (unassigned) {
    return {
      label: "Ownership gap",
      reason: "At least one open opportunity has no recorded owner.",
      tone: "attention",
      rank: 2,
    };
  }

  if (openLeads.length) {
    return {
      label: "Active relationship",
      reason: lastContactAt
        ? `${openLeads.length} open opportunit${openLeads.length === 1 ? "y" : "ies"}; last contact ${formatRelative(lastContactAt)}.`
        : `${openLeads.length} open opportunit${openLeads.length === 1 ? "y" : "ies"}; no last-contact timestamp is recorded.`,
      tone: "active",
      rank: 3,
    };
  }

  const enrolled = allLeads.some((lead) => lead.stage === "enrolled");
  if (enrolled) {
    return {
      label: "Enrolled relationship",
      reason: "No open opportunity is recorded and at least one linked opportunity is enrolled.",
      tone: "settled",
      rank: 4,
    };
  }

  return {
    label: "No open opportunity",
    reason: "All linked opportunities are currently closed, paused or otherwise not active.",
    tone: "neutral",
    rank: 5,
  };
}

function pickCurrentOpportunity(rows: LeadOverview[]) {
  return rows
    .slice()
    .sort((left, right) => opportunityPriority(right) - opportunityPriority(left) || timestamp(right.createdAt) - timestamp(left.createdAt))[0] ?? null;
}

function newestOpportunity(rows: LeadOverview[]) {
  return rows.slice().sort((left, right) => timestamp(right.createdAt) - timestamp(left.createdAt))[0] ?? null;
}

function opportunityPriority(lead: LeadOverview) {
  if (lead.stage === "payment_pending") return 5;
  if (lead.stage === "high_intent" || lead.intent === "very_high") return 4;
  if (lead.stage === "qualified" || lead.intent === "high") return 3;
  if (lead.stage === "engaged") return 2;
  return 1;
}

function isOpenOpportunity(lead: LeadOverview) {
  return !["enrolled", "closed_won", "lost", "unqualified", "duplicate", "not_now"].includes(lead.stage);
}

function latestTimestamp(values: Array<string | undefined>) {
  const valid = values.filter((value): value is string => Boolean(value) && Number.isFinite(timestamp(value)));
  return valid.slice().sort((left, right) => timestamp(right) - timestamp(left))[0] ?? null;
}

function earliestTimestamp(values: Array<string | undefined>) {
  const valid = values.filter((value): value is string => Boolean(value) && Number.isFinite(timestamp(value)));
  return valid.slice().sort((left, right) => timestamp(left) - timestamp(right))[0] ?? null;
}

function relationshipHeadline(attention: number, priority: number) {
  if (attention > 0) return `${attention.toLocaleString("en-IN")} customer relationship${attention === 1 ? " needs" : "s need"} attention.`;
  if (priority > 0) return `${priority.toLocaleString("en-IN")} high-intent relationship${priority === 1 ? " is" : "s are"} active.`;
  return "No relationship-level urgency is visible in the current CRM evidence.";
}

function relationshipBrief({
  attentionRelationships,
  priorityRelationships,
  unassignedOpen,
  unlinkedLeads,
  identityCoverage,
}: {
  attentionRelationships: number;
  priorityRelationships: number;
  unassignedOpen: number;
  unlinkedLeads: number;
  identityCoverage: number | null;
}) {
  const parts: string[] = [];
  if (attentionRelationships) parts.push(`${attentionRelationships} overdue/ownership attention relationship${attentionRelationships === 1 ? "" : "s"}`);
  if (priorityRelationships) parts.push(`${priorityRelationships} high-intent open relationship${priorityRelationships === 1 ? "" : "s"}`);
  if (unassignedOpen) parts.push(`${unassignedOpen} relationship${unassignedOpen === 1 ? " contains" : "s contain"} unassigned open work`);
  if (unlinkedLeads) parts.push(`${unlinkedLeads} opportunit${unlinkedLeads === 1 ? "y is" : "ies are"} not linked to a canonical Contact`);
  if (identityCoverage != null) parts.push(`${identityCoverage}% verified-identity coverage`);

  return parts.length
    ? `${parts.join(" · ")}. Relationship states are labels derived from visible CRM facts, not predictive scores.`
    : "Customer identity and relationship evidence is currently limited; SalsysOS will not infer relationship quality from names or unsupported signals.";
}

function RelationshipPill({ signal }: { signal: RelationshipSignal }) {
  const className = signal.tone === "attention"
    ? "bg-rose-50 text-rose-700"
    : signal.tone === "priority"
      ? "bg-amber-50 text-amber-700"
      : signal.tone === "active"
        ? "bg-brand-50 text-brand-700"
        : signal.tone === "settled"
          ? "bg-emerald-50 text-emerald-700"
          : "bg-surface-soft text-copy-muted";

  return <span className={`inline-flex rounded-full px-2 py-1 text-[9px] font-semibold ${className}`}>{signal.label}</span>;
}

function BriefEvidence({ icon, label, value, note, attention = false }: { icon: React.ReactNode; label: string; value: string; note: string; attention?: boolean }) {
  return (
    <div className={`rounded-ui border p-3.5 ${attention ? "border-amber-200 bg-amber-50/50" : "border-line bg-surface-soft/70"}`}>
      <div className="flex items-center justify-between gap-3 text-copy-subtle"><span className="text-[10px] font-semibold uppercase tracking-[0.08em]">{label}</span>{icon}</div>
      <div className="mt-2 text-[13px] font-semibold text-copy-strong">{value}</div>
      <div className="mt-1 text-[10px] leading-4 text-copy-subtle">{note}</div>
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

function AttentionPill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-amber-50 px-2 py-1 text-[9px] font-semibold text-amber-700">{children}</span>;
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "C";
}

function pretty(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function timestamp(value: string | null | undefined) {
  if (!value) return Number.NaN;
  return new Date(value).getTime();
}

function isPast(value: string | null | undefined) {
  const time = timestamp(value);
  return Number.isFinite(time) && time < Date.now();
}

function formatAge(value: string) {
  const time = timestamp(value);
  if (!Number.isFinite(time)) return "—";
  const elapsedMs = Math.max(0, Date.now() - time);
  const hours = Math.floor(elapsedMs / 3_600_000);
  if (hours < 24) return `${Math.max(1, hours)}h`;
  return `${Math.floor(hours / 24)}d`;
}

function formatRelative(value: string | null | undefined) {
  const time = timestamp(value);
  if (!Number.isFinite(time)) return "not recorded";
  const ageMs = Date.now() - time;
  if (ageMs < 0) return formatDateTime(value!);
  const hours = Math.floor(ageMs / 3_600_000);
  if (hours < 1) return "within the last hour";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(date);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(date);
}
