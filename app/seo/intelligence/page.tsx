import Link from "next/link";
import {
  ArrowRight, ArrowUpRight, BarChart3, BookOpenText, CircleHelp,
  FileSearch, Globe2, Layers3, LockKeyhole, MousePointerClick,
  Search, ShieldCheck, Sparkles, TrendingUp, Users,
} from "lucide-react";

import { safeOrganicQuery } from "@/lib/ai/organic-growth-skills-core";
import { getSeoWorkspace, type SeoWorkspace } from "@/lib/seo-data";
import { requirePrivilegedWorkspaceAccess } from "@/lib/route-access";
import styles from "./intelligence.module.css";

export const dynamic = "force-dynamic";

type Focus = "all" | "search" | "content" | "answers";
type EvidenceItem = {
  key: string;
  title: string;
  category: Exclude<Focus, "all">;
  source: string;
  impressions: number | null;
  avgPosition: number | null;
  explanation: string;
  href: string;
};

function n(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : null;
}
function fmt(value: number | string | null | undefined): string {
  const valueNumber = n(value);
  return valueNumber === null ? "—" : valueNumber.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}
function pos(value: number | null): string {
  return value !== null && value > 0 ? value.toFixed(1) : "—";
}
function dateLabel(value: string | null | undefined): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Not verified";
  const parsed = new Date(value + "T00:00:00Z");
  if (Number.isNaN(parsed.getTime())) return "Not verified";
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(parsed);
}
function isFresh(value: string | null | undefined): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const age = (Date.now() - Date.parse(value + "T00:00:00Z")) / 86400000;
  return age >= 0 && age <= 7;
}
function evidenceItems(workspace: SeoWorkspace): EvidenceItem[] {
  const search = workspace.opportunities.map((row, i) => ({
    key: "s-" + i, title: safeOrganicQuery(row.query) || "",
    category: "search" as const, source: "Search Console",
    impressions: n(row.impressions), avgPosition: n(row.avg_position),
    explanation: row.opportunity_type?.replaceAll("_", " ") || "Observed search demand",
    href: "/seo/search-performance",
  }));
  const content = workspace.contentGaps.map((row, i) => ({
    key: "c-" + i, title: safeOrganicQuery(row.topic_name) || "",
    category: "content" as const, source: "Content model",
    impressions: n(row.gsc_impressions), avgPosition: n(row.gsc_avg_position),
    explanation: row.gap_type?.replaceAll("_", " ") || "Mapped content gap",
    href: "/seo/content-opportunities",
  }));
  const answers = workspace.aeoQueryOpportunities.map((row, i) => ({
    key: "a-" + i, title: safeOrganicQuery(row.query) || "",
    category: "answers" as const, source: "Answer-intent model",
    impressions: n(row.impressions), avgPosition: n(row.avg_position),
    explanation: row.answer_class?.replaceAll("_", " ") || "Answer-oriented search demand",
    href: "/seo/ai-answer-visibility",
  }));
  return [...search, ...content, ...answers]
    .filter((row) => row.title.length > 0)
    .sort((a, b) => (b.impressions ?? -1) - (a.impressions ?? -1));
}

function Metric({ label, value, note, icon: Icon }: {
  label: string; value: string; note: string; icon: typeof Search;
}) {
  return (
    <div className={styles.panel + " " + styles.summaryCard}>
      <div className={styles.summaryCardTop}>
        <span>{label}</span>
        <span className={styles.metricIcon}><Icon size={15} aria-hidden /></span>
      </div>
      <strong className={styles.summaryValue}>{value}</strong>
      <span className={styles.summaryNote}>{note}</span>
    </div>
  );
}

function Workflows({ hasEvidence }: { hasEvidence: boolean }) {
  return (
    <section className={styles.panel} aria-labelledby="organic-workflows">
      <div className={styles.sectionHeader}>
        <div>
          <h2 id="organic-workflows" className={styles.sectionTitle}>Research workflows</h2>
          <p className={styles.sectionDescription}>
            OpenSEO-inspired research, governed by SalsysOS evidence and permissions.
          </p>
        </div>
      </div>
      <div className={styles.workflowGrid}>
        <article className={styles.workflow}>
          <div className={styles.workflowTop}>
            <span className={styles.workflowIcon}><BookOpenText size={18} aria-hidden /></span>
            <span className={styles.status + " " + styles.statusMuted}>AI not active</span>
          </div>
          <h3 className={styles.workflowTitle}>Content brief</h3>
          <p className={styles.workflowDescription}>
            Review observed topics and existing pages. Automated Claude brief generation
            is not connected to this interface yet.
          </p>
          <Link href="/seo/content-opportunities" className={styles.sectionLink}>
            {hasEvidence ? "Review topic evidence" : "Check topic coverage"}
            <ArrowRight size={14} aria-hidden />
          </Link>
        </article>
        <article className={styles.workflow}>
          <div className={styles.workflowTop}>
            <span className={styles.workflowIcon}><BarChart3 size={18} aria-hidden /></span>
            <span className={styles.status + " " + styles.statusWarn}>Requires data approval</span>
          </div>
          <h3 className={styles.workflowTitle}>SEO vs Ads</h3>
          <p className={styles.workflowDescription}>
            Requires fresh Google Ads search terms, compatible reporting periods,
            and the separately approved Claude tool bridge.
          </p>
          <Link href="/marketing/integrations" className={styles.sectionLink}>
            Check integration readiness <ArrowRight size={14} aria-hidden />
          </Link>
        </article>
      </div>
    </section>
  );
}

export default async function OrganicIntelligencePage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string }>;
}) {
  const params = await searchParams;
  const focus: Focus = params.focus === "search" || params.focus === "content" ||
    params.focus === "answers" ? params.focus : "all";
  const activeWorkspace = await requirePrivilegedWorkspaceAccess();
  const canOpenSeoProjects = activeWorkspace.role === "owner" || activeWorkspace.role === "admin";
  const workspace = await getSeoWorkspace();
  const items = evidenceItems(workspace);
  const visible = items.filter((item) => focus === "all" || focus === item.category).slice(0, 9);
  const days = workspace.daily.slice(-14);
  const maxClicks = Math.max(1, ...days.map((day) => n(day.clicks) ?? 0));
  const gscFresh = isFresh(workspace.health.latest_gsc_date);

  const filters: Array<{ key: Focus; label: string }> = [
    { key: "all", label: "All signals" },
    { key: "search", label: "Search queries" },
    { key: "content", label: "Content gaps" },
    { key: "answers", label: "Answer intent" },
  ];

  return (
    <main className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>Organic growth / Intelligence</div>
          <h1 className={styles.heading}>Organic intelligence</h1>
          <p className={styles.description}>
            One evidence-first workspace for SEO, answer-engine readiness and AI
            discovery. Explore observed signals and choose the right next review.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/seo" className={styles.actionLink}>
            SEO overview <ArrowUpRight size={14} aria-hidden />
          </Link>
          {canOpenSeoProjects ? (
            <Link href="/seo/open-seo" className={styles.actionLink + " " + styles.actionLinkPrimary}>
              OpenSEO research <ArrowUpRight size={14} aria-hidden />
            </Link>
          ) : (
            <span className={styles.actionLink} aria-label="OpenSEO requires an owner or admin">
              OpenSEO · admin only <LockKeyhole size={13} aria-hidden />
            </span>
          )}
        </div>
      </header>

      <div className={styles.metaLine}>
        <span className={styles.metaChip}>
          <span aria-hidden className={styles.liveDot + (gscFresh ? "" : " " + styles.warningDot)} />
          Search Console: {dateLabel(workspace.health.latest_gsc_date)}
        </span>
        <span className={styles.metaChip}><LockKeyhole size={12} aria-hidden /> Claude workflows not activated</span>
        <span className={styles.metaChip}><ShieldCheck size={12} aria-hidden /> Read-only workspace</span>
      </div>

      {workspace.warning ? (
        <div className={styles.callout} role="status">
          <strong className={styles.calloutStrong}>Evidence notice: </strong>{workspace.warning}
        </div>
      ) : null}

      <section className={styles.summaryGrid} aria-label="Organic performance metrics">
        <Metric icon={MousePointerClick} label="Organic clicks" value={fmt(workspace.overview.clicks)} note="Observed Google Search Console" />
        <Metric icon={TrendingUp} label="Search impressions" value={fmt(workspace.overview.impressions)} note="Observed search visibility" />
        <Metric icon={Users} label="Qualified organic leads" value={fmt(workspace.overview.organic_qualified_leads)} note="Mapped CRM evidence" />
        <Metric icon={Sparkles} label="Answer-intent queries" value={fmt(workspace.aeoSummary.answer_queries)} note="GSC-derived answer demand" />
      </section>

      <div className={styles.contentGrid}>
        <div className={styles.mainStack}>
          <section className={styles.panel} aria-labelledby="organic-trend">
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle} id="organic-trend">Search pulse</h2>
                <p className={styles.sectionDescription}>Daily observed organic clicks, not rank estimates.</p>
              </div>
              <Link href="/seo/search-performance" className={styles.sectionLink}>
                Full report <ArrowRight size={13} aria-hidden />
              </Link>
            </div>
            {days.length ? (
              <div className={styles.trendWrap}>
                <div className={styles.trendBars} role="img" aria-label={"Organic clicks for " + days.length + " observed days"}>
                  {days.map((day) => (
                    <div className={styles.trendCol} key={day.date}
                      title={day.date + ": " + fmt(day.clicks) + " organic clicks"}>
                      <span className={styles.trendBar} style={{
                        height: Math.max(2, ((n(day.clicks) ?? 0) / maxClicks) * 100) + "%",
                      }} />
                    </div>
                  ))}
                </div>
                <div className={styles.trendAxis}>
                  <span>{dateLabel(days[0]?.date)}</span>
                  <span>Organic clicks</span>
                  <span>{dateLabel(days[days.length - 1]?.date)}</span>
                </div>
              </div>
            ) : (
              <p className={styles.empty}>No recent Search Console observations are available.</p>
            )}
          </section>

          <section className={styles.panel} aria-labelledby="organic-opportunities">
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle} id="organic-opportunities">Opportunity explorer</h2>
                <p className={styles.sectionDescription}>
                  Ranked by observed impressions; choose a category to narrow the queue.
                </p>
              </div>
              <span className={styles.status}>{items.length} evidence items</span>
            </div>
            <nav className={styles.tabs} aria-label="Filter organic evidence">
              {filters.map((filter) => (
                <Link key={filter.key}
                  href={filter.key === "all" ? "/seo/intelligence" : "/seo/intelligence?focus=" + filter.key}
                  className={styles.tab + (focus === filter.key ? " " + styles.tabActive : "")}
                  aria-current={focus === filter.key ? "page" : undefined}>
                  {filter.label}
                </Link>
              ))}
            </nav>
            {visible.length ? (
              <div className={styles.tableScroll}>
                <table className={styles.dataTable}>
                  <thead>
                    <tr>
                      <th scope="col">Query / topic</th>
                      <th scope="col">Evidence</th>
                      <th scope="col" className={styles.numeric}>Impressions</th>
                      <th scope="col" className={styles.numeric}>Position</th>
                      <th scope="col">Review</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((item) => (
                      <tr key={item.key}>
                        <td>
                          <div className={styles.keywordName}>{item.title}</div>
                          <span className={styles.keywordDetail}>{item.explanation}</span>
                        </td>
                        <td><span className={styles.sourceLabel}>{item.source}</span></td>
                        <td className={styles.numeric}>{fmt(item.impressions)}</td>
                        <td className={styles.numeric}>{pos(item.avgPosition)}</td>
                        <td>
                          <Link href={item.href} className={styles.sectionLink}>
                            Inspect <ArrowUpRight size={13} aria-hidden />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className={styles.empty}>
                No {focus === "all" ? "organic" : focus} evidence was returned.
                Missing observations are not proof of missing rankings.
              </p>
            )}
            <div className={styles.panelFooter}>
              <span>Showing {visible.length} of {items.length} loaded evidence items.</span>
              <Link href="/seo/content-opportunities" className={styles.sectionLink}>
                All content decisions <ArrowRight size={13} aria-hidden />
              </Link>
            </div>
          </section>
          <Workflows hasEvidence={items.length > 0} />
        </div>

        <aside className={styles.sideStack} aria-label="More organic intelligence">
          <section className={styles.panel} aria-labelledby="answer-signals">
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle} id="answer-signals">Answer & AI signals</h2>
                <p className={styles.sectionDescription}>Readiness versus observed referral evidence.</p>
              </div>
            </div>
            <div className={styles.sideBody}>
              <div className={styles.signalRow}>
                <div>
                  <span className={styles.signalLabel}>Answer demand</span>
                  <span className={styles.signalSub}>Search-derived intent</span>
                </div>
                <strong className={styles.signalValue}>{fmt(workspace.aeoSummary.answer_queries)}</strong>
              </div>
              <div className={styles.signalRow}>
                <div>
                  <span className={styles.signalLabel}>Pages with answer sections</span>
                  <span className={styles.signalSub}>Recorded content features</span>
                </div>
                <strong className={styles.signalValue}>{fmt(workspace.aeoSummary.pages_with_answer_sections)}</strong>
              </div>
              <div className={styles.signalRow}>
                <div>
                  <span className={styles.signalLabel}>AI referral sessions</span>
                  <span className={styles.signalSub}>GA4 traffic, not model citations</span>
                </div>
                <strong className={styles.signalValue}>{fmt(workspace.geoSummary.ga4_ai_sessions)}</strong>
              </div>
              <div className={styles.callout}>
                <strong className={styles.calloutStrong}>Evidence distinction. </strong>
                Referrals and readiness scores do not establish AI answer citations,
                recommendations or ranking.
              </div>
              <Link href="/seo/ai-answer-visibility" className={styles.secondaryLink}
                style={{ marginTop: 13, width: "100%" }}>
                Explore answer readiness <ArrowRight size={13} aria-hidden />
              </Link>
            </div>
          </section>

          <section className={styles.panel} aria-labelledby="research-tools">
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle} id="research-tools">Explore deeper</h2>
                <p className={styles.sectionDescription}>Specialist tools, familiar SalsysOS navigation.</p>
              </div>
            </div>
            <div className={styles.linkList}>
              <Link className={styles.linkRow} href="/seo/search-performance">
                <span className={styles.linkLeft}><Search size={15} aria-hidden /> Search performance</span>
                <ArrowUpRight size={14} aria-hidden />
              </Link>
              <Link className={styles.linkRow} href="/seo/content-opportunities">
                <span className={styles.linkLeft}><Layers3 size={15} aria-hidden /> Content opportunities</span>
                <ArrowUpRight size={14} aria-hidden />
              </Link>
              <Link className={styles.linkRow} href="/seo/technical">
                <span className={styles.linkLeft}><FileSearch size={15} aria-hidden /> Technical SEO</span>
                <ArrowUpRight size={14} aria-hidden />
              </Link>
              {canOpenSeoProjects ? (
                <Link className={styles.linkRow} href="/seo/open-seo">
                  <span className={styles.linkLeft}><Globe2 size={15} aria-hidden /> OpenSEO projects</span>
                  <ArrowUpRight size={14} aria-hidden />
                </Link>
              ) : null}
            </div>
          </section>

          <div className={styles.reviewNotice} role="note">
            <CircleHelp size={16} aria-hidden />
            <span>
              This is an evidence/navigation workspace, not a second SEO engine.
              Opening it never starts paid research, publishing, or Claude execution.
            </span>
          </div>
        </aside>
      </div>
    </main>
  );
}
