import Link from "next/link";
import {
  ArrowLeft, ArrowRight, BookOpenText, CheckCircle2,
  CircleAlert, FileSearch, ShieldCheck,
} from "lucide-react";

import { safeOrganicQuery } from "@/lib/ai/organic-growth-skills-core";
import { getSeoWorkspace, type ContentGapRow } from "@/lib/seo-data";
import { requirePrivilegedWorkspaceAccess } from "@/lib/route-access";
import { CopyResearchEvidence } from "@/components/seo/copy-research-evidence";
import core from "../intelligence.module.css";
import styles from "./research.module.css";

export const dynamic = "force-dynamic";

type Topic = { id: string; title: string; source: ContentGapRow };

function metric(value: number | string | null | undefined): string {
  if (value === undefined || value === null || value === "") return "—";
  const n = Number(value);
  return Number.isFinite(n) && n >= 0
    ? n.toLocaleString("en-IN", { maximumFractionDigits: 0 })
    : "—";
}

function position(value: number | string | null | undefined): string {
  const n = Number(value);
  return value !== null && value !== undefined && Number.isFinite(n) && n > 0
    ? n.toFixed(1) : "—";
}

function safeLabel(value: unknown): string | null {
  return safeOrganicQuery(value);
}

function dateLabel(value: string | null | undefined): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Not verified";
  const date = new Date(value + "T00:00:00Z");
  if (Number.isNaN(date.getTime())) return "Not verified";
  return new Intl.DateTimeFormat("en", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }).format(date);
}

function makeTopics(rows: ContentGapRow[]): Topic[] {
  return rows.flatMap((row): Topic[] => {
    const title = safeLabel(row.topic_name);
    if (!title || typeof row.topic_id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(row.topic_id)) return [];
    return [{ id: row.topic_id, title, source: row }];
  }).sort((a, b) => {
    const pa = Number(a.source.priority_score_v1 ?? -1);
    const pb = Number(b.source.priority_score_v1 ?? -1);
    return (Number.isFinite(pb) ? pb : -1) - (Number.isFinite(pa) ? pa : -1);
  }).slice(0, 40);
}

function observedQueries(topic: ContentGapRow) {
  const source = Array.isArray(topic.top_queries) ? topic.top_queries : [];
  return source.flatMap((row) => {
    const query = safeLabel(row.query);
    if (!query) return [];
    return [{
      query, clicks: metric(row.clicks),
      impressions: metric(row.impressions), position: position(row.avg_position),
    }];
  }).slice(0, 8);
}

function researchOutline(topic: Topic, queries: ReturnType<typeof observedQueries>,
  gscDate: string, reviewNote: string | null) {
  const row = topic.source;
  return [
    "CONTENT RESEARCH EVIDENCE (NOT AN AI-GENERATED BRIEF)",
    "Topic: " + topic.title,
    "Content model type: " + (safeLabel(row.topic_type) || "Not classified"),
    "Gap classification: " + (safeLabel(row.gap_type) || "Not classified"),
    "Latest GSC data date: " + gscDate,
    "Observed GSC clicks: " + metric(row.gsc_clicks),
    "Observed GSC impressions: " + metric(row.gsc_impressions),
    "Average GSC position: " + position(row.gsc_avg_position),
    "Mapped pages: " + metric(row.mapped_pages),
    "Indexable pages: " + metric(row.indexable_pages),
    "Model priority score: " + metric(row.priority_score_v1),
    "Top observed queries (" + queries.length + " displayed):",
    ...queries.map((item) => "- " + item.query + " | clicks " + item.clicks +
      " | impressions " + item.impressions + " | position " + item.position),
    "Source recommendation: " + (reviewNote || "No safe short recommendation available"),
    "MANUAL NEXT STEPS:",
    "- Inspect search intent and competing results independently.",
    "- Verify which existing pages meet this topic before drafting.",
    "- Review indexability, source freshness, search scope and editorial accuracy.",
    "- Obtain human approval before creating or publishing content.",
    "LIMITATIONS: This is a read-only extract from currently loaded SalsysOS content/GSC evidence. " +
      "Full coverage and reporting-window alignment have not been independently verified. " +
      "No Claude execution, rankings forecast or publish action occurred.",
  ].join("\n");
}

export default async function ContentBriefResearchPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  await requirePrivilegedWorkspaceAccess();
  const params = await searchParams;
  const selectedId = typeof params.topic === "string" &&
    /^[a-zA-Z0-9_-]{1,128}$/.test(params.topic) ? params.topic : null;
  const workspace = await getSeoWorkspace();
  const topics = makeTopics(workspace.contentGaps);
  const selected = params.topic === undefined
    ? topics[0] ?? null
    : topics.find((topic) => topic.id === selectedId) ?? null;
  const queries = selected ? observedQueries(selected.source) : [];
  const reviewNote = selected ? safeLabel(selected.source.recommendation) : null;
  const sourceDate = dateLabel(workspace.health.latest_gsc_date);
  const outline = selected
    ? researchOutline(selected, queries, sourceDate, reviewNote)
    : "";

  return (
    <main className={core.workspace}>
      <header className={core.header}>
        <div>
          <div className={core.eyebrow}>Organic growth / Content intelligence</div>
          <h1 className={core.heading}>Content brief research</h1>
          <p className={core.description}>
            Select an existing content opportunity to assemble a source-backed
            research outline. AI drafting and publishing remain disabled.
          </p>
        </div>
        <div className={core.headerActions}>
          <Link href="/seo/intelligence" className={core.actionLink}>
            <ArrowLeft size={14} aria-hidden /> Back to intelligence
          </Link>
          <Link href="/seo/content-opportunities" className={core.actionLink}>
            All content opportunities <ArrowRight size={14} aria-hidden />
          </Link>
        </div>
      </header>

      <div className={core.metaLine}>
        <span className={core.metaChip}>
          <FileSearch size={13} aria-hidden /> Search Console: {sourceDate}
        </span>
        <span className={core.metaChip}>
          <ShieldCheck size={13} aria-hidden /> No AI calls, no writes
        </span>
        <span className={core.metaChip}>
          <BookOpenText size={13} aria-hidden /> {topics.length} loaded eligible topics
        </span>
      </div>
      {workspace.warning || workspace.contentWarning ? (
        <div role="status" className={styles.note}>
          <strong>Source limitation. </strong>
          {workspace.warning || workspace.contentWarning}
        </div>
      ) : null}
      <div className={styles.layout}>
        <nav className={core.panel + " " + styles.topicPanel}
          aria-label="Choose a content research topic">
          <div className={core.sectionHeader}>
            <div>
              <h2 className={core.sectionTitle}>Observed topic gaps</h2>
              <p className={core.sectionDescription}>
                Loaded model opportunities — not an exhaustive keyword inventory.
              </p>
            </div>
          </div>
          {topics.length ? (
            <div className={styles.topicList}>
              {topics.map((topic) => (
                <Link key={topic.id}
                  href={"/seo/intelligence/content-brief?topic=" + encodeURIComponent(topic.id)}
                  aria-current={selected?.id === topic.id ? "page" : undefined}
                  className={styles.topic +
                    (selected?.id === topic.id ? " " + styles.topicActive : "")}>
                  <span className={styles.topicName}>{topic.title}</span>
                  <span className={styles.topicMeta}>
                    {safeLabel(topic.source.gap_type) || "Content gap"} ·{" "}
                    {metric(topic.source.gsc_impressions)} impressions
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className={styles.empty}>
              No eligible topic evidence is currently available in this workspace.
              Check the Content Opportunities screen and source connection.
            </p>
          )}
        </nav>

        <div className={styles.detail}>
          {selected ? (
            <>
              <section className={core.panel} aria-label="Selected topic evidence">
                <div className={styles.briefHeader}>
                  <div className={core.eyebrow}>Research worksheet · Read only</div>
                  <h2 className={styles.briefTitle}>{selected.title}</h2>
                  <p className={styles.briefDescription}>
                    This is a deterministic evidence outline, not an editorial brief
                    or an AI recommendation. Verify page scope and search intent
                    before creating or editing content.
                  </p>
                  <div className={styles.metadata}>
                    <span className={styles.metadataItem}>Type: {safeLabel(selected.source.topic_type) || "Unclassified"}</span>
                    <span className={styles.metadataItem}>Gap: {safeLabel(selected.source.gap_type) || "Unclassified"}</span>
                    <span className={styles.metadataItem}>Model priority: {metric(selected.source.priority_score_v1)}</span>
                  </div>
                  <div className={styles.metricRow}>
                    <div className={styles.metric}>
                      <strong>{metric(selected.source.gsc_impressions)}</strong><span>Observed impressions</span>
                    </div>
                    <div className={styles.metric}>
                      <strong>{metric(selected.source.gsc_clicks)}</strong><span>Observed clicks</span>
                    </div>
                    <div className={styles.metric}>
                      <strong>{metric(selected.source.mapped_pages)}</strong><span>Mapped pages</span>
                    </div>
                    <div className={styles.metric}>
                      <strong>{metric(selected.source.indexable_pages)}</strong><span>Indexable pages</span>
                    </div>
                  </div>
                </div>
              </section>

              <section className={core.panel} aria-labelledby="brief-query-heading">
                <div className={core.sectionHeader}>
                  <div>
                    <h2 id="brief-query-heading" className={core.sectionTitle}>Top observed queries</h2>
                    <p className={core.sectionDescription}>
                      Available Search Console evidence mapped to this topic.
                    </p>
                  </div>
                  <span className={core.status}>{queries.length} shown</span>
                </div>
                {queries.length ? (
                  <div className={styles.tableWrap}>
                    <table className={styles.queryTable}>
                      <thead>
                        <tr><th scope="col">Query</th>
                          <th scope="col" className={styles.right}>Clicks</th>
                          <th scope="col" className={styles.right}>Impressions</th>
                          <th scope="col" className={styles.right}>Position</th>
                        </tr>
                      </thead>
                      <tbody>
                        {queries.map((row, index) => (
                          <tr key={row.query + "-" + index}>
                            <td>{row.query}</td>
                            <td className={styles.right}>{row.clicks}</td>
                            <td className={styles.right}>{row.impressions}</td>
                            <td className={styles.right}>{row.position}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className={styles.empty}>
                    No safe query-level evidence was returned for this topic.
                    The topic title alone is not evidence of keyword demand.
                  </p>
                )}
              </section>

              <section className={core.panel} aria-labelledby="brief-review-heading">
                <div className={core.sectionHeader}>
                  <div>
                    <h2 id="brief-review-heading" className={core.sectionTitle}>Manual research checklist</h2>
                    <p className={core.sectionDescription}>
                      Checks for an editor to complete before preparing content.
                    </p>
                  </div>
                </div>
                <ul className={styles.reviewList}>
                  {[
                    "Review existing pages and indexing before proposing another page.",
                    "Confirm current search intent and competing results independently.",
                    "Check query scope, data freshness, and any source warnings.",
                    "Validate claims and obtain human approval before publication.",
                  ].map((item) => (
                    <li className={styles.reviewItem} key={item}>
                      <CheckCircle2 size={15} aria-hidden /> {item}
                    </li>
                  ))}
                </ul>
                {reviewNote ? (
                  <div className={styles.footer}>
                    <span className={styles.smallNote}>Source model recommendation: {reviewNote}</span>
                  </div>
                ) : null}
              </section>
              <div className={styles.note}>
                <strong>Evidence limitations. </strong>
                Source date: {sourceDate}. These are currently loaded model rows;
                full query coverage, aligned date windows, and current SERP positions
                have not been independently verified. Missing evidence is not zero.
              </div>
              <div className={core.panel}>
                <div className={styles.footer}>
                  <CopyResearchEvidence text={outline} />
                  <span className={styles.smallNote}>
                    Copy stays in your browser; no content is sent to Claude.
                  </span>
                </div>
              </div>
            </>
          ) : (
            <section className={core.panel}>
              <div className={core.sectionHeader}>
                <CircleAlert size={20} aria-hidden />
                <div>
                  <h2 className={core.sectionTitle}>
                    {topics.length ? "Topic not found in this workspace" : "No research evidence yet"}
                  </h2>
                  <p className={core.sectionDescription}>
                    {topics.length
                      ? "Select a topic from the list. A URL parameter cannot select a topic outside the authenticated workspace."
                      : "Connect a supported search data source and review your Content Opportunities first."}
                  </p>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
