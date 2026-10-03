import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type RunnerRow = {
  lead_id?: string | null;
  lead_code?: string | null;
  lead_name?: string | null;
  rule_key?: string | null;
  task_title?: string | null;
  due_at?: string | null;
  result?: string | null;
};

type OrganizationRow = {
  id: string;
};

type RunSummary = {
  organizationId: string;
  runId: string | null;
  status: "success" | "partial" | "failed";
  processed: number;
  created: number;
  failed: number;
  rows: RunnerRow[];
  error?: string;
};

function isAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (!cronSecret) {
    return false;
  }

  const authorization = request.headers.get("authorization")?.trim();

  return authorization === `Bearer ${cronSecret}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Automatic admissions task run failed";
}

async function runAutoTasks(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unauthorized",
      },
      {
        status: 401,
      },
    );
  }

  const supabase = createAdminClient();
  const ranAt = new Date().toISOString();

  try {
    const { data: organizationRows, error: organizationsError } = await supabase
      .from("organizations")
      .select("id")
      .eq("status", "active");

    if (organizationsError) {
      throw organizationsError;
    }

    const organizations = (organizationRows ?? []) as OrganizationRow[];

    if (organizations.length === 0) {
      return NextResponse.json({
        ok: true,
        trigger: "cron",
        runId: null,
        processed: 0,
        created: 0,
        failed: 0,
        runFailures: 0,
        rows: [],
        runs: [],
        ranAt,
      });
    }

    const runs: RunSummary[] = [];
    let hardFailure = false;

    for (const organization of organizations) {
      const organizationId = organization.id;

      let runId: string | null = null;
      let rows: RunnerRow[] = [];
      let processed = 0;
      let created = 0;
      let failed = 0;

      try {
        const { data: run, error: runError } = await supabase
          .from("admissions_auto_task_runs")
          .insert({
            organization_id: organizationId,
            trigger_source: "cron",
            status: "running",
          })
          .select("id")
          .single();

        if (runError) {
          throw runError;
        }

        runId = run.id;

        const { data, error } = await supabase.rpc(
          "run_admissions_auto_tasks",
          {
            p_organization_id: organizationId,
            p_dry_run: false,
          },
        );

        if (error) {
          throw error;
        }

        rows = (Array.isArray(data) ? data : []) as RunnerRow[];
        processed = rows.length;

        created = rows.filter((row) => row.result === "created").length;

        failed = rows.filter(
          (row) =>
            typeof row.result === "string" && row.result.startsWith("failed:"),
        ).length;

        const status: RunSummary["status"] =
          failed === 0 ? "success" : created > 0 ? "partial" : "failed";

        const { error: updateError } = await supabase
          .from("admissions_auto_task_runs")
          .update({
            status,
            processed_count: processed,
            created_count: created,
            failed_count: failed,
            result_rows: rows,
            completed_at: new Date().toISOString(),
          })
          .eq("id", runId)
          .eq("organization_id", organizationId);

        if (updateError) {
          throw updateError;
        }

        runs.push({
          organizationId,
          runId,
          status,
          processed,
          created,
          failed,
          rows,
        });
      } catch (error) {
        hardFailure = true;

        const message = errorMessage(error);

        if (runId) {
          await supabase
            .from("admissions_auto_task_runs")
            .update({
              status: "failed",
              processed_count: processed,
              created_count: created,
              failed_count: failed,
              result_rows: rows,
              error_message: message,
              completed_at: new Date().toISOString(),
            })
            .eq("id", runId)
            .eq("organization_id", organizationId);
        }

        runs.push({
          organizationId,
          runId,
          status: "failed",
          processed,
          created,
          failed,
          rows,
          error: message,
        });
      }
    }

    const processed = runs.reduce((sum, run) => sum + run.processed, 0);
    const created = runs.reduce((sum, run) => sum + run.created, 0);
    const failed = runs.reduce((sum, run) => sum + run.failed, 0);
    const runFailures = runs.filter((run) => Boolean(run.error)).length;
    const rows = runs.flatMap((run) => run.rows);

    const ok = !hardFailure && failed === 0;

    return NextResponse.json(
      {
        ok,
        trigger: "cron",
        runId: runs.length === 1 ? runs[0].runId : null,
        processed,
        created,
        failed,
        runFailures,
        rows,
        runs,
        ranAt,
      },
      {
        status: hardFailure ? 500 : 200,
      },
    );
  } catch (error) {
    const message = errorMessage(error);

    return NextResponse.json(
      {
        ok: false,
        runId: null,
        error: message,
      },
      {
        status: 500,
      },
    );
  }
}

export async function GET(request: NextRequest) {
  return runAutoTasks(request);
}

export async function POST(request: NextRequest) {
  return runAutoTasks(request);
}
