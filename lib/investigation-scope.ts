import { canonicalizeWorkspaceHref } from "@/lib/canonical-workspace-routes";

export type InvestigationScope = {
  q?: string;
  source?: string;
  course?: string;
  location?: string;
  country?: string;
  stage?: string;
  channel?: string;
  owner?: string;
  platform?: string;
  outcome?: string;
  period?: string;
  from?: string;
  to?: string;
  range?: string;
  start?: string;
  end?: string;
  employee?: string;
};

export type InvestigationScopeChip = {
  key: keyof InvestigationScope;
  label: string;
  value: string;
};

export type InvestigationScopeTransfer = {
  href: string;
  scope: InvestigationScope;
  applied: InvestigationScopeChip[];
};

const scopeLabels: Partial<Record<keyof InvestigationScope, string>> = {
  q: "Search",
  source: "Source",
  course: "Course",
  location: "Location",
  country: "Country",
  stage: "Stage",
  channel: "Channel",
  owner: "Owner",
  platform: "Platform",
  outcome: "Outcome",
  period: "Period",
  range: "Range",
  employee: "Employee",
};

export function captureInvestigationScope(search: string): InvestigationScope {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const get = (key: keyof InvestigationScope) => params.get(key)?.trim() || undefined;

  return compactScope({
    q: get("q"),
    source: get("source"),
    course: get("course"),
    location: get("location"),
    country: get("country"),
    stage: get("stage"),
    channel: get("channel"),
    owner: get("owner"),
    platform: get("platform"),
    outcome: get("outcome"),
    period: get("period"),
    from: get("from"),
    to: get("to"),
    range: get("range"),
    start: get("start"),
    end: get("end"),
    employee: get("employee"),
  });
}

export function transferInvestigationScope(
  href: string,
  source: string | InvestigationScope,
): InvestigationScopeTransfer {
  const canonicalHref = canonicalizeWorkspaceHref(href);
  const scope = typeof source === "string" ? captureInvestigationScope(source) : compactScope(source);

  if (!canonicalHref.startsWith("/")) {
    return { href: canonicalHref, scope, applied: [] };
  }

  const url = new URL(canonicalHref, "https://salsys.local");
  const applied: InvestigationScopeChip[] = [];

  const add = (
    targetKey: string,
    scopeKey: keyof InvestigationScope,
    value: string | undefined,
    labelOverride?: string,
  ) => {
    if (!value || url.searchParams.has(targetKey)) return;
    url.searchParams.set(targetKey, value);
    applied.push({
      key: scopeKey,
      label: labelOverride || scopeLabels[scopeKey] || pretty(String(scopeKey)),
      value: prettyScopeValue(scopeKey, value),
    });
  };

  if (url.pathname === "/marketing") {
    add("q", scope.q ? "q" : "source", scope.q || scope.source);
    add("course", "course", scope.course);
    add("location", "location", scope.location);
    add("country", "country", scope.country);
    add("stage", "stage", scope.stage);
    add("platform", "platform", scope.platform);
    add("outcome", "outcome", scope.outcome);
  } else if (url.pathname === "/leads") {
    add("q", "q", scope.q);
    add("source", "source", scope.source);
    add("course", "course", scope.course);
    add("stage", "stage", scope.stage);
    add("channel", "channel", scope.channel);
    add("owner", "owner", scope.owner);
  } else if (url.pathname === "/performance") {
    const range = performanceRange(scope);
    if (range.range) add("range", range.sourceKey, range.range, "Range");
    if (range.start) add("start", "from", range.start, "Start");
    if (range.end) add("end", "to", range.end, "End");
    add("employee", "employee", scope.employee);
  } else if (url.pathname === "/revenue") {
    add("source", "source", scope.source);

    // Revenue only applies source focus when investigation mode is explicit.
    // If a structured source is present, make that focus active rather than
    // leaving a source query parameter that the workspace would otherwise ignore.
    if (url.searchParams.get("source")?.trim() && !url.searchParams.has("investigation")) {
      url.searchParams.set("investigation", "1");
    }
  } else if (url.pathname === "/admissions") {
    const view = url.searchParams.get("view")?.trim() || "overview";

    if (view === "queue" || view === "payments") {
      add("source", "source", scope.source);
      add("course", "course", scope.course);
      add("location", "location", scope.location);
      add("stage", "stage", scope.stage);
      add("owner", "owner", scope.owner);
    } else if (view === "capacity") {
      add("course", "course", scope.course);
      add("location", "location", scope.location);
    }

    if (applied.length > 0 && !url.searchParams.has("scope")) {
      url.searchParams.set("scope", "1");
    }
  }

  return {
    href: `${url.pathname}${url.search}${url.hash}`,
    scope,
    applied,
  };
}

export function describeInvestigationScope(scope: InvestigationScope): InvestigationScopeChip[] {
  const chips: InvestigationScopeChip[] = [];

  const add = (key: keyof InvestigationScope, value: string | undefined) => {
    if (!value) return;
    chips.push({
      key,
      label: scopeLabels[key] || pretty(String(key)),
      value: prettyScopeValue(key, value),
    });
  };

  add("source", scope.source);
  add("course", scope.course);
  add("location", scope.location);
  add("country", scope.country);
  add("stage", scope.stage);
  add("channel", scope.channel);
  add("owner", scope.owner);
  add("platform", scope.platform);
  add("outcome", scope.outcome);

  if (scope.period === "custom" && scope.from && scope.to) {
    chips.push({ key: "period", label: "Period", value: `${scope.from} → ${scope.to}` });
  } else if (scope.period) {
    add("period", scope.period);
  } else if (scope.range === "custom" && scope.start && scope.end) {
    chips.push({ key: "range", label: "Range", value: `${scope.start} → ${scope.end}` });
  } else if (scope.range) {
    add("range", scope.range);
  }

  if (chips.length === 0) add("q", scope.q);
  return chips;
}

export function summarizeInvestigationScope(scope: InvestigationScope) {
  const chips = describeInvestigationScope(scope);
  if (!chips.length) return undefined;
  return chips
    .slice(0, 3)
    .map((chip) => `${chip.label}: ${chip.value}`)
    .join(" · ");
}

function performanceRange(scope: InvestigationScope): {
  range?: string;
  start?: string;
  end?: string;
  sourceKey: keyof InvestigationScope;
} {
  if (scope.range) {
    return {
      range: scope.range,
      start: scope.range === "custom" ? scope.start : undefined,
      end: scope.range === "custom" ? scope.end : undefined,
      sourceKey: "range",
    };
  }

  if (scope.period === "custom" && scope.from && scope.to) {
    return { range: "custom", start: scope.from, end: scope.to, sourceKey: "period" };
  }

  if (["7d", "30d", "month", "last_month"].includes(scope.period || "")) {
    return { range: scope.period, sourceKey: "period" };
  }

  return { sourceKey: "period" };
}

function compactScope(scope: InvestigationScope): InvestigationScope {
  return Object.fromEntries(
    Object.entries(scope).filter(([, value]) => typeof value === "string" && value.trim().length > 0),
  ) as InvestigationScope;
}

function prettyScopeValue(key: keyof InvestigationScope, value: string) {
  if (["from", "to", "start", "end"].includes(key)) return value;
  return pretty(value);
}

function pretty(value: string) {
  return value
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
