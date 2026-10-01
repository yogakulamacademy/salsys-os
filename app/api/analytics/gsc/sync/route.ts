import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  createGscAdminClient,
  resolveGscRuntimes,
  syncGscToSupabase,
  type GscRuntime,
} from '@/lib/gsc';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

export const maxDuration =
  300;

type SyncRange = {
  startDate: string;
  endDate: string;
};

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
      siteUrl: string;
      startDate: string;
      endDate: string;
      counts: Awaited<
        ReturnType<
          typeof syncGscToSupabase
        >
      >;
    }
  | {
      ok: false;
      organizationId: string;
      connectionId: string;
      integrationAssetId: string;
      siteUrl: string;
      error: string;
    };

/* =========================================================
   AUTHORIZATION
========================================================= */

function isAuthorized(
  request: NextRequest,
) {
  const authorization =
    request.headers.get(
      'authorization',
    );

  const secrets =
    [
      process.env
        .GSC_SYNC_SECRET,
      process.env
        .CRON_SECRET,
    ]
      .map(
        (value) =>
          value?.trim(),
      )
      .filter(
        (
          value,
        ): value is string =>
          Boolean(
            value,
          ),
      );

  if (
    secrets.length ===
    0
  ) {
    throw new Error(
      'GSC_SYNC_SECRET or CRON_SECRET is not configured.',
    );
  }

  return secrets.some(
    (secret) =>
      authorization ===
      `Bearer ${secret}`,
  );
}

/* =========================================================
   DATE HELPERS
========================================================= */

function isoDate(
  date: Date,
) {
  return date
    .toISOString()
    .slice(
      0,
      10,
    );
}

function defaultRange():
SyncRange {
  /*
   * Search Console finalized data normally trails real time.
   * Each daily cron ends three days ago and refreshes a
   * rolling 14-day finalized window.
   */
  const now =
    new Date();

  const end =
    new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - 3,
      ),
    );

  const start =
    new Date(
      Date.UTC(
        end.getUTCFullYear(),
        end.getUTCMonth(),
        end.getUTCDate() - 13,
      ),
    );

  return {
    startDate:
      isoDate(
        start,
      ),
    endDate:
      isoDate(
        end,
      ),
  };
}

function validateRange(
  startDate: string,
  endDate: string,
) {
  const isoPattern =
    /^\d{4}-\d{2}-\d{2}$/;

  if (
    !isoPattern.test(
      startDate,
    ) ||
    !isoPattern.test(
      endDate,
    )
  ) {
    throw new Error(
      'startDate and endDate must use YYYY-MM-DD.',
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
      'A single GSC sync is limited to 93 days.',
    );
  }
}

/* =========================================================
   ONE TENANT + ONE SELECTED ASSET
========================================================= */

async function executeRuntimeSync(
  range: SyncRange,
  triggeredBy:
    | 'manual'
    | 'cron',
  runtimeConfig: GscRuntime,
): Promise<
  Extract<
    SyncResult,
    {
      ok: true;
    }
  >
> {
  const {
    startDate,
    endDate,
  } =
    range;

  const supabase =
    createGscAdminClient();

  const {
    data:
      syncRun,
    error:
      insertError,
  } =
    await supabase
      .from(
        'gsc_sync_runs',
      )
      .insert({
        organization_id:
          runtimeConfig.organizationId,
        connection_id:
          runtimeConfig.connectionId,
        integration_asset_id:
          runtimeConfig.assetId,
        site_url:
          runtimeConfig.siteUrl,
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
    insertError ||
    !syncRun
  ) {
    throw new Error(
      `Unable to create GSC sync log: ${
        insertError?.message ??
        'Unknown error'
      }`,
    );
  }

  try {
    const counts =
      await syncGscToSupabase(
        {
          startDate,
          endDate,
          syncRunId:
            syncRun.id,
        },
        runtimeConfig,
      );

    const {
      error:
        updateError,
    } =
      await supabase
        .from(
          'gsc_sync_runs',
        )
        .update({
          status:
            'success',
          total_rows:
            counts.totalRows,
          completed_at:
            new Date()
              .toISOString(),
          error_message:
            null,
          metadata: {
            dailyRows:
              counts.dailyRows,
            queryRows:
              counts.queryRows,
            pageRows:
              counts.pageRows,
            countryRows:
              counts.countryRows,
            deviceRows:
              counts.deviceRows,
            searchAppearanceRows:
              counts.searchAppearanceRows,
          },
        })
        .eq(
          'id',
          syncRun.id,
        )
        .eq(
          'organization_id',
          runtimeConfig.organizationId,
        );

    if (
      updateError
    ) {
      throw new Error(
        `GSC data synced, but the sync log could not be finalized: ${updateError.message}`,
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
      siteUrl:
        runtimeConfig.siteUrl,
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
        : 'Unknown GSC sync error';

    await supabase
      .from(
        'gsc_sync_runs',
      )
      .update({
        status:
          'failed',
        completed_at:
          new Date()
            .toISOString(),
        error_message:
          message,
      })
      .eq(
        'id',
        syncRun.id,
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

async function executeSync(
  range: SyncRange,
  triggeredBy:
    | 'manual'
    | 'cron',
  filter:
    RuntimeFilter = {},
) {
  validateRange(
    range.startDate,
    range.endDate,
  );

  const runtimes =
    await resolveGscRuntimes({
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
        await executeRuntimeSync(
          range,
          triggeredBy,
          runtimeConfig,
        ),
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
        siteUrl:
          runtimeConfig.siteUrl,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown GSC sync error',
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
    startDate:
      range.startDate,
    endDate:
      range.endDate,
    selectedAssets:
      runtimes.length,
    successful,
    failed,
    results,
  };
}

/* =========================================================
   GET — VERCEL CRON
========================================================= */

export async function GET(
  request: NextRequest,
) {
  try {
    if (
      !isAuthorized(
        request,
      )
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Unauthorized',
        },
        {
          status: 401,
        },
      );
    }

    const result =
      await executeSync(
        defaultRange(),
        'cron',
      );

    return NextResponse.json({
      ...result,
      trigger:
        'cron',
    });
  } catch (
    error
  ) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unknown GSC sync error';

    console.error(
      'GSC cron sync failed:',
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          message,
      },
      {
        status: 500,
      },
    );
  }
}

/* =========================================================
   POST — MANUAL / BACKFILL
========================================================= */

export async function POST(
  request: NextRequest,
) {
  try {
    if (
      !isAuthorized(
        request,
      )
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Unauthorized',
        },
        {
          status: 401,
        },
      );
    }

    const defaults =
      defaultRange();

    let body: {
      startDate?: string;
      endDate?: string;
      organizationId?: string;
      integrationAssetId?: string;
    } = {};

    try {
      body =
        await request
          .json();
    } catch {
      body = {};
    }

    const result =
      await executeSync(
        {
          startDate:
            body.startDate ??
            defaults.startDate,
          endDate:
            body.endDate ??
            defaults.endDate,
        },
        'manual',
        {
          organizationId:
            body.organizationId,
          assetId:
            body.integrationAssetId,
        },
      );

    return NextResponse.json({
      ...result,
      trigger:
        'manual',
    });
  } catch (
    error
  ) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unknown GSC sync error';

    console.error(
      'GSC manual sync failed:',
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          message,
      },
      {
        status: 500,
      },
    );
  }
}
