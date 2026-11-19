import { NextResponse, type NextRequest } from "next/server";

import { classifyLinkRequest, fallbackDestination, isAllowedDestination, isAppHost, isLinkCode } from "@/lib/dm-links";
import { findBusinessByLinkDomain, getOrgSalesAiSettings } from "@/lib/org-sales-ai-settings";
import { createAdminClient } from "@/lib/supabase/admin";

// Tracked course link. Standard: salsysos.com/go/<code>. Premium: a business's
// branded domain, rewritten here by middleware. Records the visit (country from
// Vercel's network geolocation, never the IP itself) and forwards to the
// business's own course page. A failure to record never blocks the visitor.

export const dynamic = "force-dynamic";

function redirect(to: string) {
  const response = NextResponse.redirect(to, 302);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

async function handle(request: NextRequest, code: string) {
  const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "").toLowerCase().split(":")[0];
  const admin = createAdminClient();
  const brandedHost = host && !isAppHost(host) ? host : null;

  try {
    // The business whose branded domain this is (only verified premium domains count).
    const domainOwner = brandedHost ? await findBusinessByLinkDomain(admin, brandedHost) : null;
    const domainFallback = fallbackDestination(domainOwner?.websiteHosts ?? []);
    if (brandedHost && !(domainOwner?.linkDomainVerified)) return redirect(domainFallback);
    if (!isLinkCode(code)) return redirect(domainFallback);

    const { data: link } = await admin.from("dm_tracked_links").select("organization_id").eq("code", code).maybeSingle();
    if (!link) return redirect(domainFallback);
    // A branded domain only serves its own business's links.
    if (domainOwner && domainOwner.organizationId !== String(link.organization_id)) return redirect(domainFallback);

    const settings = domainOwner ?? (await getOrgSalesAiSettings(admin, String(link.organization_id)));
    const { kind, agent } = classifyLinkRequest({
      method: request.method,
      userAgent: request.headers.get("user-agent"),
      purpose: request.headers.get("sec-purpose") || request.headers.get("purpose"),
    });
    const country = (request.headers.get("x-vercel-ip-country") || "").toUpperCase() || null;
    const region = request.headers.get("x-vercel-ip-country-region") || null;
    const { data } = await admin.rpc("record_dm_link_visit_v1", {
      p_code: code, p_kind: kind, p_country: country, p_region: region, p_agent: agent,
    });
    const destination = typeof data === "string" ? data : null;
    return redirect(isAllowedDestination(destination, settings.websiteHosts) ? destination : fallbackDestination(settings.websiteHosts));
  } catch (error) {
    console.error("Tracked link visit not recorded", { error: error instanceof Error ? error.message : "unknown" });
    return redirect("https://salsysos.com/");
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  return handle(request, code);
}

export async function HEAD(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  return handle(request, code);
}
