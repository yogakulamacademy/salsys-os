import { NextRequest, NextResponse } from "next/server";

import { runAutopilot } from "@/lib/ai-autopilot-runner";
import { runAnswerEngineShadow } from "@/lib/answer-engine-runner";
import { bearerMatchesAnySecret } from "@/lib/security/machine-bearer-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Sales AI Job 2 (live, Instagram pilot) and Job 4 (due follow-ups), every 2 minutes.
// AI_AUTOPILOT_LIVE_ENABLED=true lets Autopilot reply and send by itself.
// AI_FOLLOWUP_DRAFTS_ENABLED=true writes AI drafts for follow-ups that are due.
function isAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return false;
  return bearerMatchesAnySecret(request.headers.get("authorization"), [cronSecret]);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (process.env.AI_AUTOPILOT_LIVE_ENABLED !== "true" && process.env.AI_FOLLOWUP_DRAFTS_ENABLED !== "true") {
    return NextResponse.json({ ok: true, skipped: "Autopilot and follow-up drafts are both off" });
  }
  try {
    const admin = createAdminClient();
    const summary = await runAutopilot(admin);
    // Answer Engine shadow mode (owner-approved 26 Nov 2026) also rides on this
    // 2-minute schedule, about every 10 minutes. It never sends; a failure there
    // never affects Autopilot.
    let answerEngine: unknown = null;
    if (process.env.ANSWER_ENGINE_SHADOW !== "off" && new Date().getUTCMinutes() % 10 < 2) {
      answerEngine = await runAnswerEngineShadow(admin).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
    }
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), ...summary, answerEngine });
  } catch (error) {
    console.error("Autopilot run failed", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Autopilot run failed" }, { status: 500 });
  }
}
