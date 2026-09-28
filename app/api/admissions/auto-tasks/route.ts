import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function isAuthorized(request: NextRequest) {
  const cronSecret =
    process.env.CRON_SECRET?.trim();

  if (!cronSecret) {
    return false;
  }

  const authorization =
    request.headers
      .get('authorization')
      ?.trim();

  return (
    authorization ===
    `Bearer ${cronSecret}`
  );
}

async function runAutoTasks(
  request: NextRequest
) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Unauthorized',
      },
      {
        status: 401,
      }
    );
  }

  try {
    const supabase =
      createAdminClient();

    const {
      data,
      error,
    } = await supabase.rpc(
      'run_admissions_auto_tasks',
      {
        p_dry_run: false,
      }
    );

    if (error) {
      throw error;
    }

    const rows =
      Array.isArray(data)
        ? data
        : [];

    const created =
      rows.filter(
        (row: any) =>
          row?.result === 'created'
      ).length;

    const failed =
      rows.filter(
        (row: any) =>
          typeof row?.result ===
            'string' &&
          row.result.startsWith(
            'failed:'
          )
      ).length;

    return NextResponse.json({
      ok: failed === 0,
      trigger: 'cron',
      processed: rows.length,
      created,
      failed,
      rows,
      ranAt:
        new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Automatic admissions task run failed';

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      {
        status: 500,
      }
    );
  }
}

export async function GET(
  request: NextRequest
) {
  return runAutoTasks(request);
}

export async function POST(
  request: NextRequest
) {
  return runAutoTasks(request);
}
