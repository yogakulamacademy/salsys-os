import { NextResponse } from "next/server";

import { getLeadInspectorData } from "@/lib/lead-inspector-data";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const payload = await getLeadInspectorData(id);

    if (!payload) {
      return NextResponse.json(
        { ok: false, error: "Lead not found or access denied." },
        {
          status: 404,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }

    return NextResponse.json(
      { ok: true, data: payload },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Lead Inspector request failed", error);
    return NextResponse.json(
      { ok: false, error: "Unable to load the Lead Inspector right now." },
      {
        status: 500,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
