import { NextRequest, NextResponse } from "next/server";

import { runFollowupDetection } from "@/lib/ai-followup-runner";
import { bearerMatchesAnySecret } from "@/lib/security/machine-bearer-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Sales AI Job 4 (cron): turn "I'll get back to you" / "call me tomorrow" in
// recent inbound messages into follow-up tasks. Off unless
// AI_FOLLOWUP_DETECTION_ENABLED=true. Sends nothing to leads.
function isAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return false;
  return bearerMatchesAnySecret(request.headers.get("authorization"), [cronSecret]);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (process.env.AI_FOLLOWUP_DETECTION_ENABLED !== "true") {
    return NextResponse.json({ ok: true, skipped: "AI_FOLLOWUP_DETECTION_ENABLED is not true" });
  }
  try {
    const summary = await runFollowupDetection(createAdminClient());
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), ...summary });
  } catch (error) {
    console.error("AI follow-up detection run failed", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "AI follow-up detection failed" },
      { status: 500 },
    );
  }
}
