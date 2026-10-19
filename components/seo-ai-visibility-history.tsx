import { AlertTriangle, BarChart3, Bot, CheckCircle2, Clock3, Eye, Link2 } from "lucide-react";

import { getProviderVisibility } from "@/lib/integrations/provider-visibility";
import { createClient } from "@/lib/supabase/server";

type ProbeHistoryRow = {
  run_id: string;
  provider: string | null;
  model_name: string | null;
  probe_kind: string | null;
  prompt_text: string | null;
  locale: string | null;
  country_code: string | null;
  status: string | null;
  requested_at: string | null;
  completed_at: string | null;
  observed_at: string | null;
  brand_mentioned: boolean | null;
  brand_recommended: boolean | null;
  mention_count: number | string | null;
  recommendation_position: number | string | null;
  citation_count: number | string | null;
  owned_domain_citation_count: number | string | null;
  cited_domains: string[] | null;
  measured_result: string | null;
  error_message: string | null;
};

function asNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function humanize(value: string | null | undefined) {
  if (!value) return "Unknown";
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function resultClass(result: string | null | undefined) {
  if (result === "recommended") return "bg-emerald-50 text-emerald-700";
  if (result === "mentioned") return "bg-sky-50 text-sky-700";
  if (result === "not_observed") return "bg-slate-100 text-slate-600";
  if (result === "failed") return "bg-rose-50 text-rose-700";
  if (result === "in_progress") return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

export async function SeoAiVisibilityHistory() {
  const supabase = await createClient();

  let organizationId: string;
  try {
    const visibility = await getProviderVisibility(supabase);
    organizationId = visibility.organizationId;
  } catch (error) {
    console.error("SEO_AI_VISIBILITY_HISTORY_VISIBILITY_FAILED", error);
    return null;
  }

  const { data, error } = await supabase
    .from("v_seo_ai_visibility_probe_history_v1")
    .select(
      "run_id,provider,model_name,probe_kind,prompt_text,locale,country_code,status,requested_at,completed_at,observed_at,brand_mentioned,brand_recommended,mention_count,recommendation_position,citation_count,owned_domain_citation_count,cited_domains,measured_result,error_message",
    )
    .eq("organization_id", organizationId)
    .order("requested_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("SEO_AI_VISIBILITY_HISTORY_QUERY_FAILED", error);
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">AI visibility history is temporarily unavailable</div>
            <p className="mt-1 text-xs leading-5 text-amber-800">
              Probe execution remains available, but recent measured history could not be loaded for this request.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const rows = (data ?? []) as ProbeHistoryRow[];
  const completedRows = rows.filter((row) => row.status === "completed" && row.observed_at);
  const mentionedRows = completedRows.filter((row) => row.brand_mentioned === true);
  const recommendedRows = completedRows.filter((row) => row.brand_recommended === true);
  const citationRows = completedRows.filter((row) => asNumber(row.citation_count) > 0);
  const mentionRate = completedRows.length > 0 ? (mentionedRows.length / completedRows.length) * 100 : 0;
  const recommendationRate = completedRows.length > 0 ? (recommendedRows.length / completedRows.length) * 100 : 0;
  const bestPosition = recommendedRows.reduce<number | null>((best, row) => {
    const position = asNumber(row.recommendation_position);
    if (position <= 0) return best;
    return best === null ? position : Math.min(best, position);
  }, null);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <BarChart3 size={17} className="text-cyan-700" />
              AI visibility probe history
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
              Recent directly measured model observations. Rates below are calculated only from completed probes with stored observations; AEO/GEO readiness and AI-referral traffic are not included.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {rows.length} recent run{rows.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <HistoryMetric
            icon={<Eye size={15} />}
            label="Mention rate"
            value={`${mentionRate.toFixed(0)}%`}
            detail={`${mentionedRows.length} of ${completedRows.length} measured probes`}
          />
          <HistoryMetric
            icon={<CheckCircle2 size={15} />}
            label="Recommendation rate"
            value={`${recommendationRate.toFixed(0)}%`}
            detail={`${recommendedRows.length} of ${completedRows.length} measured probes`}
          />
          <HistoryMetric
            icon={<Bot size={15} />}
            label="Best recommendation"
            value={bestPosition ? `#${bestPosition}` : "—"}
            detail={recommendedRows.length > 0 ? `${recommendedRows.length} recommendation observations` : "No measured recommendation yet"}
          />
          <HistoryMetric
            icon={<Link2 size={15} />}
            label="Citation evidence"
            value={`${citationRows.length} runs`}
            detail="Counts only explicitly stored citation evidence"
          />
        </div>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-5 py-8 text-center">
            <Clock3 size={21} className="mx-auto text-slate-300" />
            <div className="mt-2 text-sm font-semibold text-slate-700">No AI visibility probe history yet</div>
            <p className="mx-auto mt-1 max-w-2xl text-xs leading-5 text-slate-400">
              Run the first authenticated AI Visibility Probe above. Once a model observation is stored, its measured mention, recommendation and citation evidence will appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5">Measured</th>
                    <th className="px-3 py-2.5">Probe</th>
                    <th className="px-3 py-2.5">Provider / model</th>
                    <th className="px-3 py-2.5">Result</th>
                    <th className="px-3 py-2.5">Mentions</th>
                    <th className="px-3 py-2.5">Recommendation</th>
                    <th className="px-3 py-2.5">Citations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white text-slate-600">
                  {rows.map((row) => (
                    <tr key={row.run_id} className="align-top">
                      <td className="whitespace-nowrap px-3 py-3 text-slate-500">
                        {formatDateTime(row.observed_at || row.completed_at || row.requested_at)}
                      </td>
                      <td className="max-w-[320px] px-3 py-3">
                        <div className="font-semibold text-slate-700">{humanize(row.probe_kind)}</div>
                        {row.prompt_text ? <div className="mt-1 line-clamp-2 leading-5 text-slate-400">{row.prompt_text}</div> : null}
                        {row.country_code || row.locale ? (
                          <div className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">
                            {[row.locale, row.country_code].filter(Boolean).join(" · ")}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-slate-700">{row.provider || "—"}</div>
                        <div className="mt-1 max-w-[180px] truncate text-slate-400">{row.model_name || "—"}</div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${resultClass(row.measured_result)}`}>
                          {humanize(row.measured_result)}
                        </span>
                        {row.error_message ? <div className="mt-1 max-w-[220px] text-[10px] leading-4 text-rose-500">{row.error_message}</div> : null}
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-700">{asNumber(row.mention_count)}</td>
                      <td className="px-3 py-3">
                        {row.brand_recommended ? (
                          <span className="font-semibold text-emerald-700">
                            Yes{asNumber(row.recommendation_position) > 0 ? ` · #${asNumber(row.recommendation_position)}` : ""}
                          </span>
                        ) : (
                          <span className="text-slate-400">No</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-semibold text-slate-700">{asNumber(row.citation_count)}</div>
                        {asNumber(row.owned_domain_citation_count) > 0 ? (
                          <div className="mt-1 text-[10px] text-cyan-700">{asNumber(row.owned_domain_citation_count)} owned-domain</div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="text-[11px] leading-5 text-slate-400">
          Trend rates are descriptive observations over the recent stored probe sample. They do not imply that content changes caused model visibility.
        </p>
      </div>
    </section>
  );
}

function HistoryMetric({
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
      <div className="mt-1 text-xs leading-5 text-slate-500">{detail}</div>
    </div>
  );
}
