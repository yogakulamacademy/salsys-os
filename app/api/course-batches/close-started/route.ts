import { NextRequest, NextResponse } from "next/server";

import { batchHasStarted, todayIn } from "@/lib/batch-auto-close";
import { bearerMatchesAnySecret } from "@/lib/security/machine-bearer-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Daily (just after midnight IST): close every open batch that has started or
// ended, for every business, so Course Management only lists upcoming batches.
// Closing = local_enabled false (the batch is kept, with its history and any
// enrolments), logged in course_batch_admin_events.
function isAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return false;
  return bearerMatchesAnySecret(request.headers.get("authorization"), [cronSecret]);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const now = new Date();
  // Generous date filter (tomorrow's date in UTC+14 covers every zone); exact check per batch below.
  const latest = todayIn("Pacific/Kiritimati", now);
  const { data: batches, error } = await admin
    .from("course_batches")
    .select("*")
    .eq("local_enabled", true)
    .lte("start_date", latest)
    .limit(1000);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  let closed = 0;
  let failed = 0;
  for (const batch of batches ?? []) {
    if (!batchHasStarted(batch, now)) continue;
    const metadata = {
      ...((batch.metadata ?? {}) as Record<string, unknown>),
      closed_reason: `Started on ${batch.start_date}; closed automatically ${todayIn(batch.timezone, now)}`,
    };
    const { data: updated, error: updateError } = await admin
      .from("course_batches")
      .update({ local_enabled: false, metadata })
      .eq("id", batch.id)
      .eq("organization_id", batch.organization_id)
      .eq("local_enabled", true)
      .select("*")
      .maybeSingle();
    if (updateError || !updated) { failed += 1; continue; }
    await admin.from("course_batch_admin_events").insert({
      batch_id: batch.id,
      organization_id: batch.organization_id,
      actor_user_id: null,
      action: "batch_auto_closed_started",
      previous_data: batch,
      new_data: updated,
    });
    closed += 1;
  }
  return NextResponse.json({ ok: true, ranAt: now.toISOString(), checked: batches?.length ?? 0, closed, failed });
}
