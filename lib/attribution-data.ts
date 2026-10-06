import type {
  AttributionComparisonRow,
  AttributionMetricsRow,
  AttributionModelName,
  AttributionPerformanceRow,
  AttributionWorkspaceFilters,
  AttributionWorkspacePayload,
} from '@/components/attribution-workspace';

import {
  createClient,
} from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';

export type AttributionWorkspaceData = {
  workspace:
    AttributionWorkspacePayload;
  warning:
    string |
    null;
};

type LegacyRow = {
  lead_name:
    | string
    | null;
  lead_code:
    | string
    | null;
  current_stage:
    | string
    | null;
  course_name:
    | string
    | null;
  preferred_location:
    | string
    | null;
  country:
    | string
    | null;
  model_name:
    | string
    | null;
  attribution_value:
    | string
    | null;
  medium:
    | string
    | null;
  campaign:
    | string
    | null;
  is_known:
    | boolean
    | null;
  is_qualified_plus:
    | boolean
    | null;
  is_enrolled:
    | boolean
    | null;
  revenue_inr:
    | number
    | string
    | null;
  revenue_usd:
    | number
    | string
    | null;
};

type RpcPayload = {
  metrics_by_model?: Array<
    Record<
      string,
      unknown
    >
  >;
  performance_rows?: Array<
    Record<
      string,
      unknown
    >
  >;
  comparison?: Array<
    Record<
      string,
      unknown
    >
  >;
  options?: Record<
    string,
    unknown
  >;
};

const modelNames:
  AttributionModelName[] =
  [
    'first_touch',
    'lead_creation',
    'last_touch',
    'current_channel',
  ];

export async function getAttributionWorkspace(
  filters:
    AttributionWorkspaceFilters,
): Promise<
  AttributionWorkspaceData
> {
  const supabase =
    await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (
    authError ||
    !user
  ) {
    throw new Error(
      'Unable to load attribution workspace: user is not authenticated.',
    );
  }

  const organizationId =
    await requireCurrentOrganizationId(
      supabase,
      user.id,
    );

  const {
    data,
    error,
  } =
    await (supabase as any).rpc(
      'get_attribution_workspace',
      {
        p_organization_id:
          organizationId,
        p_query:
          filters.query.trim() ||
          null,
        p_course:
          normalizedFilter(
            filters.course,
          ),
        p_location:
          normalizedFilter(
            filters.location,
          ),
        p_country:
          normalizedFilter(
            filters.country,
          ),
        p_stage:
          normalizedFilter(
            filters.stage,
          ),
      },
    );

  if (!error) {
    return {
      workspace:
        parseRpcPayload(
          (data ?? {}) as RpcPayload,
        ),
      warning:
        null,
    };
  }

  /*
   * Safety fallback:
   * preserve the old 20,000-row read path if the
   * optimized RPC is temporarily unavailable.
   */
  const {
    data:
      legacyData,
    error:
      legacyError,
  } =
    await supabase
      .from(
        'v_attribution_model_rows',
      )
      .select(`
        lead_name,
        lead_code,
        current_stage,
        course_name,
        preferred_location,
        country,
        model_name,
        attribution_value,
        medium,
        campaign,
        is_known,
        is_qualified_plus,
        is_enrolled,
        revenue_inr,
        revenue_usd
      `)
      .eq(
        'organization_id',
        organizationId,
      )
      .order(
        'created_at',
        {
          ascending:
            false,
        },
      )
      .limit(
        20000,
      );

  if (
    legacyError
  ) {
    throw new Error(
      `Unable to load attribution workspace: ${legacyError.message}`,
    );
  }

  return {
    workspace:
      buildLegacyWorkspace(
        (
          legacyData ??
          []
        ) as LegacyRow[],
        filters,
      ),
    warning:
      `Optimized attribution read model unavailable: ${error.message}`,
  };
}

function parseRpcPayload(
  payload: RpcPayload,
): AttributionWorkspacePayload {
  const metricsByModel =
    (
      payload.metrics_by_model ??
      []
    ).map(
      mapMetricRow,
    );

  const metricMap =
    new Map(
      metricsByModel.map(
        (row) => [
          row.modelName,
          row,
        ],
      ),
    );

  const completeMetrics =
    modelNames.map(
      (modelName) =>
        metricMap.get(
          modelName,
        ) ??
        emptyMetric(
          modelName,
        ),
    );

  const performanceRows =
    (
      payload.performance_rows ??
      []
    )
      .map(
        mapPerformanceRow,
      )
      .filter(
        (
          row,
        ): row is
          AttributionPerformanceRow =>
          Boolean(row),
      );

  const comparison =
    (
      payload.comparison ??
      []
    ).map(
      mapComparisonRow,
    );

  const options =
    payload.options ??
    {};

  return {
    metricsByModel:
      completeMetrics,
    performanceRows,
    comparison,
    options: {
      courses:
        stringArray(
          options.courses,
        ),
      locations:
        stringArray(
          options.locations,
        ),
      countries:
        stringArray(
          options.countries,
        ),
      stages:
        stringArray(
          options.stages,
        ),
    },
  };
}

function mapMetricRow(
  row:
    Record<
      string,
      unknown
    >,
): AttributionMetricsRow {
  const modelName =
    normalizeModelName(
      row.model_name,
    );

  const total =
    toNumber(
      row.total,
    );

  const known =
    toNumber(
      row.known,
    );

  return {
    modelName,
    total,
    known,
    unknown:
      toNumber(
        row.unknown,
        Math.max(
          total - known,
          0,
        ),
      ),
    coverage:
      toNumber(
        row.coverage,
        total > 0
          ? (
              known /
              total
            ) *
            100
          : 0,
      ),
    qualified:
      toNumber(
        row.qualified,
      ),
    enrolled:
      toNumber(
        row.enrolled,
      ),
    revenueInr:
      toNumber(
        row.revenue_inr,
      ),
    revenueUsd:
      toNumber(
        row.revenue_usd,
      ),
  };
}

function mapPerformanceRow(
  row:
    Record<
      string,
      unknown
    >,
):
  | AttributionPerformanceRow
  | null {
  const modelName =
    normalizeModelNameOrNull(
      row.model_name,
    );

  if (!modelName) {
    return null;
  }

  return {
    modelName,
    value:
      String(
        row.value ??
        'Unknown',
      ),
    leads:
      toNumber(
        row.leads,
      ),
    qualified:
      toNumber(
        row.qualified,
      ),
    enrolled:
      toNumber(
        row.enrolled,
      ),
    revenueInr:
      toNumber(
        row.revenue_inr,
      ),
    revenueUsd:
      toNumber(
        row.revenue_usd,
      ),
  };
}

function mapComparisonRow(
  row:
    Record<
      string,
      unknown
    >,
): AttributionComparisonRow {
  return {
    value:
      String(
        row.value ??
        'Unknown',
      ),
    firstTouch:
      toNumber(
        row.first_touch,
      ),
    leadCreation:
      toNumber(
        row.lead_creation,
      ),
    lastTouch:
      toNumber(
        row.last_touch,
      ),
    currentChannel:
      toNumber(
        row.current_channel,
      ),
  };
}

function buildLegacyWorkspace(
  rows: LegacyRow[],
  filters:
    AttributionWorkspaceFilters,
): AttributionWorkspacePayload {
  const courses =
    uniqueSorted(
      rows
        .map(
          (row) =>
            row.course_name,
        )
        .filter(
          Boolean,
        ) as string[],
    );

  const locations =
    uniqueSorted(
      rows
        .map(
          (row) =>
            row.preferred_location,
        )
        .filter(
          Boolean,
        ) as string[],
    );

  const countries =
    uniqueSorted(
      rows
        .map(
          (row) =>
            row.country,
        )
        .filter(
          Boolean,
        ) as string[],
    );

  const stages =
    uniqueSorted(
      rows
        .map(
          (row) =>
            row.current_stage,
        )
        .filter(
          Boolean,
        ) as string[],
    );

  const needle =
    filters.query
      .trim()
      .toLowerCase();

  const filtered =
    rows.filter(
      (row) => {
        if (
          filters.course !==
            'all' &&
          row.course_name !==
            filters.course
        ) {
          return false;
        }

        if (
          filters.location !==
            'all' &&
          row.preferred_location !==
            filters.location
        ) {
          return false;
        }

        if (
          filters.country !==
            'all' &&
          row.country !==
            filters.country
        ) {
          return false;
        }

        if (
          filters.stage !==
            'all' &&
          row.current_stage !==
            filters.stage
        ) {
          return false;
        }

        if (
          !needle
        ) {
          return true;
        }

        return [
          row.lead_name,
          row.lead_code,
          row.attribution_value,
          row.medium,
          row.campaign,
          row.course_name,
          row.preferred_location,
          row.country,
        ]
          .filter(
            Boolean,
          )
          .join(
            ' ',
          )
          .toLowerCase()
          .includes(
            needle,
          );
      },
    );

  const metricMap =
    new Map<
      AttributionModelName,
      AttributionMetricsRow
    >();

  const performanceMap =
    new Map<
      string,
      AttributionPerformanceRow
    >();

  const comparisonMap =
    new Map<
      string,
      AttributionComparisonRow
    >();

  for (
    const modelName
    of modelNames
  ) {
    metricMap.set(
      modelName,
      emptyMetric(
        modelName,
      ),
    );
  }

  for (
    const row
    of filtered
  ) {
    const modelName =
      normalizeModelNameOrNull(
        row.model_name,
      );

    if (!modelName) {
      continue;
    }

    const metric =
      metricMap.get(
        modelName,
      )!;

    metric.total += 1;

    if (
      row.is_known
    ) {
      metric.known +=
        1;
    }

    if (
      row.is_qualified_plus
    ) {
      metric.qualified +=
        1;
    }

    if (
      row.is_enrolled
    ) {
      metric.enrolled +=
        1;
    }

    metric.revenueInr +=
      toNumber(
        row.revenue_inr,
      );

    metric.revenueUsd +=
      toNumber(
        row.revenue_usd,
      );

    const value =
      row.attribution_value?.trim() ||
      'Unknown';

    const performanceKey =
      `${modelName}\u0000${value}`;

    const performance =
      performanceMap.get(
        performanceKey,
      ) ?? {
        modelName,
        value,
        leads: 0,
        qualified: 0,
        enrolled: 0,
        revenueInr: 0,
        revenueUsd: 0,
      };

    performance.leads +=
      1;

    if (
      row.is_qualified_plus
    ) {
      performance.qualified +=
        1;
    }

    if (
      row.is_enrolled
    ) {
      performance.enrolled +=
        1;
    }

    performance.revenueInr +=
      toNumber(
        row.revenue_inr,
      );

    performance.revenueUsd +=
      toNumber(
        row.revenue_usd,
      );

    performanceMap.set(
      performanceKey,
      performance,
    );

    const comparison =
      comparisonMap.get(
        value,
      ) ?? {
        value,
        firstTouch: 0,
        leadCreation: 0,
        lastTouch: 0,
        currentChannel: 0,
      };

    if (
      modelName ===
      'first_touch'
    ) {
      comparison.firstTouch +=
        1;
    } else if (
      modelName ===
      'lead_creation'
    ) {
      comparison.leadCreation +=
        1;
    } else if (
      modelName ===
      'last_touch'
    ) {
      comparison.lastTouch +=
        1;
    } else if (
      modelName ===
      'current_channel'
    ) {
      comparison.currentChannel +=
        1;
    }

    comparisonMap.set(
      value,
      comparison,
    );
  }

  const metricsByModel =
    modelNames.map(
      (modelName) => {
        const metric =
          metricMap.get(
            modelName,
          )!;

        metric.unknown =
          Math.max(
            metric.total -
            metric.known,
            0,
          );

        metric.coverage =
          metric.total >
          0
            ? (
                metric.known /
                metric.total
              ) *
              100
            : 0;

        return metric;
      },
    );

  const comparison =
    [
      ...comparisonMap.values(),
    ]
      .sort(
        (
          a,
          b,
        ) =>
          maxComparison(
            b,
          ) -
            maxComparison(
              a,
            ) ||
          a.value.localeCompare(
            b.value,
          ),
      )
      .slice(
        0,
        16,
      );

  return {
    metricsByModel,
    performanceRows:
      [
        ...performanceMap.values(),
      ],
    comparison,
    options: {
      courses,
      locations,
      countries,
      stages,
    },
  };
}

function emptyMetric(
  modelName:
    AttributionModelName,
): AttributionMetricsRow {
  return {
    modelName,
    total: 0,
    known: 0,
    unknown: 0,
    coverage: 0,
    qualified: 0,
    enrolled: 0,
    revenueInr: 0,
    revenueUsd: 0,
  };
}

function normalizeModelName(
  value: unknown,
): AttributionModelName {
  return (
    normalizeModelNameOrNull(
      value,
    ) ??
    'first_touch'
  );
}

function normalizeModelNameOrNull(
  value: unknown,
):
  | AttributionModelName
  | null {
  const text =
    String(
      value ??
      '',
    );

  return modelNames.includes(
    text as AttributionModelName,
  )
    ? (
        text as AttributionModelName
      )
    : null;
}

function normalizedFilter(
  value: string,
) {
  const clean =
    value.trim();

  return (
    clean &&
    clean !==
      'all'
  )
    ? clean
    : null;
}

function stringArray(
  value: unknown,
) {
  if (
    !Array.isArray(
      value,
    )
  ) {
    return [];
  }

  return value
    .map(
      (item) =>
        String(
          item ??
          '',
        ).trim(),
    )
    .filter(
      Boolean,
    );
}

function uniqueSorted(
  values: string[],
) {
  return [
    ...new Set(
      values,
    ),
  ].sort(
    (
      a,
      b,
    ) =>
      a.localeCompare(
        b,
      ),
  );
}

function maxComparison(
  row:
    AttributionComparisonRow,
) {
  return Math.max(
    row.firstTouch,
    row.leadCreation,
    row.lastTouch,
    row.currentChannel,
  );
}

function toNumber(
  value: unknown,
  fallback = 0,
) {
  const parsed =
    Number(
      value ??
      fallback,
    );

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : fallback;
}
