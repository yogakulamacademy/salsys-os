import { AlertTriangle, Bot, CheckCircle2, Eye, Link2, MessageSquareQuote } from "lucide-react";

import { getProviderVisibility } from "@/lib/integrations/provider-visibility";
import { createClient } from "@/lib/supabase/server";

type SeoR9HealthRow = {
  aeo_page_rows: number | string | null;
  aeo_crawled_pages: number | string | null;
  pages_with_answer_sections: number | string | null;
  pages_with_answer_demand: number | string | null;
  pages_with_high_opportunity_answers: number | string | null;
  answer_query_rows: number | string | null;
  high_opportunity_answer_queries: number | string | null;
  answer_query_clicks: number | string | null;
  answer_query_impressions: number | string | null;
  geo_page_rows: number | string | null;
  geo_crawled_pages: number | string | null;
  pages_with_ai_referrals: number | string | null;
  ai_referral_sessions: number | string | null;
  ai_linked_leads: number | string | null;
  strong_geo_readiness_pages: number | string | null;
  geo_action_pages: number | string | null;
  observed_ai_providers: number | string | null;
  ga4_ai_sessions: number | string | null;
  ga4_ai_users: number | string | null;
  ga4_ai_engaged_sessions: number | string | null;
  ga4_ai_key_events: number | string | null;
  probe_runs: number | string | null;
  completed_probe_runs: number | string | null;
  failed_probe_runs: number | string | null;
  pending_probe_runs: number | string | null;
  probed_providers: number | string | null;
  model_observations: number | string | null;
  mention_observations: number | string | null;
  recommendation_observations: number | string | null;
  total_brand_mentions: number | string | null;
  best_recommendation_position: number | string | null;
  citations_observed: number | string | null;
  owned_domain_citations: number | string | null;
  cited_domains: number | string | null;
  operational_status: string | null;
  measured_model_visibility_available: boolean | null;
  ai_referrals_are_observed: boolean | null;
  readiness_is_deterministic: boolean | null;
  citation_evidence_available: boolean | null;
};

function asNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function humanize(value: string | null | undefined) {
  if (!value) return "Unknown";
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export async function SeoR9Health() {
  const supabase = await createClient();

  let organizationId: string;
  try {
    const visibility = await getProviderVisibility(supabase);
    organizationId = visibility.organizationId;
  } catch (error) {
    console.error("SEO_R9_HEALTH_VISIBILITY_FAILED", error);
    return null;
  }

  const { data, error } = await supabase
    .from("v_seo_r9_health_v1")
    .select(
      "aeo_page_rows,aeo_crawled_pages,pages_with_answer_sections,pages_with_answer_demand,pages_with_high_opportunity_answers,answer_query_rows,high_opportunity_answer_queries,answer_query_clicks,answer_query_impressions,geo_page_rows,geo_crawled_pages,pages_with_ai_referrals,ai_referral_sessions,ai_linked_leads,strong_geo_readiness_pages,geo_action_pages,observed_ai_providers,ga4_ai_sessions,ga4_ai_users,ga4_ai_engaged_sessions,ga4_ai_key_events,probe_runs,completed_probe_runs,failed_probe_runs,pending_probe_runs,probed_providers,model_observations,mention_observations,recommendation_observations,total_brand_mentions,best_recommendation_position,citations_observed,owned_domain_citations,cited_domains,operational_status,measured_model_visibility_available,ai_referrals_are_observed,readiness_is_deterministic,citation_evidence_available",
    )
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("SEO_R9_HEALTH_QUERY_FAILED", error);
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">R9 health is temporarily unavailable</div>
            <p className="mt-1 text-xs leading-5 text-amber-800">
              AEO/GEO intelligence remains available, but the canonical R9 evidence-health model could not be loaded for this request.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const row = (data ?? null) as SeoR9HealthRow | null;
  if (!row) return null;

  const status = row.operational_status ?? "unknown";
  const hasMeasuredVisibility = row.measured_model_visibility_available === true;
  const bestPosition = asNumber(row.best_recommendation_position);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            {hasMeasuredVisibility ? (
              <CheckCircle2 size={18} className="text-emerald-600" />
            ) : (
              <AlertTriangle size={18} className="text-amber-600" />
            )}
            R9 · AEO / GEO / AI visibility health
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
            Separates answer-engine demand, observed AI referral traffic and directly measured model visibility. Readiness scores are deterministic signals and are never presented as proof of a model mention, recommendation or citation.
          </p>
        </div>

        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            hasMeasuredVisibility
              ? "bg-emerald-50 text-emerald-700"
              : status === "probe_evidence_not_started"
                ? "bg-amber-50 text-amber-700"
                : "bg-slate-100 text-slate-600"
          }`}
        >
          {humanize(status)}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HealthMetric
          icon={<MessageSquareQuote size={16} />}
          label="Answer demand"
          value={`${asNumber(row.pages_with_answer_demand)} pages`}
          detail={`${asNumber(row.answer_query_impressions).toLocaleString()} impressions · ${asNumber(row.answer_query_clicks).toLocaleString()} clicks`}
        />
        <HealthMetric
          icon={<Link2 size={16} />}
          label="Observed AI referrals"
          value={`${asNumber(row.ga4_ai_sessions).toLocaleString()} sessions`}
          detail={`${asNumber(row.observed_ai_providers)} providers · ${asNumber(row.ai_linked_leads)} linked lead${asNumber(row.ai_linked_leads) === 1 ? "" : "s"}`}
        />
        <HealthMetric
          icon={<Bot size={16} />}
          label="Model probes"
          value={`${asNumber(row.completed_probe_runs)} completed`}
          detail={`${asNumber(row.pending_probe_runs)} pending · ${asNumber(row.failed_probe_runs)} failed`}
        />
        <HealthMetric
          icon={<Eye size={16} />}
          label="Measured visibility"
          value={`${asNumber(row.mention_observations)} mentions`}
          detail={`${asNumber(row.recommendation_observations)} recommendations${bestPosition > 0 ? ` · best position ${bestPosition}` : ""}`}
        />
      </div>

      <div className="mt-4 grid gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <span className="font-semibold text-slate-800">Answer sections:</span>{" "}
          {asNumber(row.pages_with_answer_sections)} / {asNumber(row.aeo_crawled_pages)} crawled pages
        </div>
        <div>
          <span className="font-semibold text-slate-800">High-opportunity answers:</span>{" "}
          {asNumber(row.high_opportunity_answer_queries)} queries
        </div>
        <div>
          <span className="font-semibold text-slate-800">Strong GEO readiness:</span>{" "}
          {asNumber(row.strong_geo_readiness_pages)} pages
        </div>
        <div>
          <span className="font-semibold text-slate-800">Observed citations:</span>{" "}
          {asNumber(row.citations_observed)} total · {asNumber(row.owned_domain_citations)} owned-domain
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-sky-100 bg-sky-50/60 px-3 py-3 text-xs leading-5 text-sky-800">
        <span className="font-semibold">Evidence boundary:</span>{" "}
        AI referrals are observed traffic evidence. AEO/GEO readiness is deterministic content evidence. Model mentions, recommendations and citations count only after a real probe observation is stored.
      </div>
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
