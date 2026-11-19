import { NextRequest, NextResponse } from "next/server";

import { runLocationScan } from "@/lib/lead-location-data";
import { bearerMatchesAnySecret } from "@/lib/security/machine-bearer-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Every 10 minutes: work out where leads are from every clue (forms, website,
// course links, phone code, rupee quotes, what they wrote).
// Backfills leads never located.
function isAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return false;
  return bearerMatchesAnySecret(request.headers.get("authorization"), [cronSecret]);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const summary = await runLocationScan(createAdminClient());
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), ...summary });
  } catch (error) {
    console.error("Location scan failed", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Location scan failed" }, { status: 500 });
  }
}
