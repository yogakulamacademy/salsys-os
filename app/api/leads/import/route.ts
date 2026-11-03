import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";
import { useMockData } from "@/lib/config";
import {
  importIdentityKeys,
  validateImportRow,
  type ImportLeadRow,
  LEADS_IMPORT_CHUNK_SIZE,
} from "@/lib/leads-transfer-csv";

export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 80_000;
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

async function boundedBody(request: NextRequest) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_REQUEST_BYTES) throw new Error("Request too large.");
  if (!request.body) throw new Error("Missing request body.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_REQUEST_BYTES) throw new Error("Request too large.");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
}

type ImportResult = { rowNumber: number; status: "created" | "skipped" | "failed"; message: string };

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (
    (origin && origin !== request.nextUrl.origin) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    return json({ error: "Cross-site requests are not permitted." }, 403);
  }
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") {
    return json({ error: "Expected JSON import data." }, 415);
  }
  if (useMockData) return json({ error: "Import is disabled in demo mode." }, 403);

  let body: unknown;
  try {
    body = await boundedBody(request);
  } catch {
    return json({ error: "Invalid or oversized import request." }, 400);
  }

  const rows = body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>).rows
    : null;
  if (!Array.isArray(rows) || !rows.length || rows.length > LEADS_IMPORT_CHUNK_SIZE) {
    return json({ error: "Provide 1–" + LEADS_IMPORT_CHUNK_SIZE + " lead rows per batch." }, 400);
  }
  const validRows: ImportLeadRow[] = [];
  const seenRows = new Set<number>();
  const seenKeys = new Set<string>();
  for (const candidate of rows) {
    const { row, error } = validateImportRow(candidate);
    if (!row || error) return json({ error: "Row validation failed: " + (error ?? "invalid row") }, 400);
    if (seenRows.has(row.rowNumber)) return json({ error: "Repeated CSV row number." }, 400);
    seenRows.add(row.rowNumber);
    const keys = importIdentityKeys(row);
    if (keys.some(k => seenKeys.has(k))) return json({ error: "Duplicate contact within this batch." }, 400);
    keys.forEach(key => seenKeys.add(key));
    validRows.push(row);
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return json({ error: "Sign in to import leads." }, 401);

  let organizationId: string;
  try {
    organizationId = await requireCurrentOrganizationId(supabase, user.id);
  } catch {
    return json({ error: "Active workspace is not available." }, 403);
  }

  const { data: canManage, error: accessError } = await supabase.rpc(
    "can_manage_sales_workspace",
    { p_organization_id: organizationId },
  );
  if (accessError || canManage !== true) {
    return json({ error: "Only Sales managers and administrators can import leads." }, 403);
  }

  // Preflight existing contacts before writing. Read under the same authenticated
  // tenant-bound session; an unavailable check must not silently create duplicates.
  const contactKeys = [...new Set(validRows.flatMap(importIdentityKeys).map(k => k.split(":").slice(1).join(":")))];
  const { data: known, error: contactError } = await supabase
    .from("lead_contacts")
    .select("normalized_value,contact_type")
    .eq("organization_id", organizationId)
    .in("normalized_value", contactKeys);
  if (contactError) return json({ error: "Unable to verify existing contacts. No leads were imported in this batch." }, 503);
  const knownKeys = new Set((known ?? []).map(c => String(c.contact_type) + ":" + String(c.normalized_value)));

  const results: ImportResult[] = [];
  for (const row of validRows) {
    const keys = importIdentityKeys(row);
    if (keys.some(k => knownKeys.has(k))) {
      results.push({ rowNumber: row.rowNumber, status: "skipped", message: "Contact already exists in this workspace." });
      continue;
    }

    const { error } = await supabase.rpc("create_crm_lead", {
      p_organization_id: organizationId,
      p_first_name: row.first_name,
      p_last_name: row.last_name || null,
      p_email: row.email || null,
      p_phone: row.phone || null,
      p_course_id: null,
      p_preferred_batch_id: null,
      p_preferred_location: row.preferred_location || null,
      p_preferred_month: null,
      p_preferred_mode: row.preferred_mode || null,
      p_country: row.country || null,
      p_timezone: null,
      p_lead_creation_channel: row.lead_creation_channel,
      p_current_contact_channel: row.lead_creation_channel,
      p_first_touch_source: row.first_touch_source,
      p_first_touch_medium: null,
      p_first_touch_campaign: null,
      p_notes: row.notes || null,
    });

    if (error) {
      // Do not return raw database error details or contact PII to clients.
      results.push({ rowNumber: row.rowNumber, status: "failed", message: "Unable to create lead. Review this row before retrying." });
    } else {
      keys.forEach(key => knownKeys.add(key));
      results.push({ rowNumber: row.rowNumber, status: "created", message: "Lead created." });
    }
  }

  return json({ results });
}
