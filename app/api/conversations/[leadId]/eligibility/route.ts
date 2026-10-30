import { NextResponse } from "next/server";

import { getMessagingEligibility } from "@/lib/messaging-eligibility";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";
import type { Channel } from "@/types/crm";

const SUPPORTED_CHANNELS = new Set<Channel>([
  "website",
  "instagram",
  "whatsapp",
  "email",
  "phone",
  "meta_lead_form",
  "other",
]);

function channelValue(value: string | null): Channel | null {
  return value && SUPPORTED_CHANNELS.has(value as Channel)
    ? (value as Channel)
    : null;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ leadId: string }> },
) {
  const { leadId } = await context.params;
  const url = new URL(request.url);
  const channel = channelValue(url.searchParams.get("channel"));

  if (!channel) {
    return NextResponse.json(
      { ok: false, error: "A supported messaging channel is required." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required." },
      { status: 401 },
    );
  }

  const { data: canWorkLead, error: accessError } = await supabase.rpc(
    "can_work_lead",
    { p_lead_id: leadId },
  );

  if (accessError || canWorkLead !== true) {
    return NextResponse.json(
      { ok: false, error: "You do not have access to this lead." },
      { status: 403 },
    );
  }

  const organizationId = await requireCurrentOrganizationId(supabase, user.id);

  const eligibility = await getMessagingEligibility({
    leadId,
    organizationId,
    channel,
  });

  return NextResponse.json(
    { ok: true, eligibility },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
