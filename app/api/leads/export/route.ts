import { NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";
import { getLeadsTransferPermissions } from "@/lib/leads-transfer-permissions";
import { useMockData } from "@/lib/config";
import { csvRow, exportContactCells } from "@/lib/leads-transfer-csv";
import {
  getLeadsWorkspacePageWithAttributionScope,
  parseLeadsAttributionScope,
} from "@/lib/leads-attribution-scope";
import { parseLeadsWorkspaceParams } from "@/lib/leads-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_EXPORT_LEADS = 2_000;
const HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

function errorResponse(text: string, status: number) {
  return new Response(text, { status, headers: { ...HEADERS, "Content-Type": "text/plain; charset=utf-8" } });
}

/**
 * Exports the authorized filtered Leads workspace for Sales managers.
 * Uses the existing lead-access read model and additionally blanks contact
 * fields unless the caller has the separate CRM PII permission. Never query
 * raw lead tables or expose even masked contact strings to unapproved roles.
 */
export async function GET(request: NextRequest) {
  if (useMockData) return errorResponse("CSV export is disabled in demo mode.", 403);

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return errorResponse("Sign in to export leads.", 401);

  let organizationId: string;
  try {
    organizationId = await requireCurrentOrganizationId(supabase, user.id);
  } catch {
    return errorResponse("Active workspace is not available.", 403);
  }

  const permissions = await getLeadsTransferPermissions(supabase, user.id, organizationId);
  if (!permissions.canExport) {
    return errorResponse("Sales management access is required to export leads.", 403);
  }
  // Private contact columns remain redacted unless separately authorized.
  const canViewContacts = permissions.canExportContacts;

  const params = Object.fromEntries(
    request.nextUrl.searchParams.entries(),
  ) as Record<string, string>;
  const scope = parseLeadsAttributionScope(params);
  const filters = parseLeadsWorkspaceParams(params);
  filters.page = 1;

  try {
    const first = await getLeadsWorkspacePageWithAttributionScope(filters, scope);
    if (first.warning) return errorResponse("Filtered lead export evidence is unavailable.", 503);
    const total = first.pagination.total;
    if (total > MAX_EXPORT_LEADS) {
      return errorResponse(
        "This filtered view contains " + total + " leads. Apply filters to export at most " + MAX_EXPORT_LEADS + " leads per CSV.",
        422,
      );
    }

    const headers = [
      "lead_id", "lead_code", "name", "email", "phone", "contact_availability",
      "country", "course", "preferred_location", "lead_creation_channel",
      "first_touch_source", "owner", "stage", "intent",
      "created_at", "next_followup_at",
    ];
    const lines = [csvRow(headers)];

    function append(leads: typeof first.leads) {
      for (const lead of leads) {
        const [email, phone, availability] = exportContactCells(lead, canViewContacts);
        lines.push(csvRow([
          lead.id, lead.leadCode, lead.name, email, phone,
          availability, lead.country, lead.course, lead.location,
          lead.leadCreationChannel, lead.firstTouchSource, lead.owner,
          lead.stage, lead.intent, lead.createdAt, lead.nextFollowupAt,
        ]));
      }
    }

    append(first.leads);
    for (let page = 2; page <= first.pagination.totalPages; page++) {
      const next = await getLeadsWorkspacePageWithAttributionScope({ ...filters, page }, scope);
      if (next.warning) return errorResponse("Lead export stopped because a read returned incomplete evidence.", 503);
      append(next.leads);
    }

    const fileName = "salsys-leads-" + new Date().toISOString().slice(0, 10) + ".csv";
    const csv = "\uFEFF" + lines.join("\r\n") + "\r\n";
    return new Response(csv, {
      status: 200,
      headers: {
        ...HEADERS,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="' + fileName + '"',
      },
    });
  } catch {
    return errorResponse("Unable to export this Leads view. Please retry or narrow the filters.", 503);
  }
}
