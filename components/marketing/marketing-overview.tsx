import Link from "next/link";
import {
  Activity,
  ArrowRight,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import type { CampaignWorkspaceRow } from "@/components/campaigns-workspace";
import { getCampaignsWorkspace } from "@/lib/campaigns-data";
import { getFunnelWorkspace } from "@/lib/funnel-data";
import { getRevenueWorkspace } from "@/lib/revenue-data";
import styles from "@/app/marketing/marketing-command-center.module.css";

type UnknownRecord = Record<string, unknown>;

type AcquisitionRow = {
  name: string;
  leads: number;
  qualified: number;
  enrolled: number;
};

type DailySignal = {
  sessions: number;
  leads: number;
  qualified: number;
  enrolled: number;
};

type Movement = {
  current: number;
  previous: number;
  delta: number | null;
};

type AttentionItem = {
  score: number;
  tone: "critical" | "warning" | "positive" | "neutral";
  title: string;
  detail: string;
  href: string;
  label: string;
};

export async function MarketingOverview() {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [campaigns, funnel, revenue] = await Promise.all([
    getCampaignsWorkspace({
      query: "",
      platform: "all",
      outcome: "all",
      sortMode: "spend_desc",
      page: 1,
      pageSize: 50,
    }),
    getFunnelWorkspace(),
    getRevenueWorkspace(currentMonth),
  ]);

  const overview = asRecord(funnel.funnel.overview);
  const sources = normalizeSources(funnel.funnel.sources);
  const totalLeads = positiveNumber(overview.leads, campaigns.summary.leads);
  const qualified = positiveNumber(overview.qualified_leads, campaigns.summary.qualified);
  const enrolled = positiveNumber(overview.enrolled_leads, campaigns.summary.enrolled);
  const traffic = positiveNumber(overview.sessions, campaigns.summary.clicks);
  const highIntent = sumCampaign(campaigns.campaigns, "highIntent");
  const paymentPending = sumCampaign(campaigns.campaigns, "paymentPending");
  const spendInr = campaigns.summary.spendByCurrency.INR ?? 0;
  const revenueInr =
    revenue.totalsByCurrency.find((row) => row.currency.toUpperCase() === "INR")?.actual ??
    campaigns.summary.revenueInr;
  const revenueUsd =
    revenue.totalsByCurrency.find((row) => row.currency.toUpperCase() === "USD")?.actual ??
    campaigns.summary.revenueUsd;
  const roasComplete =
    campaigns.campaigns.length > 0 &&
    campaigns.campaigns.every(
      (row) => row.roas !== null && row.spendCurrency.toUpperCase() === "INR",
    );
  const roas = roasComplete && spendInr > 0 ? revenueInr / spendInr : null;

  const sourceRows = sources.length ? sources : fallbackAcquisition(campaigns.campaigns);
  const maxLeadVolume = Math.max(1, ...sourceRows.map((row) => row.leads));
  const topCampaigns = [...campaigns.campaigns]
    .sort((a, b) => b.enrolled - a.enrolled || b.qualified - a.qualified || b.leads - a.leads)
    .slice(0, 4);
  const poorCampaign = campaigns.campaigns
    .filter((row) => row.spend > 0 && row.qualified === 0)
    .sort((a, b) => b.spend - a.spend)[0];
  const missingRoas = campaigns.campaigns.filter(
    (row) => row.spend > 0 && row.roas === null,
  ).length;
  const strongest = [...campaigns.campaigns]
    .filter((row) => row.cac !== null && row.enrolled > 0)
    .sort(
      (a, b) =>
        (a.cac ?? Number.POSITIVE_INFINITY) -
        (b.cac ?? Number.POSITIVE_INFINITY),
    )[0];

  const movement = buildMovement(funnel.funnel.daily);
  const evidenceKnown =
    campaigns.summary.campaigns > 0
      ? Math.max(0, campaigns.summary.campaigns - missingRoas)
      : 0;
  const evidenceCoverage =
    campaigns.summary.campaigns > 0
      ? (evidenceKnown / campaigns.summary.campaigns) * 100
      : null;
  const attention = buildAttentionQueue({
    poorCampaign,
    missingRoas,
    strongest,
    movement,
    campaignCount: campaigns.summary.campaigns,
  });
  const topAttention = attention[0] ?? null;
  const warnings = [campaigns.warning, funnel.warning, revenue.warning].filter(Boolean) as string[];

  return (
    <div className={styles.page}>
      {warnings.length ? <div className={styles.warning}>{warnings[0]}</div> : null}

      <section className={styles.pulse} aria-label="Marketing performance summary">
        <Pulse label="Spend" value={formatMoney(spendInr, "INR", true)} note="Advertising spend · INR" />
        <Pulse label="Leads" value={formatNumber(totalLeads)} note="Observed CRM leads" />
        <Pulse label="Qualified" value={formatNumber(qualified)} note={`${formatPercent(qualified, totalLeads)} of leads`} />
        <Pulse label="Enrolled" value={formatNumber(enrolled)} note={`${formatPercent(enrolled, totalLeads)} of leads`} />
        <Pulse
          label="Revenue"
          value={formatMoney(revenueInr, "INR", true)}
          note={
            revenueUsd > 0
              ? `Plus ${formatMoney(revenueUsd, "USD", true)} · kept separate`
              : "CRM collected · INR"
          }
        />
        <Pulse
          label="Paid ROAS"
          value={roas === null ? "Partial coverage" : `${roas.toFixed(1)}×`}
          note={roas === null ? "Inspect complete campaign evidence" : "Known INR evidence only"}
          partial={roas === null}
        />
      </section>

      <section className={styles.intelligenceStrip} aria-label="Marketing intelligence summary">
        <IntelligenceCard
          icon={
            movement.leads.delta !== null && movement.leads.delta < 0 ? (
              <TrendingDown size={14} />
            ) : (
              <TrendingUp size={14} />
            )
          }
          label="Momentum"
          value={
            movement.leads.delta === null
              ? "Not enough history"
              : formatDelta(movement.leads.delta, "Leads")
          }
          note={
            movement.leads.delta === null
              ? "Daily history is not sufficient for a recent-vs-prior comparison."
              : `${formatNumber(movement.leads.current)} recent leads vs ${formatNumber(movement.leads.previous)} prior.`
          }
          tone={movement.leads.delta !== null && movement.leads.delta < -10 ? "warning" : "positive"}
        />
        <IntelligenceCard
          icon={<ShieldCheck size={14} />}
          label="Evidence quality"
          value={
            evidenceCoverage === null
              ? "Unknown"
              : `${evidenceCoverage.toFixed(0)}% campaign coverage`
          }
          note={
            missingRoas > 0
              ? `${missingRoas} campaign${missingRoas === 1 ? "" : "s"} still lack complete efficiency evidence.`
              : "All campaigns in scope have comparable efficiency evidence."
          }
          tone={missingRoas > 0 ? "warning" : "positive"}
        />
        <IntelligenceCard
          icon={<Activity size={14} />}
          label="Priority now"
          value={topAttention?.title ?? "No urgent action"}
          note={
            topAttention?.detail ??
            "No priority investigation is supported by the current evidence."
          }
          tone={
            topAttention?.tone === "critical" || topAttention?.tone === "warning"
              ? "warning"
              : "neutral"
          }
          href={topAttention?.href}
        />
      </section>

      <div className={styles.grid}>
        <div className={styles.stack}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>Acquisition Mix</h2>
                <p>Volume is a starting point. Quality tells you what follows.</p>
              </div>
              <div className={styles.segmented} aria-label="Acquisition mix view">
                <span>Volume</span><span>Quality</span><span>Revenue</span>
              </div>
            </div>
            <div className={styles.panelBody}>
              <div className={styles.mixHead}>
                <span>Channel</span><span>Lead volume</span><span>Leads</span><span>Qual.</span><span>Enr.</span>
              </div>
              {sourceRows.slice(0, 7).map((row) => (
                <Link
                  href={`/marketing?view=attribution&q=${encodeURIComponent(row.name)}`}
                  className={styles.mixRow}
                  key={row.name}
                >
                  <span className={styles.mixName}><i className={styles.dot} />{row.name}</span>
                  <span className={styles.bar}>
                    <i style={{ width: `${Math.max(row.leads ? 3 : 0, (row.leads / maxLeadVolume) * 100)}%` }} />
                  </span>
                  <strong className={styles.number}>{formatNumber(row.leads)}</strong>
                  <strong className={styles.number}>{formatNumber(row.qualified)}</strong>
                  <strong className={styles.number}>{formatNumber(row.enrolled)}</strong>
                </Link>
              ))}
              <p className={styles.caption}>
                Exact values are shown where observed. Missing source evidence stays Unknown rather than being inferred.
              </p>
            </div>
          </section>

          <section className={`${styles.panel} ${styles.attention}`}>
            <div className={styles.panelHeader}>
              <div><h2>Needs Attention</h2><p>Ranked investigations from current marketing evidence.</p></div>
              <span className={styles.queueCount}>{attention.length} signal{attention.length === 1 ? "" : "s"}</span>
            </div>
            <div className={styles.panelBody}>
              {attention.length ? (
                attention.slice(0, 4).map((item, index) => (
                  <Attention key={`${item.title}-${index}`} rank={index + 1} tone={item.tone} title={item.title} detail={item.detail} href={item.href} label={item.label} />
                ))
              ) : (
                <p className={styles.caption}>No priority investigation is supported by the current evidence.</p>
              )}
            </div>
          </section>
        </div>

        <div className={styles.stack}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div><h2>Marketing Funnel</h2><p>From acquisition to enrollment.</p></div>
              <Link href="/marketing?view=funnel" className={styles.link}>Explore <ArrowRight size={12} /></Link>
            </div>
            <div className={styles.panelBody}>
              <div className={styles.funnel}>
                <FunnelRow label="Traffic" value={traffic} base={traffic} />
                <FunnelRow label="Lead" value={totalLeads} base={traffic} />
                <FunnelRow label="Qualified" value={qualified} base={totalLeads} />
                <FunnelRow label="High Intent" value={highIntent} base={totalLeads} />
                <FunnelRow label="Payment Pending" value={paymentPending} base={totalLeads} />
                <FunnelRow label="Enrolled" value={enrolled} base={totalLeads} />
              </div>
              <p className={styles.caption}>
                Counts are observed states/milestones. Bars show stage share and do not imply causal attribution.
              </p>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div><h2>Top Performers</h2><p>Ranked by enrollments in the current campaign scope.</p></div>
              <Link href="/marketing?view=campaigns" className={styles.link}>All campaigns <ArrowRight size={12} /></Link>
            </div>
            <div className={styles.panelBody}>
              {topCampaigns.length ? (
                topCampaigns.map((row, index) => (
                  <Link
                    href={`/marketing?view=campaigns&q=${encodeURIComponent(row.name)}`}
                    className={styles.rankRow}
                    key={row.id}
                  >
                    <span className={styles.rankNum}>{index + 1}</span>
                    <span className={styles.rankMain}>
                      <strong>{row.name}</strong>
                      <small>{row.qualified} qualified · {row.cac === null ? "CAC unavailable" : `CAC ${formatMoney(row.cac, row.spendCurrency)}`}</small>
                    </span>
                    <span className={styles.rankValue}>{row.enrolled}<small style={{ display: "block", fontSize: 7, color: "#758279", fontWeight: 400 }}>enrolled</small></span>
                  </Link>
                ))
              ) : (
                <p className={styles.caption}>No connected paid campaign rows are available in this scope.</p>
              )}
            </div>
          </section>
        </div>
      </div>

      <div className={styles.changeFeed}>
        <strong>What changed</strong>
        <ChangeItem label="Sessions" movement={movement.sessions} />
        <ChangeItem label="Leads" movement={movement.leads} />
        <ChangeItem label="Qualified" movement={movement.qualified} />
        <ChangeItem label="Enrolled" movement={movement.enrolled} />
        <span>{roas === null ? "ROAS coverage remains partial" : `Known paid ROAS ${roas.toFixed(1)}×`}</span>
      </div>
    </div>
  );
}

function Pulse({ label, value, note, partial = false }: { label: string; value: string; note: string; partial?: boolean }) {
  return <div className={styles.pulseItem}><span className={styles.pulseLabel}>{label}</span><strong className={`${styles.pulseValue} ${partial ? styles.partial : ""}`}>{value}</strong><small className={styles.pulseNote}>{note}</small></div>;
}

function IntelligenceCard({ icon, label, value, note, tone, href }: { icon: React.ReactNode; label: string; value: string; note: string; tone: "warning" | "positive" | "neutral"; href?: string }) {
  const content = <><span className={`${styles.intelligenceIcon} ${styles[`intelligenceIcon_${tone}`]}`}>{icon}</span><span className={styles.intelligenceCopy}><small>{label}</small><strong>{value}</strong><em>{note}</em></span>{href ? <ArrowRight size={13} className={styles.intelligenceArrow} /> : null}</>;
  return href ? <Link href={href} className={styles.intelligenceCard}>{content}</Link> : <div className={styles.intelligenceCard}>{content}</div>;
}

function Attention({ rank, tone, title, detail, href, label }: { rank: number; tone: AttentionItem["tone"]; title: string; detail: string; href: string; label: string }) {
  return <div className={styles.attentionItem}><span className={`${styles.attentionRank} ${styles[`attentionRank_${tone}`]}`}>{String(rank).padStart(2, "0")}</span><div className={styles.attentionText}><div className={styles.attentionMeta}><span>{tone === "critical" ? "High priority" : tone === "warning" ? "Review" : tone === "positive" ? "Opportunity" : "Monitor"}</span></div><h3>{title}</h3><p>{detail}</p><Link href={href} className={styles.link}>{label} <ArrowRight size={11} /></Link></div></div>;
}

function FunnelRow({ label, value, base }: { label: string; value: number; base: number }) {
  const width = base > 0 ? Math.max(value > 0 ? 3 : 0, Math.min(100, (value / base) * 100)) : 0;
  return <div className={styles.funnelRow}><span>{label}</span><span className={styles.funnelBar}><i style={{ width: `${width}%` }} /></span><strong className={styles.funnelCount}>{formatNumber(value)}</strong></div>;
}

function ChangeItem({ label, movement }: { label: string; movement: Movement }) {
  if (movement.delta === null) return <span>{label}: not enough history</span>;
  const sign = movement.delta > 0 ? "+" : "";
  return <span>{label} {sign}{movement.delta.toFixed(1)}%</span>;
}

function buildMovement(rows: unknown[]) {
  const daily = rows
    .map(asRecord)
    .map((row) => ({
      sessions: numberValue(row.sessions, row.visitors, row.traffic),
      leads: numberValue(row.leads, row.lead_count, row.crm_leads),
      qualified: numberValue(row.qualified, row.qualified_leads, row.qualified_count),
      enrolled: numberValue(row.enrolled, row.enrolled_leads, row.enrolled_count),
    }))
    .filter((row) => row.sessions > 0 || row.leads > 0 || row.qualified > 0 || row.enrolled > 0);

  const split = Math.floor(daily.length / 2);
  if (split < 2) return emptyMovement();
  const previous = daily.slice(0, split);
  const current = daily.slice(split);

  return {
    sessions: movementFor(previous, current, "sessions"),
    leads: movementFor(previous, current, "leads"),
    qualified: movementFor(previous, current, "qualified"),
    enrolled: movementFor(previous, current, "enrolled"),
  };
}

function movementFor(previous: DailySignal[], current: DailySignal[], key: keyof DailySignal): Movement {
  const previousValue = previous.reduce((sum, row) => sum + row[key], 0);
  const currentValue = current.reduce((sum, row) => sum + row[key], 0);
  const delta = previousValue > 0 ? ((currentValue - previousValue) / previousValue) * 100 : null;
  return { current: currentValue, previous: previousValue, delta };
}

function emptyMovement() {
  const empty = { current: 0, previous: 0, delta: null } satisfies Movement;
  return { sessions: { ...empty }, leads: { ...empty }, qualified: { ...empty }, enrolled: { ...empty } };
}

function buildAttentionQueue({ poorCampaign, missingRoas, strongest, movement, campaignCount }: { poorCampaign?: CampaignWorkspaceRow; missingRoas: number; strongest?: CampaignWorkspaceRow; movement: ReturnType<typeof buildMovement>; campaignCount: number }): AttentionItem[] {
  const items: AttentionItem[] = [];

  if (poorCampaign) {
    items.push({
      score: 100 + Math.min(50, poorCampaign.spend / 1000),
      tone: "critical",
      title: "Spend without qualified outcomes",
      detail: `${poorCampaign.name} · ${formatMoney(poorCampaign.spend, poorCampaign.spendCurrency)} spend · ${poorCampaign.leads} leads · 0 qualified.`,
      href: `/marketing?view=campaigns&q=${encodeURIComponent(poorCampaign.name)}`,
      label: "Inspect campaign",
    });
  }

  if (movement.qualified.delta !== null && movement.qualified.delta <= -15) {
    items.push({
      score: 92 + Math.min(30, Math.abs(movement.qualified.delta)),
      tone: "critical",
      title: "Qualification momentum declined",
      detail: `${formatDelta(movement.qualified.delta, "Qualified outcomes")} versus the prior half of the observed daily period. Check lead quality and admissions handling before changing budget.`,
      href: "/marketing?view=funnel",
      label: "Inspect funnel",
    });
  } else if (movement.leads.delta !== null && movement.leads.delta <= -15) {
    items.push({
      score: 84 + Math.min(30, Math.abs(movement.leads.delta)),
      tone: "warning",
      title: "Lead momentum declined",
      detail: `${formatDelta(movement.leads.delta, "Leads")} versus the prior half of the observed daily period. Review acquisition mix and campaign delivery.`,
      href: "/marketing?view=analytics",
      label: "Inspect traffic and leads",
    });
  }

  if (missingRoas > 0) {
    items.push({
      score: 70 + Math.min(20, missingRoas * 2),
      tone: "warning",
      title: "Campaign efficiency has incomplete evidence",
      detail: `${missingRoas} of ${campaignCount || missingRoas} campaign${campaignCount === 1 ? "" : "s"} do not have enough known revenue/spend evidence for ROAS.`,
      href: "/marketing?view=attribution",
      label: "Inspect attribution",
    });
  }

  if (strongest) {
    items.push({
      score: 45 + Math.min(20, strongest.enrolled * 2),
      tone: "positive",
      title: "Potential scale opportunity",
      detail: `${strongest.name} · ${strongest.enrolled} enrolled · ${strongest.cac === null ? "CAC unavailable" : `${formatMoney(strongest.cac, strongest.spendCurrency)} CAC`}. Review marginal efficiency before increasing spend.`,
      href: `/marketing?view=campaigns&q=${encodeURIComponent(strongest.name)}`,
      label: "Inspect performance",
    });
  }

  return items.sort((a, b) => b.score - a.score);
}

function normalizeSources(rows: unknown[]): AcquisitionRow[] {
  return rows
    .map(asRecord)
    .map((row) => ({
      name: stringValue(row.source, row.first_touch_source, row.channel, row.name) || "Unknown",
      leads: numberValue(row.leads, row.lead_count),
      qualified: numberValue(row.qualified_leads, row.qualified, row.qualified_count),
      enrolled: numberValue(row.enrolled_leads, row.enrolled, row.enrolled_count),
    }))
    .filter((row) => row.leads > 0 || row.qualified > 0 || row.enrolled > 0)
    .sort((a, b) => b.leads - a.leads);
}

function fallbackAcquisition(rows: CampaignWorkspaceRow[]): AcquisitionRow[] {
  const grouped = new Map<string, AcquisitionRow>();
  for (const row of rows) {
    const key = row.platform || "Unknown";
    const current = grouped.get(key) ?? { name: key, leads: 0, qualified: 0, enrolled: 0 };
    current.leads += row.leads;
    current.qualified += row.qualified;
    current.enrolled += row.enrolled;
    grouped.set(key, current);
  }
  return [...grouped.values()].sort((a, b) => b.leads - a.leads);
}

function sumCampaign(rows: CampaignWorkspaceRow[], key: "highIntent" | "paymentPending") {
  return rows.reduce((sum, row) => sum + row[key], 0);
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : {};
}

function numberValue(...values: unknown[]) {
  for (const value of values) {
    const number = Number(value ?? 0);
    if (Number.isFinite(number) && number !== 0) return number;
  }
  return 0;
}

function positiveNumber(primary: unknown, fallback: number) {
  const value = Number(primary ?? 0);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function stringValue(...values: unknown[]) {
  for (const value of values) if (typeof value === "string" && value.trim()) return value.trim();
  return "";
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value || 0);
}

function formatMoney(value: number, currency = "INR", compact = false) {
  if (compact && Math.abs(value) >= 1000000) return `${currency === "INR" ? "₹" : "$"}${(value / 1000000).toFixed(2)}M`;
  if (compact && Math.abs(value) >= 1000) return `${currency === "INR" ? "₹" : "$"}${(value / 1000).toFixed(1)}K`;
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value || 0);
  } catch {
    return `${currency} ${formatNumber(value)}`;
  }
}

function formatPercent(value: number, denominator: number) {
  return denominator > 0 ? `${((value / denominator) * 100).toFixed(1)}%` : "—";
}

function formatDelta(delta: number, label: string) {
  if (delta === 0) return `${label} flat`;
  return `${label} ${delta > 0 ? "up" : "down"} ${Math.abs(delta).toFixed(1)}%`;
}
