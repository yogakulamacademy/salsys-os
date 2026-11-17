import { NextRequest, NextResponse } from "next/server";

import { runKnowledgeProposals } from "@/lib/ai-knowledge-proposals-runner";
import { bearerMatchesAnySecret } from "@/lib/security/machine-bearer-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Sales AI Job 6 (weekly cron): propose knowledge changes from the questions
// leads keep asking. Off unless AI_KNOWLEDGE_PROPOSALS_ENABLED=true. Writes
// proposals only; nothing changes in knowledge until an admin approves.
function isAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return false;
  return bearerMatchesAnySecret(request.headers.get("authorization"), [cronSecret]);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (process.env.AI_KNOWLEDGE_PROPOSALS_ENABLED !== "true") {
    return NextResponse.json({ ok: true, skipped: "AI_KNOWLEDGE_PROPOSALS_ENABLED is not true" });
  }
  try {
    const admin = createAdminClient();
    const allowed = (process.env.AI_KNOWLEDGE_PROPOSALS_ORG_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const { data: orgs, error } = await admin.from("organizations").select("id").limit(50);
    if (error) throw new Error("Organizations could not be loaded.");
    const runs = [];
    for (const org of orgs ?? []) {
      const id = String(org.id);
      if (allowed.length && !allowed.includes(id)) continue;
      runs.push(await runKnowledgeProposals(admin, id));
    }
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), runs });
  } catch (error) {
    console.error("AI knowledge proposal run failed", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "AI knowledge proposals failed" },
      { status: 500 },
    );
  }
}
