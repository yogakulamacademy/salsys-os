import { NextRequest, NextResponse } from "next/server";

import { runInterestScan } from "@/lib/lead-interests-data";
import { bearerMatchesAnySecret } from "@/lib/security/machine-bearer-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Every 10 minutes: update course interests, main course and estimated value
// for leads with new forms, messages or link opens, plus a batch of leads never
// scanned before (backfill).
function isAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return false;
  return bearerMatchesAnySecret(request.headers.get("authorization"), [cronSecret]);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const summary = await runInterestScan(createAdminClient());
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), ...summary });
  } catch (error) {
    console.error("Interest scan failed", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Interest scan failed" }, { status: 500 });
  }
}
