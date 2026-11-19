import { NextRequest, NextResponse } from "next/server";

import { runStageScan, stageAutomationMode } from "@/lib/lead-stages-data";
import { bearerMatchesAnySecret } from "@/lib/security/machine-bearer-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Every 10 minutes: move pipeline stages forward from what leads say
// (AI_STAGE_AUTOMATION_MODE = off | dry_run | live). ?mode=dry_run forces a
// report-only run.
function isAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return false;
  return bearerMatchesAnySecret(request.headers.get("authorization"), [cronSecret]);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const envMode = stageAutomationMode();
  const mode = request.nextUrl.searchParams.get("mode") === "dry_run" && envMode !== "off" ? "dry_run" : envMode;
  if (mode === "off") return NextResponse.json({ ok: true, skipped: "AI_STAGE_AUTOMATION_MODE is off" });
  const backfill = Math.min(Math.max(Number(request.nextUrl.searchParams.get("backfill") ?? 60) || 60, 0), 150);
  try {
    const summary = await runStageScan(createAdminClient(), mode, new Date(), backfill);
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), ...summary });
  } catch (error) {
    console.error("Stage scan failed", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Stage scan failed" }, { status: 500 });
  }
}
