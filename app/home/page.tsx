import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BarChart3,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Filter,
  GraduationCap,
  Inbox,
  Layers,
  Megaphone,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  HomeDatePicker,
  HomeRefresh,
  HomeRecordDialog,
  HomeTrend,
} from "@/components/home/command-center-charts";
import { isMockMode } from "@/lib/data";
import { getDashboardSnapshot } from "@/lib/dashboard-data";
import { resolveDashboardPeriod } from "@/lib/dashboard-period-data";
import { getHomeEvidence } from "@/lib/home-command-center-data";
import {
  homeHref,
  percentageChange,
  selectHomeRecords,
  type HomeMetric,
  type HomeProjection,
} from "@/lib/home-command-center";
import { getHomeDemo } from "@/lib/home-demo";
import { getFollowUpsWorkspace } from "@/lib/followups-data";
import { completeFollowUpAction } from "@/app/actions/crm";
import { SubmitButton } from "@/components/submit-button";

type Query = Record<string, string | string[] | undefined>;
const one = (s: string | string[] | undefined) =>
  Array.isArray(s) ? (s[0] ?? "") : (s ?? "");
const formatMoney = (value: number, currency: string) => {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString()}`;
  }
};
const palettes = [
  "#6934f5",
  "#9671fa",
  "#b99eff",
  "#d4c2ff",
  "#e5dbff",
  "#eee7ff",
];

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const query = await searchParams;
  const period = resolveDashboardPeriod(query);
  const mock = isMockMode();
  const [model, snapshotResult, tasksResult] = await Promise.all([
    mock ? Promise.resolve(getHomeDemo(period)) : getHomeEvidence(period),
    getDashboardSnapshot()
      .then((value) => ({ value }))
      .catch(() => ({ value: null })),
    getFollowUpsWorkspace({ page: 1, pageSize: 3 })
      .then((value) => ({ value }))
      .catch(() => ({ value: null })),
  ]);
  const snapshot = snapshotResult.value;
  const tasks = tasksResult.value;
  const metrics = snapshot?.metrics;
  const currencies = model.revenue;
  const currency =
    currencies.find((r) => r.currency === one(query.currency)) ??
    currencies.find((r) => r.current !== 0) ??
    currencies[0];
  const href = (params: Record<string, string> = {}) =>
    homeHref(period, {
      ...(currency ? { currency: currency.currency } : {}),
      ...params,
    });
  const detailHref = (detail: string, params: Record<string, string> = {}) =>
    href({ detail, ...params });
  const sourceTotal = model.sources.reduce((n, s) => n + s.count, 0);
  const anyEvidence = [
    model.leads.current,
    model.conversations.current,
    model.enrolled.current,
    ...model.revenue.map((r) => r.current),
  ].some((n) => n !== null && n !== 0);
  const incomplete =
    [
      model.leads.current,
      model.qualified.current,
      model.conversations.current,
      model.enrolled.current,
    ].some((n) => n === null) || !model.revenueAvailable;
  const selectedRecords = selectHomeRecords(
    model,
    one(query.detail),
    one(query.value),
    one(query.day),
    currency?.currency,
  );
  const page = Math.min(
    Math.max(1, Math.floor(Number(one(query.recordPage)) || 1)),
    Math.max(1, Math.ceil(selectedRecords.length / 50)),
  );
  const detailTitles: Record<string, string> = {
    leads: "New leads",
    qualified: "Qualified leads",
    contacted: "Contacted or further",
    enrolled: "Enrolled leads",
    cohortEnrolled: "Won / enrolled cohort",
    conversations: "Conversations",
    replies: "Human replies",
    revenue: "Payment evidence",
    source: "Lead source",
    course: "Course interest",
  };
  const detail = one(query.detail);
  return (
    <div className="home-command-center">
      <div className="home-heading">
        <div>
          <h1>Command Center</h1>
          <p>One view of leads, conversations, enrollments and revenue.</p>
        </div>
        <div className="home-toolbar">
          <nav aria-label="Reporting period" className="home-periods">
            {["7d", "30d", "90d", "ytd"].map((p) => (
              <Link
                key={p}
                href={`/home?period=${p}`}
                aria-current={period.preset === p ? "true" : undefined}
              >
                {p.toUpperCase()}
              </Link>
            ))}
          </nav>
          <HomeDatePicker
            start={period.startDate}
            end={period.endDate}
            label={period.label}
          />
          <Link className="home-secondary" href="/marketing">
            <Sparkles size={16} />
            Explore Intelligence
          </Link>
        </div>
      </div>
      <div className="home-evidence-note">
        <span>
          {mock ? "Synthetic demo · no customer data" : "Workspace reporting"} ·
          UTC
        </span>
        <span className="home-last-updated">
          Updated{" "}
          {new Date().toLocaleTimeString("en-GB", {
            timeZone: "UTC",
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          · Tasks show current work
          <HomeRefresh />
        </span>
      </div>
      {incomplete && (
        <div role="status" className="home-warning">
          <ShieldCheck size={17} />
          <div>
            <strong>Selected-period evidence is incomplete</strong>
            <p>
              Unavailable cards stay unknown. All-time totals are never
              substituted. Try a shorter period or review system health.
            </p>
          </div>
          <Link href="/settings/overview">
            Review setup <ArrowRight size={14} />
          </Link>
        </div>
      )}
      {!anyEvidence && !incomplete ? (
        <div className="home-welcome">
          <Users size={28} />
          <h2>Your command center starts with your first lead</h2>
          <p>Add a lead to see acquisition, conversations and progress here.</p>
          <Link className="home-primary" href="/leads/new">
            Add a lead <ArrowRight size={15} />
          </Link>
        </div>
      ) : (
        <div className="home-kpis">
          <Metric
            title="New leads"
            icon={Users}
            metric={model.leads}
            href={detailHref("leads")}
            note={`vs. previous ${period.days} days`}
          />
          <Metric
            title="Conversations"
            icon={MessageCircle}
            metric={model.conversations}
            href={detailHref("conversations")}
            note="Unique active conversations"
          />
          <Metric
            title="Qualified leads"
            icon={Target}
            metric={model.qualified}
            href={detailHref("qualified")}
            note={
              model.leads.current && model.qualified.current !== null
                ? `${(((model.qualified.current ?? 0) / model.leads.current) * 100).toFixed(1)}% of the new-lead cohort`
                : "New-lead cohort · reached qualified+"
            }
            showChange={false}
          />
          <Metric
            title="Enrolled leads"
            icon={GraduationCap}
            metric={model.enrolled}
            href={detailHref("enrolled")}
            note="CRM enrolled-stage transitions"
          />
          <article className="home-card home-kpi home-revenue">
            <span className="home-kpi-icon money">
              <CircleDollarSign size={27} />
            </span>
            <div>
              <div className="home-kpi-label">
                Net collected{" "}
                {currencies.length > 1 && (
                  <details>
                    <summary>{currency?.currency}</summary>
                    <div>
                      {currencies.map((r) => (
                        <Link
                          href={href({ currency: r.currency })}
                          key={r.currency}
                        >
                          {r.currency}
                        </Link>
                      ))}
                    </div>
                  </details>
                )}
              </div>
              <Link className="home-kpi-value" href={detailHref("revenue")}>
                {model.revenueAvailable
                  ? currency
                    ? formatMoney(currency.current, currency.currency)
                    : "—"
                  : "—"}
              </Link>
              <Change
                current={
                  model.revenueAvailable ? (currency?.current ?? 0) : null
                }
                previous={
                  model.revenueAvailable ? (currency?.previous ?? 0) : null
                }
              />
              <p>
                {!model.revenueAvailable
                  ? "Payment evidence unavailable"
                  : !currencies.length
                    ? "No paid receipts in this period"
                    : "Paid receipts less recorded refunds"}
              </p>
            </div>
          </article>
        </div>
      )}

      <div className="home-primary-grid">
        <Panel
          title="Lead funnel"
          icon={Filter}
          action={
            <Link href={detailHref("leads")}>
              View cohort <ArrowRight size={14} />
            </Link>
          }
        >
          {model.leads.current === null || model.qualified.current === null ? (
            <Empty
              icon={Filter}
              title="Cohort evidence unavailable"
              text="Stage history must load before progression can be shown."
            />
          ) : !model.leads.current ? (
            <Empty
              icon={Filter}
              title="No leads in this period"
              text="Try a wider date range to see cohort progression."
            />
          ) : (
            <>
              <div className="home-funnel">
                {[
                  { label: "New lead", n: model.leads.current, key: "leads" },
                  {
                    label: "Contacted+",
                    n: model.contacted.current,
                    key: "contacted",
                  },
                  {
                    label: "Qualified+",
                    n: model.qualified.current,
                    key: "qualified",
                  },
                  {
                    label: "Won / enrolled",
                    n: model.cohortEnrolled.current,
                    key: "cohortEnrolled",
                  },
                ].map((r, i) => (
                  <Link
                    key={r.label}
                    href={detailHref(r.key)}
                    className="home-funnel-row"
                  >
                    <span
                      className="home-funnel-shape"
                      style={{
                        width: `${100 - i * 12}%`,
                        background: `linear-gradient(120deg, ${palettes[Math.max(0, 3 - i)]}, ${palettes[Math.min(5, 4 - i)]})`,
                      }}
                    >
                      {r.label}
                    </span>
                    <span>
                      <b>{r.n?.toLocaleString()}</b>{" "}
                      <small>
                        (
                        {Math.round(
                          ((r.n ?? 0) / model.leads.current!) * 1000,
                        ) / 10}
                        %)
                      </small>
                    </span>
                  </Link>
                ))}
              </div>
              <p className="home-footnote">
                Same new-lead cohort · highest stage reached by period end.
                Higher stages imply earlier steps; won includes closed-won.
                Regressions remain reached.
              </p>
            </>
          )}
        </Panel>
        <Panel
          title="Conversation trend"
          icon={BarChart3}
          className="home-trend-panel"
        >
          {model.conversations.current === null ? (
            <Empty
              icon={MessageCircle}
              title="Conversation evidence unavailable"
              text="No activity totals are shown until message evidence loads."
            />
          ) : !model.conversations.current ? (
            <Empty
              icon={MessageCircle}
              title="No conversation activity yet"
              text="Messages in this period will appear here."
              href="/conversations"
              cta="Open inbox"
            />
          ) : (
            <>
              <HomeTrend
                points={model.trend}
                href={detailHref("conversations")}
              />
              <p className="home-footnote">
                Daily active conversations vs. human reply messages. Failed /
                queued sends excluded.
              </p>
            </>
          )}
        </Panel>
        <Panel
          title="Upcoming tasks"
          icon={CalendarDays}
          action={
            <Link href="/follow-ups">
              View all <ArrowRight size={14} />
            </Link>
          }
        >
          <p className="home-section-note">
            Open work · current queue, independent of reporting dates
          </p>
          {tasks?.tasks.length ? (
            <div className="home-task-list">
              {tasks.tasks.map((task) => (
                <div className="home-task" key={task.id}>
                  <form action={completeFollowUpAction}>
                    <input type="hidden" name="task_id" value={task.id} />
                    <input type="hidden" name="lead_id" value={task.leadId} />
                    <SubmitButton
                      aria-label={`Complete ${task.title}`}
                      className="home-task-check"
                      pendingLabel="…"
                      title="Mark this task complete"
                    >
                      <span aria-hidden="true">✓</span>
                    </SubmitButton>
                  </form>
                  <Link href={`/leads/${encodeURIComponent(task.leadId)}`}>
                    <strong>{task.title}</strong>
                    <small>{task.leadName}</small>
                  </Link>
                  <span
                    className={
                      Date.parse(task.dueAt) < Date.now()
                        ? "home-overdue"
                        : "home-due"
                    }
                  >
                    {Date.parse(task.dueAt) < Date.now()
                      ? "Overdue"
                      : new Date(task.dueAt).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          timeZone: "UTC",
                        })}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              icon={CheckCircle2}
              title={
                tasks ? "Your task queue is clear" : "Task queue unavailable"
              }
              text={
                tasks
                  ? "New follow-ups will appear here when scheduled."
                  : "Open Tasks & Follow-ups to review current commitments."
              }
            />
          )}
          {tasks?.warning && (
            <p className="home-footnote">
              Task service is using a fallback. Review the full queue for
              details.
            </p>
          )}
          {metrics &&
            (metrics.needsReply > 0 || metrics.paymentPending > 0) && (
              <div className="home-attention">
                {metrics.needsReply > 0 && (
                  <Link href="/conversations">
                    <Inbox size={14} />
                    {metrics.needsReply.toLocaleString()} leads need a reply
                    <ChevronRight size={13} />
                  </Link>
                )}
                {metrics.paymentPending > 0 && (
                  <Link href="/admissions">
                    <Clock3 size={14} />
                    {metrics.paymentPending.toLocaleString()} leads pending
                    payment
                    <ChevronRight size={13} />
                  </Link>
                )}
              </div>
            )}
        </Panel>
      </div>

      <div className="home-secondary-grid">
        <Panel title="Lead sources" icon={BarChart3}>
          {!sourceTotal ? (
            <Empty
              icon={BarChart3}
              title={
                model.leads.current === null
                  ? "Source evidence unavailable"
                  : "No acquisition data yet"
              }
              text="First-touch sources for leads created in this period appear here."
            />
          ) : (
            <div className="home-source-layout">
              <div
                className="home-donut"
                role="img"
                aria-label={`${sourceTotal} new leads by first-touch source`}
              >
                <svg viewBox="0 0 120 120" aria-hidden="true">
                  {model.sources.map((s, i, rows) => {
                    const offset =
                      (rows.slice(0, i).reduce((n, r) => n + r.count, 0) /
                        sourceTotal) *
                      100;
                    return (
                      <a
                        key={s.name}
                        href={detailHref("source", { value: s.name })}
                        aria-label={`${s.name}: ${s.count} leads`}
                      >
                        <circle
                          cx="60"
                          cy="60"
                          r="46"
                          fill="none"
                          stroke={palettes[Math.min(i, 5)]}
                          strokeWidth="17"
                          pathLength="100"
                          strokeDasharray={`${(s.count / sourceTotal) * 100} 100`}
                          strokeDashoffset={-offset}
                          transform="rotate(-90 60 60)"
                        />
                      </a>
                    );
                  })}
                </svg>
                <span>
                  <b>{sourceTotal.toLocaleString()}</b>
                  <small>Leads</small>
                </span>
              </div>
              <div className="home-source-legend">
                {model.sources.map((s, i) => (
                  <Link
                    key={s.name}
                    href={detailHref("source", { value: s.name })}
                  >
                    <i style={{ background: palettes[Math.min(i, 5)] }} />
                    <span>{s.name}</span>
                    <b>
                      {((s.count / sourceTotal) * 100).toFixed(1)}%{" "}
                      <small>({s.count})</small>
                    </b>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </Panel>
        <Panel
          title="Top courses by interest"
          icon={Layers}
          action={
            <Link href="/operations">
              View catalog <ArrowRight size={14} />
            </Link>
          }
        >
          {!model.courseAvailable || !model.courses.length ? (
            <Empty
              icon={BookOpen}
              title={
                model.courseAvailable
                  ? "No course interest recorded"
                  : "Course evidence unavailable"
              }
              text="Recorded course choices from new leads will appear here."
            />
          ) : (
            <>
              <div className="home-course-list">
                {model.courses.slice(0, 5).map((c, i) => (
                  <Link
                    href={detailHref("course", { value: c.name })}
                    key={c.name}
                  >
                    <span>{c.name}</span>
                    <span className="home-bar">
                      <i
                        style={{
                          width: `${(c.count / (model.leads.current || 1)) * 100}%`,
                          background: palettes[Math.min(i, 4)],
                        }}
                      />
                    </span>
                    <b>
                      {Math.round((c.count / (model.leads.current || 1)) * 100)}
                      %
                    </b>
                  </Link>
                ))}
              </div>
              <p className="home-footnote">
                Current recorded course choice · leads created in period.
                Historical interest changes are not reconstructed.
              </p>
            </>
          )}
        </Panel>
        <Panel title="Campaign performance" icon={Megaphone}>
          <Empty
            icon={Megaphone}
            title="Open the campaign workspace"
            text="Campaign delivery, spend and attribution use their own verified reporting. Email opens and click rates are not available on Home."
            href="/campaigns"
            cta="Review campaigns"
          />
        </Panel>
      </div>

      <div className="home-bottom-grid">
        <Panel
          title="CRM insights"
          icon={Sparkles}
          className="home-insights"
          action={
            <Link className="home-primary" href="/marketing">
              Explore Intelligence <ArrowRight size={14} />
            </Link>
          }
        >
          <div className="home-insight-list">
            <Insight
              icon={
                model.leads.current &&
                model.leads.previous !== null &&
                model.leads.current >= model.leads.previous
                  ? ArrowUp
                  : BarChart3
              }
              title={
                model.leads.current === null
                  ? "Lead volume needs evidence"
                  : `${model.leads.current.toLocaleString()} leads in this period`
              }
              text={
                model.leads.previous === null
                  ? "Review reporting availability."
                  : `Previous equal period: ${model.leads.previous.toLocaleString()}. Inspect the records before acting.`
              }
              href={detailHref("leads")}
            />
            <Insight
              icon={MessageCircle}
              title={
                metrics
                  ? metrics.needsReply > 0
                    ? `${metrics.needsReply.toLocaleString()} leads need a reply`
                    : "No replies waiting"
                  : "Review the conversation queue"
              }
              text="Current operational queue. Review and respond in the inbox."
              href="/conversations"
            />
            <Insight
              icon={Target}
              title={
                model.courses[0]
                  ? `${model.courses[0].name} leads interest`
                  : "Build your interest evidence"
              }
              text={
                model.courses[0]
                  ? `${model.courses[0].count} new leads have this recorded choice. Review their needs before outreach.`
                  : "Record course preferences to spot demand."
              }
              href={
                model.courses[0]
                  ? detailHref("course", { value: model.courses[0].name })
                  : "/leads"
              }
            />
          </div>
          <p className="home-footnote">
            Rules based on visible CRM evidence · suggestions only. No automatic
            outreach or record changes.
          </p>
        </Panel>
        <Panel
          title="System status"
          icon={Layers}
          action={
            <Link href="/settings/overview">
              Review setup <ArrowRight size={14} />
            </Link>
          }
        >
          <div className="home-system-list">
            <div>
              <ShieldCheck size={21} />
              <span>
                Reporting
                <small
                  className={incomplete ? "home-neutral-pill" : "home-ok-pill"}
                >
                  {incomplete ? "Needs review" : "Available"}
                </small>
              </span>
            </div>
            <Link href="/automation">
              <Layers size={21} />
              <span>
                Automations
                <small className="home-neutral-pill">Review health</small>
              </span>
            </Link>
            <Link href="/campaigns">
              <Megaphone size={21} />
              <span>
                Campaigns
                <small className="home-neutral-pill">Review health</small>
              </span>
            </Link>
          </div>
          <p className="home-footnote">
            Reporting availability does not confirm provider or automation
            health.
          </p>
        </Panel>
      </div>
      <details className="home-definitions">
        <summary>How these numbers are defined</summary>
        <p>
          UTC reporting days. New leads exclude archived leads. Qualified+
          counts this new-lead cohort reaching qualified, high intent, payment
          pending, enrolled or closed won before period end, including preceding
          implied steps. Enrolled leads counts unique CRM enrolled-stage
          transitions in the period; it is not the authoritative operational
          Enrollment-record count. Conversation totals count distinct
          conversations with accepted message activity; human replies count
          outbound human messages. Net collected uses paid_at and recorded paid
          receipts less refunds, without currency conversion. Course and source
          fields reflect their current stored values. Each evidence stream is
          limited to 10,000 records; capped or failed reads are unavailable
          rather than partial totals. Reporting reads are refreshed on
          navigation and are not a single database snapshot.
        </p>
      </details>
      {detailTitles[detail] && (
        <HomeRecordDialog
          title={`${detailTitles[detail]}${one(query.value) ? ` · ${one(query.value)}` : ""}${one(query.day) ? ` · ${one(query.day)}` : ""}`}
          records={selectedRecords.slice((page - 1) * 50, page * 50)}
          total={selectedRecords.length}
          page={page}
          period={period.label}
          closeHref={href()}
          baseHref={detailHref(detail, {
            ...(one(query.value) ? { value: one(query.value) } : {}),
            ...(one(query.day) ? { day: one(query.day) } : {}),
          })}
          description="These records support the selected card and period. Open a record to continue in its workspace."
        />
      )}
    </div>
  );
}

function Metric({
  title,
  icon: Icon,
  metric,
  href,
  note,
  showChange = true,
}: {
  title: string;
  icon: LucideIcon;
  metric: HomeMetric;
  href: string;
  note: string;
  showChange?: boolean;
}) {
  return (
    <article className="home-card home-kpi">
      <span className="home-kpi-icon">
        <Icon size={27} strokeWidth={1.7} />
      </span>
      <div>
        <span className="home-kpi-label">{title}</span>
        <Link className="home-kpi-value" href={href}>
          {metric.current === null ? "—" : metric.current.toLocaleString()}
        </Link>
        {showChange && (
          <Change current={metric.current} previous={metric.previous} />
        )}
        <p>{metric.current === null ? "Evidence unavailable" : note}</p>
      </div>
    </article>
  );
}
function Change({
  current,
  previous,
}: {
  current: number | null;
  previous: number | null;
}) {
  const change = percentageChange(current, previous);
  return current === null || previous === null ? null : change === null ? (
    <span className="home-change neutral">
      {current === 0 ? "No change" : "No prior activity"}
    </span>
  ) : (
    <span
      className={`home-change ${change > 0 ? "up" : change < 0 ? "down" : "neutral"}`}
    >
      {change > 0 ? (
        <ArrowUp size={12} />
      ) : change < 0 ? (
        <ArrowDown size={12} />
      ) : null}
      {change > 0 ? "+" : ""}
      {change}%
    </span>
  );
}
function Panel({
  title,
  icon: Icon,
  action,
  children,
  className = "",
}: {
  title: string;
  icon: LucideIcon;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`home-card home-panel ${className}`}>
      <header>
        <h2>
          <Icon size={21} strokeWidth={1.7} />
          {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}
function Empty({
  icon: Icon,
  title,
  text,
  href,
  cta,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  href?: string;
  cta?: string;
}) {
  return (
    <div className="home-empty">
      <span>
        <Icon size={24} strokeWidth={1.5} />
      </span>
      <strong>{title}</strong>
      <p>{text}</p>
      {href && (
        <Link href={href}>
          {cta}
          <ArrowRight size={13} />
        </Link>
      )}
    </div>
  );
}
function Insight({
  icon: Icon,
  title,
  text,
  href,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  href: string;
}) {
  return (
    <Link href={href}>
      <span className="home-insight-icon">
        <Icon size={21} />
      </span>
      <span>
        <strong>{title}</strong>
        <small>{text}</small>
      </span>
    </Link>
  );
}
