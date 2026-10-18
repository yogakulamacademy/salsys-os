import { AlertTriangle, CheckCircle2, Database, FlaskConical, SearchCheck } from "lucide-react";

import { getProviderVisibility } from "@/lib/integrations/provider-visibility";
import { createClient } from "@/lib/supabase/server";

type SeoR8HealthRow = {
  latest_gsc_date: string | null;
  gsc_freshness_days: number | string | null;
  gsc_status: string | null;
  page_inventory_count: number | string | null;
  crawled_page_count: number | string | null;
  crawl_coverage_pct: number | string | null;
  crawl_queue_count: number | string | null;
  semantic_coverage_pct: number | string | null;
  semantic_status: string | null;
  pages_with_business_signal: number | string | null;
  deterministic_action_candidates: number | string | null;
  open_optimization_actions: number | string | null;
  active_experiments: number | string | null;
  completed_experiments: number | string | null;
  learning_events: number | string | null;
  learning_status: string | null;
  r8_data_readiness_band: string | null;
  readiness_reason: string | null;
};

function asNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function humanize(value: string | null | undefined) {
  if (!value) return "Unknown";
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export async function SeoR8Health() {
  const supabase = await createClient();

  let organizationId: string;
  try {
    const visibility = await getProviderVisibility(supabase);
    organizationId = visibility.organizationId;
  } catch (error) {
    console.error("SEO_R8_HEALTH_VISIBILITY_FAILED", error);
    return null;
  }

  const { data, error } = await supabase
    .from("v_seo_r8_health_v1")
    .select(
      "latest_gsc_date,gsc_freshness_days,gsc_status,page_inventory_count,crawled_page_count,crawl_coverage_pct,crawl_queue_count,semantic_coverage_pct,semantic_status,pages_with_business_signal,deterministic_action_candidates,open_optimization_actions,active_experiments,completed_experiments,learning_events,learning_status,r8_data_readiness_band,readiness_reason",
    )
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("SEO_R8_HEALTH_QUERY_FAILED", error);
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">R8 health is temporarily unavailable</div>
            <p className="mt-1 text-xs leading-5 text-amber-800">
              SEO Intelligence is still available, but the canonical R8 readiness model could not be loaded for this request.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const row = (data ?? null) as SeoR8HealthRow | null;
  if (!row) return null;

  const readiness = row.r8_data_readiness_band ?? "unknown";
  const healthy = readiness === "ready";
  const crawled = asNumber(row.crawled_page_count);
  const inventory = asNumber(row.page_inventory_count);
  const queue = asNumber(row.crawl_queue_count);
  const crawlCoverage = asNumber(row.crawl_coverage_pct);
  const semanticCoverage = asNumber(row.semantic_coverage_pct);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            {healthy ? (
              <CheckCircle2 size={18} className="text-emerald-600" />
            ) : (
              <AlertTriangle size={18} className="text-amber-600" />
            )}
            R8 · Content + SEO Intelligence health
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
            Canonical production readiness for SEO data, crawl evidence, semantic coverage, business signals and the experiment-learning loop. This is an operational data-health view, not a claim that optimization caused an outcome.
          </p>
        </div>

        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            healthy
              ? "bg-emerald-50 text-emerald-700"
              : readiness === "degraded"
                ? "bg-amber-50 text-amber-700"
                : "bg-slate-100 text-slate-600"
          }`}
        >
          {humanize(readiness)}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HealthMetric
          icon={<SearchCheck size={16} />}
          label="GSC freshness"
          value={humanize(row.gsc_status)}
          detail={`${formatDate(row.latest_gsc_date)} · ${asNumber(row.gsc_freshness_days)} days`}
        />
        <HealthMetric
          icon={<Database size={16} />}
          label="Crawl coverage"
          value={`${crawlCoverage.toFixed(1)}%`}
          detail={`${crawled} of ${inventory} pages · ${queue} queued`}
        />
        <HealthMetric
          icon={<SearchCheck size={16} />}
          label="Semantic coverage"
          value={`${semanticCoverage.toFixed(1)}%`}
          detail={humanize(row.semantic_status)}
        />
        <HealthMetric
          icon={<FlaskConical size={16} />}
          label="Learning loop"
          value={humanize(row.learning_status)}
          detail={`${asNumber(row.completed_experiments)} completed experiments · ${asNumber(row.learning_events)} learning events`}
        />
      </div>

      <div className="mt-4 grid gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600 sm:grid-cols-3">
        <div>
          <span className="font-semibold text-slate-800">Business-signal pages:</span>{" "}
          {asNumber(row.pages_with_business_signal)}
        </div>
        <div>
          <span className="font-semibold text-slate-800">SEO action candidates:</span>{" "}
          {asNumber(row.deterministic_action_candidates)}
        </div>
        <div>
          <span className="font-semibold text-slate-800">Open approved-action workload:</span>{" "}
          {asNumber(row.open_optimization_actions)}
        </div>
      </div>

      {row.readiness_reason && (
        <p className="mt-3 text-xs leading-5 text-slate-500">{row.readiness_reason}</p>
      )}
    </section>
  );
}

function HealthMetric({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        <span className="text-slate-400">{icon}</span>
        {label}
      </div>
      <div className="mt-2 text-lg font-semibold text-slate-900">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{detail}</div>
    </div>
  );
}
