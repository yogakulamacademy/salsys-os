import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getTrackingAllowedOrigins,
  trackingCorsHeaders,
} from "@/lib/tracking/server";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: trackingCorsHeaders(request.headers.get("origin")),
  });
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const cors = trackingCorsHeaders(origin);

  /*
   * This is an infrastructure/admin diagnostic endpoint.
   * Do not expose database/service-role diagnostics publicly.
   */
  const supabase = await createClient();

  const { data: isAdmin, error: adminError } =
    await supabase.rpc("is_crm_admin");

  if (adminError || isAdmin !== true) {
    return NextResponse.json(
      {
        ok: false,
        error: "Admin access required.",
      },
      {
        status: 403,
        headers: cors,
      },
    );
  }

  const allowedOrigins = getTrackingAllowedOrigins();

  let databaseOk = false;

  try {
    /*
     * Use the same server-side admin client used by the tracking ingestion
     * pipeline, but perform only a lightweight connectivity/read check.
     */
    const admin = createAdminClient();

    const { error } = await admin.from("touchpoints").select("id").limit(1);

    if (error) {
      throw error;
    }

    databaseOk = true;
  } catch (error) {
    /*
     * Keep infrastructure/database details server-side.
     */
    console.error("Tracking health database check failed:", error);
  }

  return NextResponse.json(
    {
      ok: databaseOk && allowedOrigins.length > 0,

      tracker_version: "0.8.0",

      allowed_origins_configured: allowedOrigins.length > 0,

      database_ok: databaseOk,
    },
    {
      status: databaseOk ? 200 : 500,
      headers: cors,
    },
  );
}
