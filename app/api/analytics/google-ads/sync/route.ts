import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  createGoogleAdsAdminClient,
  resolveGoogleAdsRuntimes,
  syncGoogleAdsToSupabase,
  type GoogleAdsRuntime,
} from '@/lib/google-ads';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

export const maxDuration =
  300;

const ISO_DATE =
  /^\d{4}-\d{2}-\d{2}$/;

type RuntimeFilter = {
  organizationId?: string;
  assetId?: string;
};

type SyncResult =
  | {
      ok: true;
      organizationId: string;
      connectionId: string;
      integrationAssetId: string;
      customerId: string;
      startDate: string;
      endDate: string;
      counts: Awaited<
        ReturnType<
          typeof syncGoogleAdsToSupabase
        >
      >;
    }
  | {
      ok: false;
      organizationId: string;
      connectionId: string;
      integrationAssetId: string;
      customerId: string;
      error: string;
    };

function isoDate(
  value: Date,
) {
  return value
    .toISOString()
    .slice(
      0,
      10,
    );
}

function addUtcDays(
  dateValue: string,
  days: number,
) {
  const date =
    new Date(
      `${dateValue}T00:00:00Z`,
    );

  date.setUTCDate(
    date.getUTCDate() +
    days,
  );

  return isoDate(
    date,
  );
}

function validateRange(
  startDate: string,
  endDate: string,
) {
  if (
    !ISO_DATE.test(
      startDate,
    ) ||
    !ISO_DATE.test(
      endDate,
    )
  ) {
    throw new Error(
      'Dates must use YYYY-MM-DD.',
    );
  }

  const start =
    new Date(
      `${startDate}T00:00:00Z`,
    );

  const end =
    new Date(
      `${endDate}T00:00:00Z`,
    );

  if (
    Number.isNaN(
      start.getTime(),
    ) ||
    Number.isNaN(
      end.getTime(),
    )
  ) {
    throw new Error(
      'Invalid date range.',
    );
  }

  if (
    start >
    end
  ) {
    throw new Error(
      'startDate must be before or equal to endDate.',
    );
  }

  const days =
    Math.floor(
      (
        end.getTime() -
        start.getTime()
      ) /
      86400000,
    ) +
    1;

  if (
    days >
    93
  ) {
    throw new Error(
      'A single Google Ads sync can cover at most 93 days.',
    );
  }
}

function isAuthorized(
  request: NextRequest,
  allowCron =
    false,
) {
  const manualSecret =
    process.env
      .GOOGLE_ADS_SYNC_SECRET
      ?.trim();

  const cronSecret =
    process.env
      .CRON_SECRET
      ?.trim();

  const headerSecret =
    request.headers
      .get(
        'x-google-ads-sync-secret',
      )
      ?.trim();

  const authorization =
    request.headers
      .get(
        'authorization',
      )
      ?.trim();

  if (
    manualSecret &&
    headerSecret ===
      manualSecret
  ) {
    return true;
  }

  if (
    manualSecret &&
    authorization ===
      `Bearer ${manualSecret}`
  ) {
    return true;
  }

  if (
    allowCron &&
    cronSecret &&
    authorization ===
      `Bearer ${cronSecret}`
  ) {
    return true;
  }

  return false;
}

/* =========================================================
   ONE TENANT + ONE SELECTED ASSET
========================================================= */

async function executeRuntimeSync({
  startDate,
  endDate,
  triggeredBy,
  runtimeConfig,
}: {
  startDate: string;
  endDate: string;
  triggeredBy:
    | 'manual'
    | 'cron';
  runtimeConfig:
    GoogleAdsRuntime;
}): Promise<
  Extract<
    SyncResult,
    {
      ok: true;
    }
  >
> {
  const supabase =
    createGoogleAdsAdminClient();

  const {
    data:
      run,
    error:
      runError,
  } =
    await supabase
      .from(
        'google_ads_sync_runs',
      )
      .insert({
        organization_id:
          runtimeConfig.organizationId,
        connection_id:
          runtimeConfig.connectionId,
        integration_asset_id:
          runtimeConfig.assetId,
        customer_id:
          runtimeConfig.customerId,
        start_date:
          startDate,
        end_date:
          endDate,
        status:
          'running',
        triggered_by:
          triggeredBy,
      })
      .select(
        'id',
      )
      .single();

  if (
    runError ||
    !run
  ) {
    throw new Error(
      `Unable to create Google Ads sync run: ${
        runError?.message ??
        'Unknown error'
      }`,
    );
  }

  try {
    const counts =
      await syncGoogleAdsToSupabase(
        {
          startDate,
          endDate,
          syncRunId:
            run.id,
        },
        runtimeConfig,
      );

    const {
      error:
        updateError,
    } =
      await supabase
        .from(
          'google_ads_sync_runs',
        )
        .update({
          status:
            'success',
          campaign_rows:
            counts.campaignRows,
          ad_group_rows:
            counts.adGroupRows,
          keyword_rows:
            counts.keywordRows,
          search_term_rows:
            counts.searchTermRows,
          geo_rows:
            counts.geoRows,
          device_rows:
            counts.deviceRows,
          total_rows:
            counts.totalRows,
          request_ids:
            counts.requestIds,
          completed_at:
            new Date()
              .toISOString(),
          error_message:
            null,
        })
        .eq(
          'id',
          run.id,
        )
        .eq(
          'organization_id',
          runtimeConfig.organizationId,
        );

    if (
      updateError
    ) {
      throw new Error(
        `Google Ads data synced, but sync-run status could not be updated: ${updateError.message}`,
      );
    }

    return {
      ok:
        true,
      organizationId:
        runtimeConfig.organizationId,
      connectionId:
        runtimeConfig.connectionId,
      integrationAssetId:
        runtimeConfig.assetId,
      customerId:
        runtimeConfig.customerId,
      startDate,
      endDate,
      counts,
    };
  } catch (
    error
  ) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unknown Google Ads sync error';

    await supabase
      .from(
        'google_ads_sync_runs',
      )
      .update({
        status:
          'failed',
        error_message:
          message,
        completed_at:
          new Date()
            .toISOString(),
      })
      .eq(
        'id',
        run.id,
      )
      .eq(
        'organization_id',
        runtimeConfig.organizationId,
      );

    throw error;
  }
}

/* =========================================================
   ALL MATCHING TENANTS / ASSETS
========================================================= */

async function runSync({
  startDate,
  endDate,
  triggeredBy,
  filter = {},
}: {
  startDate: string;
  endDate: string;
  triggeredBy:
    | 'manual'
    | 'cron';
  filter?:
    RuntimeFilter;
}) {
  validateRange(
    startDate,
    endDate,
  );

  const runtimes =
    await resolveGoogleAdsRuntimes({
      organizationId:
        filter.organizationId,
      assetId:
        filter.assetId,
    });

  const results:
    SyncResult[] =
    [];

  for (
    const runtimeConfig
    of runtimes
  ) {
    try {
      results.push(
        await executeRuntimeSync({
          startDate,
          endDate,
          triggeredBy,
          runtimeConfig,
        }),
      );
    } catch (
      error
    ) {
      results.push({
        ok:
          false,
        organizationId:
          runtimeConfig.organizationId,
        connectionId:
          runtimeConfig.connectionId,
        integrationAssetId:
          runtimeConfig.assetId,
        customerId:
          runtimeConfig.customerId,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown Google Ads sync error',
      });
    }
  }

  const successful =
    results.filter(
      (
        result,
      ) =>
        result.ok,
    ).length;

  const failed =
    results.length -
    successful;

  return {
    ok:
      failed === 0,
    startDate,
    endDate,
    selectedAssets:
      runtimes.length,
    successful,
    failed,
    results,
    trigger:
      triggeredBy,
  };
}

/* =========================================================
   POST — MANUAL / BACKFILL
========================================================= */

export async function POST(
  request: NextRequest,
) {
  if (
    !isAuthorized(
      request,
      true,
    )
  ) {
    return NextResponse.json(
      {
        ok:
          false,
        error:
          'Unauthorized.',
      },
      {
        status:
          401,
      },
    );
  }

  try {
    const body =
      await request
        .json()
        .catch(
          () => ({}),
        ) as {
          startDate?: string;
          endDate?: string;
          organizationId?: string;
          integrationAssetId?: string;
        };

    const yesterday =
      isoDate(
        new Date(
          Date.now() -
          86400000,
        ),
      );

    const endDate =
      body.endDate ??
      yesterday;

    const startDate =
      body.startDate ??
      addUtcDays(
        endDate,
        -6,
      );

    const result =
      await runSync({
        startDate,
        endDate,
        triggeredBy:
          'manual',
        filter: {
          organizationId:
            body.organizationId,
          assetId:
            body.integrationAssetId,
        },
      });

    return NextResponse.json(
      result,
    );
  } catch (
    error
  ) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unknown Google Ads sync error';

    console.error(
      'Google Ads manual sync failed:',
      error,
    );

    return NextResponse.json(
      {
        ok:
          false,
        error:
          message,
      },
      {
        status:
          500,
      },
    );
  }
}

/* =========================================================
   GET — VERCEL CRON
========================================================= */

export async function GET(
  request: NextRequest,
) {
  if (
    !isAuthorized(
      request,
      true,
    )
  ) {
    return NextResponse.json(
      {
        ok:
          false,
        error:
          'Unauthorized.',
      },
      {
        status:
          401,
      },
    );
  }

  try {
    /*
     * Re-sync the latest seven completed days because
     * conversion attribution can update after the click date.
     */
    const endDate =
      isoDate(
        new Date(
          Date.now() -
          86400000,
        ),
      );

    const startDate =
      addUtcDays(
        endDate,
        -6,
      );

    const result =
      await runSync({
        startDate,
        endDate,
        triggeredBy:
          'cron',
      });

    return NextResponse.json(
      result,
    );
  } catch (
    error
  ) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unknown Google Ads cron error';

    console.error(
      'Google Ads cron sync failed:',
      error,
    );

    return NextResponse.json(
      {
        ok:
          false,
        error:
          message,
      },
      {
        status:
          500,
      },
    );
  }
}
