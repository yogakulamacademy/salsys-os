import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  createAdminClient,
} from '@/lib/supabase/admin';

export const dynamic =
  'force-dynamic';


type RunnerRow = {
  lead_id?: string | null;
  lead_code?: string | null;
  lead_name?: string | null;
  rule_key?: string | null;
  task_title?: string | null;
  due_at?: string | null;
  result?: string | null;
};


function isAuthorized(
  request: NextRequest
) {
  const cronSecret =
    process.env
      .CRON_SECRET
      ?.trim();

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

  const supabase =
    createAdminClient();

  let runId:
    | string
    | null = null;

  try {
    const {
      data: run,
      error: runError,
    } = await supabase
      .from(
        'admissions_auto_task_runs'
      )
      .insert({
        trigger_source:
          'cron',
        status:
          'running',
      })
      .select('id')
      .single();

    if (runError) {
      throw runError;
    }

    runId =
      run.id;

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
      (
        Array.isArray(data)
          ? data
          : []
      ) as RunnerRow[];

    const created =
      rows.filter(
        (row) =>
          row.result ===
          'created'
      ).length;

    const failed =
      rows.filter(
        (row) =>
          typeof row.result ===
            'string' &&
          row.result.startsWith(
            'failed:'
          )
      ).length;

    const status =
      failed === 0
        ? 'success'
        : created > 0
          ? 'partial'
          : 'failed';

    const {
      error:
        updateError,
    } = await supabase
      .from(
        'admissions_auto_task_runs'
      )
      .update({
        status,
        processed_count:
          rows.length,
        created_count:
          created,
        failed_count:
          failed,
        result_rows:
          rows,
        completed_at:
          new Date()
            .toISOString(),
      })
      .eq(
        'id',
        runId
      );

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      ok:
        failed === 0,
      trigger:
        'cron',
      runId,
      processed:
        rows.length,
      created,
      failed,
      rows,
      ranAt:
        new Date()
          .toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Automatic admissions task run failed';

    if (runId) {
      await supabase
        .from(
          'admissions_auto_task_runs'
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
          runId
        );
    }

    return NextResponse.json(
      {
        ok: false,
        runId,
        error:
          message,
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
  return runAutoTasks(
    request
  );
}


export async function POST(
  request: NextRequest
) {
  return runAutoTasks(
    request
  );
}
