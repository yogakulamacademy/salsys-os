import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { runMetaAdActivationExecutionCycle } from "@/lib/ad-activation/execution-runner";
import { bearerMatchesAnySecret } from "@/lib/security/machine-bearer-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: NextRequest) {
  const secrets = [
    process.env.AD_ACTIVATION_RUNNER_SECRET,
    process.env.CRON_SECRET,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  if (secrets.length === 0) {
    return false;
  }

  return bearerMatchesAnySecret(request.headers.get("authorization"), secrets);
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const summary = await runMetaAdActivationExecutionCycle({
    leaseSeconds: 300,
    runnerLeaseSeconds: 600,
  });

  return NextResponse.json(
    { ok: summary.status !== "failed", summary },
    {
      status: summary.status === "failed" ? 503 : 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
