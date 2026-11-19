import { NextResponse, type NextRequest } from "next/server";

import { classifyLinkRequest, isAllowedDestination, isLinkCode, TRACKED_LINK_FALLBACK } from "@/lib/dm-links";
import { createAdminClient } from "@/lib/supabase/admin";

// Tracked course link: go.yogakulamacademy.com/<code> (rewritten here by middleware).
// Records the visit (country from Vercel's network geolocation, never the IP
// itself) and forwards to the course page. A failure to record never blocks the
// visitor: they always land on the page.

export const dynamic = "force-dynamic";

async function handle(request: NextRequest, code: string) {
  let destination = TRACKED_LINK_FALLBACK;
  if (isLinkCode(code)) {
    const { kind, agent } = classifyLinkRequest({
      method: request.method,
      userAgent: request.headers.get("user-agent"),
      purpose: request.headers.get("sec-purpose") || request.headers.get("purpose"),
    });
    const country = (request.headers.get("x-vercel-ip-country") || "").toUpperCase() || null;
    const region = request.headers.get("x-vercel-ip-country-region") || null;
    try {
      const { data } = await createAdminClient().rpc("record_dm_link_visit_v1", {
        p_code: code, p_kind: kind, p_country: country, p_region: region, p_agent: agent,
      });
      if (isAllowedDestination(typeof data === "string" ? data : null)) destination = data as string;
    } catch (error) {
      console.error("Tracked link visit not recorded", { error: error instanceof Error ? error.message : "unknown" });
    }
  }
  const response = NextResponse.redirect(destination, 302);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  return handle(request, code);
}

export async function HEAD(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  return handle(request, code);
}
