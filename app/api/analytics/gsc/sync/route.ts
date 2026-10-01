import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  createGscAdminClient,
  resolveGscRuntime,
  syncGscToSupabase,
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


/* =========================================================
   AUTHORIZATION
========================================================= */

function isAuthorized(
  request: NextRequest
) {
  const authorization =
    request.headers.get(
      'authorization'
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
          value?.trim()
      )
      .filter(
        (
          value
        ): value is string =>
          Boolean(
            value
          )
      );

  if (
    secrets.length ===
    0
  ) {
    throw new Error(
      'GSC_SYNC_SECRET or CRON_SECRET is not configured.'
    );
  }

  return secrets.some(
    (secret) =>
      authorization ===
      `Bearer ${secret}`
  );
}


/* =========================================================
   DATE HELPERS
========================================================= */

function isoDate(
  date: Date
) {
  return date
    .toISOString()
    .slice(
      0,
      10
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
        now.getUTCDate() - 3
      )
    );

  const start =
    new Date(
      Date.UTC(
        end.getUTCFullYear(),
        end.getUTCMonth(),
        end.getUTCDate() - 13
      )
    );

  return {
    startDate:
      isoDate(
        start
      ),

    endDate:
      isoDate(
        end
      ),
  };
}


function isIsoDate(
  value: string
) {
  return /^\d{4}-\d{2}-\d{2}$/
    .test(
      value
    );
}


function validateRange(
  startDate: string,
  endDate: string
) {
  if (
    !isIsoDate(
      startDate
    ) ||
    !isIsoDate(
      endDate
    )
  ) {
    throw new Error(
      'startDate and endDate must use YYYY-MM-DD.'
    );
  }

  const start =
    new Date(
      `${startDate}T00:00:00Z`
    );

  const end =
    new Date(
      `${endDate}T00:00:00Z`
    );

  if (
    Number.isNaN(
      start.getTime()
    ) ||
    Number.isNaN(
      end.getTime()
    )
  ) {
    throw new Error(
      'Invalid date range.'
    );
  }

  if (
    start >
    end
  ) {
    throw new Error(
      'startDate must be before or equal to endDate.'
    );
  }

  const days =
    Math.floor(
      (
        end.getTime() -
        start.getTime()
      ) /
      86400000
    ) + 1;

  if (
    days >
    93
  ) {
    throw new Error(
      'A single GSC sync is limited to 93 days.'
    );
  }
}


/* =========================================================
   SYNC RUNNER
========================================================= */

async function executeSync(
  range: SyncRange,
  triggeredBy:
    'manual' |
    'cron'
) {
  const {
    startDate,
    endDate,
  } =
    range;

  validateRange(
    startDate,
    endDate
  );

  /*
   * Prefer the selected Search Console asset + Google OAuth
   * connection. During migration, lib/gsc.ts safely falls
   * back to the existing Vercel OIDC / WIF configuration.
   */
  const gscRuntime =
    await resolveGscRuntime();

  const siteUrl =
    gscRuntime.siteUrl;

  if (
    gscRuntime.authSource ===
      'legacy_wif' &&
    gscRuntime.fallbackReason
  ) {
    console.warn(
      'GSC integration fallback:',
      gscRuntime.fallbackReason
    );
  }

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
        'gsc_sync_runs'
      )
      .insert({
        site_url:
          siteUrl,

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
        'id'
      )
      .single();

  if (
    insertError ||
    !syncRun
  ) {
    throw new Error(
      `Unable to create GSC sync log: ${
        insertError
          ?.message ||
        'Unknown error'
      }`
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
        gscRuntime
      );

    const {
      error:
        updateError,
    } =
      await supabase
        .from(
          'gsc_sync_runs'
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
          syncRun.id
        );

    if (
      updateError
    ) {
      throw new Error(
        `GSC data synced, but the sync log could not be finalized: ${updateError.message}`
      );
    }

    return {
      ok: true,
      siteUrl,
      authSource:
        gscRuntime.authSource,
      fallbackReason:
        gscRuntime.authSource ===
          'legacy_wif'
          ? gscRuntime.fallbackReason ??
            'Unknown integration fallback reason.'
          : null,
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
        'gsc_sync_runs'
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
        syncRun.id
      );

    throw error;
  }
}


/* =========================================================
   GET
   Vercel Cron
========================================================= */

export async function GET(
  request: NextRequest
) {
  try {
    if (
      !isAuthorized(
        request
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
        }
      );
    }

    const result =
      await executeSync(
        defaultRange(),
        'cron'
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
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          message,
      },
      {
        status: 500,
      }
    );
  }
}


/* =========================================================
   POST
   Manual / initial import
========================================================= */

export async function POST(
  request: NextRequest
) {
  try {
    if (
      !isAuthorized(
        request
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
        }
      );
    }

    const defaults =
      defaultRange();

    let body:
      {
        startDate?: string;
        endDate?: string;
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
            body.startDate ||
            defaults.startDate,

          endDate:
            body.endDate ||
            defaults.endDate,
        },
        'manual'
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
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          message,
      },
      {
        status: 500,
      }
    );
  }
}
