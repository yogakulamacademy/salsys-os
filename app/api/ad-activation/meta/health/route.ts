import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bearerMatchesAnySecret } from "@/lib/security/machine-bearer-auth";
import {
  getAdActivationCanaryScope,
  isAdActivationRunnerEnabled,
} from "@/lib/ad-activation/runner-controls";
import { AD_ACTIVATION_TRANSPORT_ENABLED } from "@/lib/ad-activation/transport-policy";

export const dynamic = "force-dynamic";

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

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("v_ad_activation_runner_health_v1")
    .select("provider,last_started_at,last_completed_at,last_status,last_claimed,last_delivered,last_retry,last_skipped,last_failed,last_lease_lost,last_error_code,lease_expires_at,runner_active,checked_at")
    .eq("provider", "meta")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { ok: false, error: "activation_health_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      provider: "meta",
      runnerEnabled: isAdActivationRunnerEnabled(),
      transportEnabled: AD_ACTIVATION_TRANSPORT_ENABLED,
      canaryConfigured: getAdActivationCanaryScope() !== null,
      mode: "canary_only",
      state: data ?? null,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
