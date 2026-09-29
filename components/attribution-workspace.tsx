"use client";

import {
  CircleDollarSign,
  Filter,
  MousePointerClick,
  Route,
  Search,
  Send,
  Smartphone,
  UsersRound,
  X,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type AttributionModelName =
  | "first_touch"
  | "lead_creation"
  | "last_touch"
  | "current_channel";

export type AttributionSortMode = "leads" | "qualified" | "enrolled" | "name";

export type AttributionWorkspaceFilters = {
  query: string;
  course: string;
  location: string;
  country: string;
  stage: string;
};

export type AttributionPerformanceRow = {
  modelName: AttributionModelName;
  value: string;
  leads: number;
  qualified: number;
  enrolled: number;
  revenueInr: number;
  revenueUsd: number;
};

export type AttributionMetricsRow = {
  modelName: AttributionModelName;
  total: number;
  known: number;
  unknown: number;
  coverage: number;
  qualified: number;
  enrolled: number;
  revenueInr: number;
  revenueUsd: number;
};

export type AttributionComparisonRow = {
  value: string;
  firstTouch: number;
  leadCreation: number;
  lastTouch: number;
  currentChannel: number;
};

export type AttributionWorkspaceOptions = {
  courses: string[];
  locations: string[];
  countries: string[];
  stages: string[];
};

export type AttributionWorkspacePayload = {
  metricsByModel: AttributionMetricsRow[];
  performanceRows: AttributionPerformanceRow[];
  comparison: AttributionComparisonRow[];
  options: AttributionWorkspaceOptions;
};

type PerformanceRow = {
  value: string;
  leads: number;
  qualified: number;
  enrolled: number;
  revenueInr: number;
  revenueUsd: number;
};

type ComparisonRow = AttributionComparisonRow;

const models: Array<{
  value: AttributionModelName;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    value: "first_touch",
    label: "First Touch",
    shortLabel: "First",
    description: "The source that originally acquired the lead.",
  },
  {
    value: "lead_creation",
    label: "Lead Creation",
    shortLabel: "Creation",
    description: "The channel where the CRM lead was actually created.",
  },
  {
    value: "last_touch",
    label: "Last Marketing Touch",
    shortLabel: "Last",
    description:
      "The most recent recorded marketing source before the current CRM state.",
  },
  {
    value: "current_channel",
    label: "Current Channel",
    shortLabel: "Current",
    description: "Where admissions is communicating with the lead now.",
  },
];

export function AttributionWorkspace({
  workspace,
  filters,
  loadError,
  warning,
}: {
  workspace: AttributionWorkspacePayload;
  filters: AttributionWorkspaceFilters;
  loadError: string | null;
  warning: string | null;
}) {
  const router = useRouter();

  const pathname = usePathname();

  const searchParams = useSearchParams();

  const [model, setModel] = useState<AttributionModelName>("first_touch");

  const [query, setQuery] = useState(filters.query);

  const [courseState, setCourseState] = useState(filters.course);

  const [locationState, setLocationState] = useState(filters.location);

  const [countryState, setCountryState] = useState(filters.country);

  const [stageState, setStageState] = useState(filters.stage);

  const [sortMode, setSortMode] = useState<AttributionSortMode>("leads");

  useEffect(() => {
    setQuery(filters.query);
  }, [filters.query]);

  useEffect(() => {
    setCourseState(filters.course);
  }, [filters.course]);

  useEffect(() => {
    setLocationState(filters.location);
  }, [filters.location]);

  useEffect(() => {
    setCountryState(filters.country);
  }, [filters.country]);

  useEffect(() => {
    setStageState(filters.stage);
  }, [filters.stage]);

  const replaceParams = useCallback(
    (changes: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(changes)) {
        if (value == null || value === "" || value === "all") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }

      const queryString = params.toString();

      router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    const next = query.trim();

    if (next === filters.query) {
      return;
    }

    const timer = window.setTimeout(() => {
      replaceParams({
        q: next || null,
      });
    }, 350);

    return () => window.clearTimeout(timer);
  }, [filters.query, query, replaceParams]);

  const course = courseState;

  const location = locationState;

  const country = countryState;

  const stage = stageState;

  const setCourse = (value: string) => {
    setCourseState(value);

    replaceParams({
      course: value === "all" ? null : value,
    });
  };

  const setLocation = (value: string) => {
    setLocationState(value);

    replaceParams({
      location: value === "all" ? null : value,
    });
  };

  const setCountry = (value: string) => {
    setCountryState(value);

    replaceParams({
      country: value === "all" ? null : value,
    });
  };

  const setStage = (value: string) => {
    setStageState(value);

    replaceParams({
      stage: value === "all" ? null : value,
    });
  };

  const courses = workspace.options.courses;

  const locations = workspace.options.locations;

  const countries = workspace.options.countries;

  const stages = workspace.options.stages;

  const metrics = workspace.metricsByModel.find(
    (item) => item.modelName === model,
  ) ?? {
    modelName: model,
    total: 0,
    known: 0,
    unknown: 0,
    coverage: 0,
    qualified: 0,
    enrolled: 0,
    revenueInr: 0,
    revenueUsd: 0,
  };

  const performance = useMemo(() => {
    const result = workspace.performanceRows
      .filter((row) => row.modelName === model)
      .map(
        (row): PerformanceRow => ({
          value: row.value,
          leads: row.leads,
          qualified: row.qualified,
          enrolled: row.enrolled,
          revenueInr: row.revenueInr,
          revenueUsd: row.revenueUsd,
        }),
      );

    return result.sort((a, b) => {
      if (sortMode === "name") {
        return a.value.localeCompare(b.value);
      }

      if (sortMode === "qualified") {
        return b.qualified - a.qualified;
      }

      if (sortMode === "enrolled") {
        return b.enrolled - a.enrolled;
      }

      return b.leads - a.leads;
    });
  }, [model, sortMode, workspace.performanceRows]);

  const coverageByModel = models.map((item) => {
    const row = workspace.metricsByModel.find(
      (metric) => metric.modelName === item.value,
    );

    return {
      ...item,
      total: row?.total ?? 0,
      known: row?.known ?? 0,
      unknown: row?.unknown ?? 0,
      coverage: row?.coverage ?? 0,
    };
  });

  const comparison = workspace.comparison;

  const filtersActive =
    Boolean(filters.query) ||
    filters.course !== "all" ||
    filters.location !== "all" ||
    filters.country !== "all" ||
    filters.stage !== "all";

  const clearFilters = () => {
    setQuery("");
    setCourseState("all");
    setLocationState("all");
    setCountryState("all");
    setStageState("all");

    replaceParams({
      q: null,
      course: null,
      location: null,
      country: null,
      stage: null,
    });
  };

  const activeModel = models.find((item) => item.value === model) ?? models[0];

  return (
    <>
      {loadError && (
        <div className="mb-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Attribution data could not be loaded: {loadError}
        </div>
      )}

      {warning && (
        <div className="mb-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Attribution loaded through the legacy fallback. {warning}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Metric
          label="Leads"
          value={metrics.total.toLocaleString("en-IN")}
          note="in the selected attribution view"
          icon={<UsersRound size={18} />}
        />

        <Metric
          label="Known attribution"
          value={`${metrics.coverage.toFixed(1)}%`}
          note={`${metrics.known} known · ${metrics.unknown} unknown`}
          icon={<Route size={18} />}
        />

        <Metric
          label="Qualified+"
          value={metrics.qualified.toLocaleString("en-IN")}
          note={
            metrics.total > 0
              ? `${percent(
                  metrics.qualified,

                  metrics.total,
                )} of leads`
              : "no leads"
          }
          icon={<Filter size={18} />}
        />

        <Metric
          label="Enrolled"
          value={metrics.enrolled.toLocaleString("en-IN")}
          note={
            metrics.total > 0
              ? `${percent(
                  metrics.enrolled,

                  metrics.total,
                )} lead → enrolled`
              : "no leads"
          }
          icon={<UsersRound size={18} />}
        />

        <Metric
          label="INR revenue"
          value={formatMoney(
            metrics.revenueInr,

            "INR",
          )}
          note="net paid CRM revenue"
          icon={<CircleDollarSign size={18} />}
        />

        <Metric
          label="USD revenue"
          value={formatMoney(
            metrics.revenueUsd,

            "USD",
          )}
          note="net paid CRM revenue"
          icon={<CircleDollarSign size={18} />}
        />
      </div>

      <section className="card mt-4 overflow-hidden">
        <div className="border-b border-slate-100 p-4">
          <div className="flex flex-wrap gap-2">
            {models.map((item) => {
              const coverage = coverageByModel.find(
                (row) => row.value === item.value,
              );

              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setModel(item.value)}
                  className={`rounded-xl border px-3 py-2 text-left transition ${
                    model === item.value
                      ? "border-brand/20 bg-brand/[0.06] text-brand shadow-sm"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  <div className="text-xs font-black">{item.label}</div>

                  <div className="mt-0.5 text-[9px] font-semibold opacity-70">
                    {coverage
                      ? `${coverage.coverage.toFixed(1)}% known`
                      : "0% known"}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <div className="text-xs font-black uppercase tracking-[.08em] text-slate-400">
              {activeModel.label}
            </div>

            <div className="mt-1 text-sm text-slate-600">
              {activeModel.description}
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="flex min-w-0 flex-1 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 transition focus-within:border-brand/30 focus-within:bg-white focus-within:ring-4 focus-within:ring-brand/5">
              <Search size={15} className="shrink-0 text-slate-400" />

              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search source, campaign, lead or course..."
                className="w-full bg-transparent px-2 py-2.5 text-sm outline-none placeholder:text-slate-400"
              />
            </div>

            <select
              value={course}
              onChange={(event) => setCourse(event.target.value)}
              className="input xl:w-[190px]"
            >
              <option value="all">All courses</option>

              {courses.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            <select
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              className="input xl:w-[170px]"
            >
              <option value="all">All locations</option>

              {locations.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            <select
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              className="input xl:w-[160px]"
            >
              <option value="all">All countries</option>

              {countries.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            <select
              value={stage}
              onChange={(event) => setStage(event.target.value)}
              className="input xl:w-[170px]"
            >
              <option value="all">All stages</option>

              {stages.map((item) => (
                <option key={item} value={item}>
                  {pretty(item)}
                </option>
              ))}
            </select>

            {filtersActive && (
              <button
                type="button"
                onClick={clearFilters}
                className="btn-secondary"
              >
                <X size={14} />
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div>
            <div className="text-sm font-black text-slate-900">
              Attribution performance
            </div>

            <div className="mt-0.5 text-xs text-slate-400">
              {performance.length} source/channel values in the selected model
            </div>
          </div>

          <select
            value={sortMode}
            onChange={(event) =>
              setSortMode(event.target.value as AttributionSortMode)
            }
            className="input w-[170px]"
          >
            <option value="leads">Most leads</option>

            <option value="qualified">Most qualified</option>

            <option value="enrolled">Most enrolled</option>

            <option value="name">Name A–Z</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[10px] uppercase tracking-[0.1em] text-slate-400">
                <Header>Source / Channel</Header>

                <Header>Leads</Header>

                <Header>Share</Header>

                <Header>Qualified+</Header>

                <Header>Enrolled</Header>

                <Header>Qual. rate</Header>

                <Header>Lead → enrolled</Header>

                <Header>INR revenue</Header>

                <Header>USD revenue</Header>
              </tr>
            </thead>

            <tbody>
              {performance.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-5 py-14 text-center text-sm text-slate-500"
                  >
                    No attribution rows match these filters.
                  </td>
                </tr>
              ) : (
                performance.map((row) => (
                  <tr
                    key={row.value}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60"
                  >
                    <td className="px-4 py-4">
                      <div
                        className={`font-bold ${
                          row.value === "Unknown"
                            ? "text-amber-700"
                            : "text-slate-900"
                        }`}
                      >
                        {pretty(row.value)}
                      </div>
                    </td>

                    <td className="px-4 py-4 text-sm font-bold text-slate-800">
                      {row.leads}
                    </td>

                    <td className="px-4 py-4 text-sm text-slate-600">
                      {percent(
                        row.leads,

                        metrics.total,
                      )}
                    </td>

                    <td className="px-4 py-4 text-sm text-slate-700">
                      {row.qualified}
                    </td>

                    <td className="px-4 py-4 text-sm text-slate-700">
                      {row.enrolled}
                    </td>

                    <td className="px-4 py-4 text-sm text-slate-600">
                      {percent(
                        row.qualified,

                        row.leads,
                      )}
                    </td>

                    <td className="px-4 py-4 text-sm text-slate-600">
                      {percent(
                        row.enrolled,

                        row.leads,
                      )}
                    </td>

                    <td className="px-4 py-4 text-sm font-semibold text-slate-800">
                      {formatMoney(
                        row.revenueInr,

                        "INR",
                      )}
                    </td>

                    <td className="px-4 py-4 text-sm font-semibold text-slate-800">
                      {formatMoney(
                        row.revenueUsd,

                        "USD",
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
        <section className="card overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="eyebrow">Model comparison</div>

            <div className="section-title mt-1">
              How attribution changes by model
            </div>

            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
              The same lead can be acquired by one source, created in another
              channel, influenced later by a different source, and currently
              handled somewhere else.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[10px] uppercase tracking-[0.1em] text-slate-400">
                  <Header>Source / Channel</Header>

                  <Header>First Touch</Header>

                  <Header>Lead Creation</Header>

                  <Header>Last Touch</Header>

                  <Header>Current Channel</Header>
                </tr>
              </thead>

              <tbody>
                {comparison.map((row) => (
                  <tr
                    key={row.value}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <td className="px-4 py-3 text-sm font-bold text-slate-800">
                      {pretty(row.value)}
                    </td>

                    <MatrixNumber value={row.firstTouch} />

                    <MatrixNumber value={row.leadCreation} />

                    <MatrixNumber value={row.lastTouch} />

                    <MatrixNumber value={row.currentChannel} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card-pad">
          <div className="eyebrow">Attribution coverage</div>

          <div className="section-title mt-1">How complete is the data?</div>

          <div className="mt-5 space-y-5">
            {coverageByModel.map((item) => (
              <CoverageRow
                key={item.value}
                label={item.label}
                coverage={item.coverage}
                known={item.known}
                unknown={item.unknown}
              />
            ))}
          </div>

          <div className="mt-5 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
            <div className="text-xs font-black uppercase tracking-[.08em] text-amber-700">
              Unknown stays unknown
            </div>

            <p className="mt-1 text-xs leading-5 text-amber-700">
              Missing attribution is shown explicitly instead of being silently
              converted into Direct traffic.
            </p>
          </div>
        </section>
      </div>

      <section className="card-pad mt-4">
        <div className="eyebrow">How attribution works</div>

        <div className="section-title mt-1">
          One lead, multiple channel roles
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <JourneyStep
            icon={<MousePointerClick size={18} />}
            title="First Touch"
            value="Acquisition"
            note="The original marketing source that first brought the prospect in."
          />

          <JourneyStep
            icon={<Send size={18} />}
            title="Lead Creation"
            value="Enquiry channel"
            note="Where the identifiable CRM lead was actually created."
          />

          <JourneyStep
            icon={<Route size={18} />}
            title="Last Marketing Touch"
            value="Recent influence"
            note="The latest stored marketing source before the current CRM state."
          />

          <JourneyStep
            icon={<Smartphone size={18} />}
            title="Current Channel"
            value="Conversation"
            note="Where the admissions team is communicating with the lead now."
          />
        </div>

        <div className="mt-5 rounded-xl border border-brand/10 bg-brand/[.04] p-4">
          <div className="text-sm font-black text-brand">Attribution rule</div>

          <p className="mt-1 text-sm leading-6 text-slate-600">
            A later WhatsApp conversation, Instagram DM, or direct website visit
            does not overwrite the original acquisition source. Conversion touch
            will only become a reporting model when a reliable
            conversion-channel event is explicitly stored.
          </p>
        </div>
      </section>
    </>
  );
}

function Metric({
  label,

  value,

  note,

  icon,
}: {
  label: string;

  value: string;

  note: string;

  icon: ReactNode;
}) {
  return (
    <div className="card-pad transition hover:-translate-y-0.5 hover:shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-bold uppercase tracking-[.08em] text-slate-400">
          {label}
        </div>

        <span className="text-slate-400">{icon}</span>
      </div>

      <div className="mt-2 text-xl font-black text-slate-950">{value}</div>

      <div className="mt-1 text-[10px] text-slate-400">{note}</div>
    </div>
  );
}

function Header({ children }: { children: ReactNode }) {
  return <th className="px-4 py-3 font-bold">{children}</th>;
}

function MatrixNumber({ value }: { value: number }) {
  return (
    <td className="px-4 py-3 text-sm font-semibold text-slate-700">
      {value.toLocaleString("en-IN")}
    </td>
  );
}

function CoverageRow({
  label,

  coverage,

  known,

  unknown,
}: {
  label: string;

  coverage: number;

  known: number;

  unknown: number;
}) {
  const width = Math.max(
    0,

    Math.min(
      100,

      coverage,
    ),
  );

  return (
    <div>
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-slate-800">{label}</div>

          <div className="mt-0.5 text-[10px] text-slate-400">
            {known} known · {unknown} unknown
          </div>
        </div>

        <div className="text-sm font-black text-slate-800">
          {coverage.toFixed(1)}%
        </div>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-brand transition-all duration-500"
          style={{
            width: `${width}%`,
          }}
        />
      </div>
    </div>
  );
}

function JourneyStep({
  icon,

  title,

  value,

  note,
}: {
  icon: ReactNode;

  title: string;

  value: string;

  note: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand/10 text-brand">
        {icon}
      </div>

      <div className="mt-4 text-[10px] font-black uppercase tracking-[.08em] text-slate-400">
        {title}
      </div>

      <div className="mt-1 text-base font-black text-slate-900">{value}</div>

      <p className="mt-1 text-xs leading-5 text-slate-500">{note}</p>
    </div>
  );
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort(
    (
      a,

      b,
    ) => a.localeCompare(b),
  );
}

function maxComparison(row: ComparisonRow) {
  return Math.max(
    row.firstTouch,

    row.leadCreation,

    row.lastTouch,

    row.currentChannel,
  );
}

function percent(
  numerator: number,

  denominator: number,
) {
  if (denominator <= 0) {
    return "0%";
  }

  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function formatMoney(
  value: number,

  currency: "INR" | "USD",
) {
  const safe = Number.isFinite(value) ? value : 0;

  return new Intl.NumberFormat(
    currency === "INR" ? "en-IN" : "en-US",

    {
      style: "currency",

      currency,

      maximumFractionDigits: safe >= 1000 ? 0 : 2,
    },
  ).format(safe);
}

function pretty(value: string) {
  if (!value) {
    return "Unknown";
  }

  return value

    .replaceAll(
      "_",

      " ",
    )

    .replace(
      /\b\w/g,

      (letter) => letter.toUpperCase(),
    );
}
