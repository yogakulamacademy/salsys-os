import type {
  CampaignWorkspaceRow,
  CampaignWorkspaceFilters,
  CampaignWorkspacePagination,
  CampaignWorkspacePlatform,
  CampaignWorkspaceSummary,
} from '@/components/campaigns-workspace';

import {
  getCampaigns,
  isMockMode,
} from '@/lib/data';

import {
  createClient,
} from '@/lib/supabase/server';

export type CampaignsWorkspaceData = {
  campaigns: CampaignWorkspaceRow[];
  summary: CampaignWorkspaceSummary;
  platforms: CampaignWorkspacePlatform[];
  pagination: CampaignWorkspacePagination;
  googleError: string | null;
  metaError: string | null;
  warning: string | null;
  fallback: boolean;
};

type RpcPayload = {
  rows?: Array<Record<string, unknown>>;
  summary?: Record<string, unknown>;
  platforms?: Array<Record<string, unknown>>;
  pagination?: Record<string, unknown>;
};

export async function getCampaignsWorkspace(
  filters: CampaignWorkspaceFilters,
): Promise<CampaignsWorkspaceData> {
  if (isMockMode()) {
    const mockCampaigns =
      await getCampaigns();

    const normalized =
      mockCampaigns.map(
        (campaign) => ({
          id: campaign.id,
          externalId:
            campaign.id,
          name:
            campaign.name,
          platform:
            campaign.platform,
          spend:
            safeNumber(
              campaign.spend,
            ),
          spendCurrency:
            'INR',
          impressions: 0,
          clicks: 0,
          leads:
            safeNumber(
              campaign.leads,
            ),
          qualified:
            safeNumber(
              campaign.qualified,
            ),
          highIntent: 0,
          paymentPending: 0,
          paid: 0,
          enrolled:
            safeNumber(
              campaign.enrolled,
            ),
          revenueInr:
            safeNumber(
              campaign.revenue,
            ),
          revenueUsd: 0,
          cpl:
            safeDivide(
              campaign.spend,
              campaign.leads,
            ),
          cpql:
            safeDivide(
              campaign.spend,
              campaign.qualified,
            ),
          cac:
            safeDivide(
              campaign.spend,
              campaign.enrolled,
            ),
          roas:
            safeDivide(
              campaign.revenue,
              campaign.spend,
            ),
          source:
            'mock' as const,
        }),
      );

    return buildLocalWorkspace(
      normalized,
      filters,
      {
        googleError: null,
        metaError: null,
        warning: null,
        fallback: false,
      },
    );
  }

  const supabase =
    await createClient();

  const {
    data,
    error,
  } =
    await supabase.rpc(
      'get_campaigns_workspace',
      {
        p_query:
          filters.query ||
          null,
        p_platform:
          filters.platform,
        p_outcome:
          filters.outcome,
        p_sort:
          filters.sortMode,
        p_page:
          filters.page,
        p_page_size:
          filters.pageSize,
      },
    );

  if (!error) {
    return parseRpcWorkspace(
      (data ?? {}) as RpcPayload,
    );
  }

  /*
   * Safe fallback:
   * If the optimized RPC is temporarily unavailable,
   * retain the existing two-view read path so the
   * Campaigns page stays operational.
   */
  const [
    googleResult,
    metaResult,
  ] =
    await Promise.all([
      supabase
        .from(
          'v_google_ads_campaign_crm_30d',
        )
        .select('*')
        .limit(1000),

      supabase
        .from(
          'v_meta_ads_campaign_crm_30d',
        )
        .select('*')
        .limit(1000),
    ]);

  const normalized:
    CampaignWorkspaceRow[] =
    [];

  if (!googleResult.error) {
    normalized.push(
      ...(
        googleResult.data ??
        []
      ).map(
        (row) =>
          normalizeLegacyCampaign(
            row as Record<
              string,
              unknown
            >,
            'Google Ads',
          ),
      ),
    );
  }

  if (!metaResult.error) {
    normalized.push(
      ...(
        metaResult.data ??
        []
      ).map(
        (row) =>
          normalizeLegacyCampaign(
            row as Record<
              string,
              unknown
            >,
            'Meta Ads',
          ),
      ),
    );
  }

  return buildLocalWorkspace(
    normalized,
    filters,
    {
      googleError:
        googleResult.error
          ?.message ??
        null,
      metaError:
        metaResult.error
          ?.message ??
        null,
      warning:
        `Optimized campaign read model unavailable: ${error.message}`,
      fallback: true,
    },
  );
}

function parseRpcWorkspace(
  payload: RpcPayload,
): CampaignsWorkspaceData {
  const rows =
    (
      payload.rows ?? []
    ).map(
      (row) =>
        mapRpcRow(row),
    );

  const summaryRow =
    payload.summary ?? {};

  const spendByCurrency:
    Record<string, number> =
    {};

  const rawSpend =
    summaryRow[
      'spend_by_currency'
    ];

  if (
    rawSpend &&
    typeof rawSpend ===
      'object' &&
    !Array.isArray(rawSpend)
  ) {
    for (
      const [
        currency,
        amount,
      ] of Object.entries(
        rawSpend as Record<
          string,
          unknown
        >,
      )
    ) {
      spendByCurrency[
        currency
      ] =
        safeNumber(
          amount,
        );
    }
  }

  const platforms =
    (
      payload.platforms ??
      []
    ).map(
      (row) => ({
        platform:
          String(
            row.platform ??
              '',
          ),
        count:
          safeNumber(
            row.count,
          ),
      }),
    )
      .filter(
        (row) =>
          Boolean(
            row.platform,
          ),
      );

  const pageRow =
    payload.pagination ??
    {};

  return {
    campaigns: rows,
    summary: {
      campaigns:
        safeNumber(
          summaryRow[
            'campaigns'
          ],
        ),
      spendByCurrency,
      clicks:
        safeNumber(
          summaryRow[
            'clicks'
          ],
        ),
      leads:
        safeNumber(
          summaryRow[
            'leads'
          ],
        ),
      qualified:
        safeNumber(
          summaryRow[
            'qualified'
          ],
        ),
      enrolled:
        safeNumber(
          summaryRow[
            'enrolled'
          ],
        ),
      revenueInr:
        safeNumber(
          summaryRow[
            'revenue_inr'
          ],
        ),
      revenueUsd:
        safeNumber(
          summaryRow[
            'revenue_usd'
          ],
        ),
    },
    platforms,
    pagination: {
      page:
        Math.max(
          1,
          safeNumber(
            pageRow[
              'page'
            ],
            1,
          ),
        ),
      pageSize:
        Math.max(
          1,
          safeNumber(
            pageRow[
              'page_size'
            ],
            50,
          ),
        ),
      total:
        safeNumber(
          pageRow[
            'total'
          ],
        ),
      totalPages:
        Math.max(
          1,
          safeNumber(
            pageRow[
              'total_pages'
            ],
            1,
          ),
        ),
      from:
        safeNumber(
          pageRow[
            'from'
          ],
        ),
      to:
        safeNumber(
          pageRow[
            'to'
          ],
        ),
    },
    googleError: null,
    metaError: null,
    warning: null,
    fallback: false,
  };
}

function mapRpcRow(
  row: Record<
    string,
    unknown
  >,
): CampaignWorkspaceRow {
  return {
    id:
      String(
        row.id ??
          '',
      ),
    externalId:
      String(
        row.external_id ??
          '',
      ),
    name:
      String(
        row.name ??
          'Campaign',
      ),
    platform:
      String(
        row.platform ??
          'Unknown',
      ),
    spend:
      safeNumber(
        row.spend,
      ),
    spendCurrency:
      String(
        row.spend_currency ??
          'INR',
      ).toUpperCase(),
    impressions:
      safeNumber(
        row.impressions,
      ),
    clicks:
      safeNumber(
        row.clicks,
      ),
    leads:
      safeNumber(
        row.leads,
      ),
    qualified:
      safeNumber(
        row.qualified,
      ),
    highIntent:
      safeNumber(
        row.high_intent,
      ),
    paymentPending:
      safeNumber(
        row.payment_pending,
      ),
    paid:
      safeNumber(
        row.paid,
      ),
    enrolled:
      safeNumber(
        row.enrolled,
      ),
    revenueInr:
      safeNumber(
        row.revenue_inr,
      ),
    revenueUsd:
      safeNumber(
        row.revenue_usd,
      ),
    cpl:
      nullableNumber(
        row.cpl,
      ),
    cpql:
      nullableNumber(
        row.cpql,
      ),
    cac:
      nullableNumber(
        row.cac,
      ),
    roas:
      nullableNumber(
        row.roas,
      ),
    source: 'live',
  };
}

function buildLocalWorkspace(
  campaigns:
    CampaignWorkspaceRow[],
  filters:
    CampaignWorkspaceFilters,
  state: {
    googleError:
      | string
      | null;
    metaError:
      | string
      | null;
    warning:
      | string
      | null;
    fallback: boolean;
  },
): CampaignsWorkspaceData {
  const needle =
    filters.query
      .trim()
      .toLowerCase();

  const filtered =
    campaigns.filter(
      (campaign) => {
        if (
          filters.platform !==
            'all' &&
          campaign.platform !==
            filters.platform
        ) {
          return false;
        }

        if (
          filters.outcome ===
            'with_leads' &&
          campaign.leads <= 0
        ) {
          return false;
        }

        if (
          filters.outcome ===
            'no_leads' &&
          campaign.leads > 0
        ) {
          return false;
        }

        if (
          filters.outcome ===
            'qualified' &&
          campaign.qualified <=
            0
        ) {
          return false;
        }

        if (
          filters.outcome ===
            'enrolled' &&
          campaign.enrolled <=
            0
        ) {
          return false;
        }

        if (
          filters.outcome ===
            'revenue' &&
          campaign.revenueInr <=
            0 &&
          campaign.revenueUsd <=
            0
        ) {
          return false;
        }

        if (!needle) {
          return true;
        }

        return [
          campaign.name,
          campaign.externalId,
          campaign.platform,
        ]
          .join(' ')
          .toLowerCase()
          .includes(
            needle,
          );
      },
    );

  const ordered =
    [
      ...filtered,
    ].sort(
      (a, b) =>
        compareCampaigns(
          a,
          b,
          filters.sortMode,
        ),
    );

  const pageSize =
    Math.min(
      Math.max(
        filters.pageSize,
        1,
      ),
      100,
    );

  const total =
    ordered.length;

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        total /
          pageSize,
      ),
    );

  const page =
    Math.min(
      Math.max(
        filters.page,
        1,
      ),
      totalPages,
    );

  const start =
    (
      page - 1
    ) * pageSize;

  const rows =
    ordered.slice(
      start,
      start +
        pageSize,
    );

  const spendByCurrency:
    Record<string, number> =
    {};

  let clicks = 0;
  let leads = 0;
  let qualified = 0;
  let enrolled = 0;
  let revenueInr = 0;
  let revenueUsd = 0;

  for (
    const campaign
    of filtered
  ) {
    spendByCurrency[
      campaign.spendCurrency
    ] =
      (
        spendByCurrency[
          campaign
            .spendCurrency
        ] ??
        0
      ) +
      campaign.spend;

    clicks +=
      campaign.clicks;
    leads +=
      campaign.leads;
    qualified +=
      campaign.qualified;
    enrolled +=
      campaign.enrolled;
    revenueInr +=
      campaign.revenueInr;
    revenueUsd +=
      campaign.revenueUsd;
  }

  const platformMap =
    new Map<
      string,
      number
    >();

  for (
    const campaign
    of campaigns
  ) {
    platformMap.set(
      campaign.platform,
      (
        platformMap.get(
          campaign.platform,
        ) ??
        0
      ) + 1,
    );
  }

  return {
    campaigns: rows,
    summary: {
      campaigns:
        filtered.length,
      spendByCurrency,
      clicks,
      leads,
      qualified,
      enrolled,
      revenueInr,
      revenueUsd,
    },
    platforms:
      [
        ...platformMap.entries(),
      ]
        .map(
          ([
            platform,
            count,
          ]) => ({
            platform,
            count,
          }),
        )
        .sort(
          (a, b) =>
            a.platform.localeCompare(
              b.platform,
            ),
        ),
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
      from:
        total === 0
          ? 0
          : start + 1,
      to:
        total === 0
          ? 0
          : Math.min(
              start +
                pageSize,
              total,
            ),
    },
    ...state,
  };
}

function compareCampaigns(
  a: CampaignWorkspaceRow,
  b: CampaignWorkspaceRow,
  sortMode:
    CampaignWorkspaceFilters[
      'sortMode'
    ],
) {
  if (
    sortMode ===
    'name'
  ) {
    return a.name.localeCompare(
      b.name,
    );
  }

  if (
    sortMode ===
    'leads_desc'
  ) {
    return (
      b.leads -
      a.leads
    );
  }

  if (
    sortMode ===
    'qualified_desc'
  ) {
    return (
      b.qualified -
      a.qualified
    );
  }

  if (
    sortMode ===
    'enrolled_desc'
  ) {
    return (
      b.enrolled -
      a.enrolled
    );
  }

  if (
    sortMode ===
    'roas_desc'
  ) {
    return (
      nullableSortNumber(
        b.roas,
        -1,
      ) -
      nullableSortNumber(
        a.roas,
        -1,
      )
    );
  }

  if (
    sortMode ===
    'cac_asc'
  ) {
    return (
      nullableSortNumber(
        a.cac,
        Number.MAX_SAFE_INTEGER,
      ) -
      nullableSortNumber(
        b.cac,
        Number.MAX_SAFE_INTEGER,
      )
    );
  }

  return (
    b.spend -
    a.spend
  );
}

function normalizeLegacyCampaign(
  row:
    Record<
      string,
      unknown
    >,
  platform: string,
): CampaignWorkspaceRow {
  const externalId =
    pickText(
      row,
      [
        'campaign_id',
        'external_campaign_id',
        'id',
      ],
    ) ||
    `${platform}-${pickText(
      row,
      [
        'campaign_name',
        'name',
      ],
    ) || 'campaign'}`;

  const name =
    pickText(
      row,
      [
        'campaign_name',
        'name',
      ],
    ) ||
    externalId;

  const spend =
    pickNumber(
      row,
      [
        'spend',
        'cost',
        'ad_spend',
        'spend_amount',
      ],
    );

  const spendCurrency =
    (
      pickText(
        row,
        [
          'account_currency',
          'currency',
          'spend_currency',
        ],
      ) ||
      'INR'
    ).toUpperCase();

  const leads =
    pickNumber(
      row,
      [
        'crm_leads',
        'leads',
        'lead_count',
        'attributed_leads',
      ],
    );

  const qualified =
    pickNumber(
      row,
      [
        'qualified_leads',
        'qualified',
        'qualified_count',
      ],
    );

  const enrolled =
    pickNumber(
      row,
      [
        'enrolled_leads',
        'enrolled',
        'enrollment_count',
      ],
    );

  const revenueInr =
    pickNumber(
      row,
      [
        'revenue_inr',
        'inr_revenue',
        'crm_revenue_inr',
      ],
    );

  const revenueUsd =
    pickNumber(
      row,
      [
        'revenue_usd',
        'usd_revenue',
        'crm_revenue_usd',
      ],
    );

  const cplFromView =
    pickNullableNumber(
      row,
      [
        'cpl',
        'cost_per_lead',
      ],
    );

  const cpqlFromView =
    pickNullableNumber(
      row,
      [
        'cost_per_qualified_lead',
        'cost_per_qualified',
        'cpql',
      ],
    );

  const cacFromView =
    pickNullableNumber(
      row,
      [
        'cac',
        'cost_per_enrollment',
        'cost_per_enrolled_lead',
      ],
    );

  const roasFromView =
    pickNullableNumber(
      row,
      [
        'roas',
        'crm_roas',
      ],
    );

  return {
    id:
      `${platform}:${externalId}`,
    externalId,
    name,
    platform,
    spend,
    spendCurrency,
    impressions:
      pickNumber(
        row,
        ['impressions'],
      ),
    clicks:
      pickNumber(
        row,
        [
          'clicks',
          'link_clicks',
        ],
      ),
    leads,
    qualified,
    highIntent:
      pickNumber(
        row,
        [
          'high_intent_leads',
          'high_intent',
        ],
      ),
    paymentPending:
      pickNumber(
        row,
        [
          'payment_pending_leads',
          'payment_pending',
        ],
      ),
    paid:
      pickNumber(
        row,
        [
          'paid_leads',
          'paid',
          'paid_count',
        ],
      ),
    enrolled,
    revenueInr,
    revenueUsd,
    cpl:
      cplFromView ??
      safeDivide(
        spend,
        leads,
      ),
    cpql:
      cpqlFromView ??
      safeDivide(
        spend,
        qualified,
      ),
    cac:
      cacFromView ??
      safeDivide(
        spend,
        enrolled,
      ),
    roas:
      roasFromView ??
      (
        spendCurrency ===
        'INR'
          ? safeDivide(
              revenueInr,
              spend,
            )
          : null
      ),
    source: 'live',
  };
}

function pickText(
  row:
    Record<
      string,
      unknown
    >,
  keys: string[],
) {
  for (
    const key
    of keys
  ) {
    const value =
      row[key];

    if (
      value != null &&
      String(
        value,
      ).trim() !==
        ''
    ) {
      return String(
        value,
      );
    }
  }

  return null;
}

function pickNumber(
  row:
    Record<
      string,
      unknown
    >,
  keys: string[],
) {
  return (
    pickNullableNumber(
      row,
      keys,
    ) ??
    0
  );
}

function pickNullableNumber(
  row:
    Record<
      string,
      unknown
    >,
  keys: string[],
) {
  for (
    const key
    of keys
  ) {
    const value =
      row[key];

    const number =
      nullableNumber(
        value,
      );

    if (
      number != null
    ) {
      return number;
    }
  }

  return null;
}

function nullableNumber(
  value: unknown,
) {
  if (
    value == null ||
    value === ''
  ) {
    return null;
  }

  const number =
    Number(value);

  return Number.isFinite(
    number,
  )
    ? number
    : null;
}

function nullableSortNumber(
  value:
    | number
    | null,
  fallback: number,
) {
  return value ==
    null
    ? fallback
    : value;
}

function safeNumber(
  value: unknown,
  fallback = 0,
) {
  const number =
    Number(
      value ??
        fallback,
    );

  return Number.isFinite(
    number,
  )
    ? number
    : fallback;
}

function safeDivide(
  numerator: unknown,
  denominator: unknown,
) {
  const top =
    safeNumber(
      numerator,
    );

  const bottom =
    safeNumber(
      denominator,
    );

  if (
    bottom <= 0
  ) {
    return null;
  }

  return (
    top /
    bottom
  );
}
