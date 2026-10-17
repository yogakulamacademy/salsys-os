"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Bot,
  FlaskConical,
  Globe2,
  Search,
  Sparkles,
  Target,
  Wrench,
} from "lucide-react";

type SeoMode =
  | "all"
  | "opportunity"
  | "revenue"
  | "content"
  | "technical"
  | "aeo"
  | "geo"
  | "experiments";

type SearchItem = {
  id: string;
  score: number | null;
  entityType: string | null;
  entityId: string | null;
  source: Record<string, unknown>;
  highlights: Record<string, string[]>;
};

type SearchResponse = {
  ok: boolean;
  query?: string;
  mode?: SeoMode;
  total?: number;
  took_ms?: number;
  items?: SearchItem[];
  error?: string;
};

const modes: Array<{ key: SeoMode; label: string; icon: typeof Search }> = [
  { key: "all", label: "All", icon: Search },
  { key: "opportunity", label: "Opportunities", icon: Target },
  { key: "revenue", label: "Revenue", icon: BarChart3 },
  { key: "content", label: "Content", icon: Sparkles },
  { key: "technical", label: "Technical", icon: Wrench },
  { key: "aeo", label: "AEO", icon: Bot },
  { key: "geo", label: "GEO / AI", icon: Globe2 },
  { key: "experiments", label: "Experiments", icon: FlaskConical },
];

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function plainHighlight(value: string) {
  return value.replace(/<\/?mark>/gi, "").replace(/\s+/g, " ").trim();
}

function titleFor(item: SearchItem) {
  const source = item.source;
  return (
    text(source.title) ||
    text(source.topic_name) ||
    text(source.semantic_entity_name) ||
    text(source.experiment_title) ||
    text(source.target_url) ||
    text(source.url_path) ||
    "SEO intelligence result"
  );
}

function subtitleFor(item: SearchItem) {
  const source = item.source;
  for (const key of [
    "meta_description",
    "description",
    "action_reason",
    "recommendation",
    "hypothesis",
    "learning_summary",
  ]) {
    const highlighted = item.highlights[key]?.[0];
    if (highlighted) return plainHighlight(highlighted).slice(0, 240);
    const value = text(source[key]);
    if (value) return value.slice(0, 240);
  }
  return text(source.normalized_url) || text(source.target_url) || "";
}

function entityLabel(entityType: string | null) {
  switch (entityType) {
    case "seo_page":
      return "Page";
    case "seo_topic":
      return "Topic";
    case "seo_entity":
      return "Entity";
    case "seo_experiment":
      return "Experiment";
    case "seo_action":
      return "Optimization";
    default:
      return "SEO";
  }
}

function metricChips(item: SearchItem) {
  const source = item.source;
  const chips: string[] = [];

  const opportunity = numberValue(source.opportunity_score);
  if (opportunity !== null) chips.push(`Opportunity ${Math.round(opportunity)}`);

  const priority = numberValue(source.action_priority_score ?? source.priority_score);
  if (priority !== null) chips.push(`Priority ${Math.round(priority)}`);

  const impressions = numberValue(source.gsc_impressions);
  if (impressions !== null) chips.push(`${Math.round(impressions).toLocaleString()} impressions`);

  const clicks = numberValue(source.gsc_clicks);
  if (clicks !== null) chips.push(`${Math.round(clicks).toLocaleString()} clicks`);

  const leads = numberValue(source.organic_leads);
  if (leads !== null) chips.push(`${Math.round(leads)} organic leads`);

  const answer = numberValue(source.answer_readiness_score);
  if (answer !== null) chips.push(`AEO ${Math.round(answer)}`);

  const geo = numberValue(source.generative_readiness_score);
  if (geo !== null) chips.push(`GEO ${Math.round(geo)}`);

  return chips.slice(0, 5);
}

export function SeoIntelligenceSearch() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SeoMode>("opportunity");
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ mode, limit: "20" });
        if (query.trim()) params.set("q", query.trim());
        const result = await fetch(`/api/seo/search/v1?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await result.json()) as SearchResponse;
        setResponse(body);
      } catch (error) {
        if ((error as Error)?.name !== "AbortError") {
          setResponse({ ok: false, error: "SEO intelligence search is temporarily unavailable." });
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, mode]);

  const items = response?.items ?? [];
  const meta = useMemo(() => {
    if (!response?.ok) return null;
    return `${response.total ?? 0} results · ${response.took_ms ?? 0} ms`;
  }, [response]);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ask SEO data: pages with traffic but no leads, weak AEO pages, content gaps..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
            />
          </div>
          <div className="text-xs font-semibold text-slate-400">
            {loading ? "Searching…" : meta || "OpenSearch intelligence"}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {modes.map((item) => {
            const Icon = item.icon;
            const active = mode === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setMode(item.key)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                <Icon size={13} />
                {item.label}
              </button>
            );
          })}
        </div>
      </section>

      {!response?.ok && response?.error ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">SEO intelligence search is not available yet</div>
            <div className="mt-1 text-xs leading-5">{response.error}</div>
          </div>
        </div>
      ) : null}

      {response?.ok && items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
          <Search size={24} className="mx-auto text-slate-300" />
          <div className="mt-2 text-sm font-semibold text-slate-700">No matching SEO intelligence yet</div>
          <div className="mt-1 text-xs text-slate-400">
            Try another phrase or intelligence mode. Once the OpenSearch pilot is indexed, this workspace will rank live SEO opportunities.
          </div>
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className="grid gap-3">
          {items.map((item) => {
            const source = item.source;
            const action = text(source.recommended_action) || text(source.seo_action_kind);
            const url = text(source.normalized_url) || text(source.target_url);
            return (
              <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        {entityLabel(item.entityType)}
                      </span>
                      {action ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                          {action.replace(/_/g, " ")}
                        </span>
                      ) : null}
                    </div>
                    <h3 className="mt-2 text-sm font-semibold text-slate-900">{titleFor(item)}</h3>
                    {url ? <div className="mt-1 truncate text-[11px] text-slate-400">{url}</div> : null}
                    <p className="mt-2 text-xs leading-5 text-slate-600">{subtitleFor(item)}</p>
                  </div>
                  {item.score !== null ? (
                    <div className="shrink-0 rounded-xl bg-slate-50 px-3 py-2 text-right">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Relevance</div>
                      <div className="mt-0.5 text-sm font-bold text-slate-700">{item.score.toFixed(1)}</div>
                    </div>
                  ) : null}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {metricChips(item).map((chip) => (
                    <span key={chip} className="rounded-full border border-slate-200 px-2.5 py-1 text-[10px] font-semibold text-slate-500">
                      {chip}
                    </span>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
