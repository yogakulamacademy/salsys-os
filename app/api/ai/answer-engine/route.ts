import { NextRequest, NextResponse } from "next/server";

import { runAnswerEngineShadow } from "@/lib/answer-engine-runner";
import { bearerMatchesAnySecret } from "@/lib/security/machine-bearer-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Answer Engine shadow mode (owner-approved 26 Nov 2026), every 10 minutes. It
// never sends anything: it records what the rules engine would have answered,
// Claude's check of a few drafts, and the reply the team sent.
// ANSWER_ENGINE_SHADOW=off stops it.
function isAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return false;
  return bearerMatchesAnySecret(request.headers.get("authorization"), [cronSecret]);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (process.env.ANSWER_ENGINE_SHADOW === "off") return NextResponse.json({ ok: true, skipped: "Answer engine shadow mode is off" });
  try {
    const summary = await runAnswerEngineShadow(createAdminClient());
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), ...summary });
  } catch (error) {
    console.error("Answer engine shadow run failed", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Run failed" }, { status: 500 });
  }
}
