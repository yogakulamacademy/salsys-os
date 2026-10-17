import { NextRequest, NextResponse } from 'next/server';

import { syncWhatsAppTemplatesForOrganization } from '@/lib/integrations/whatsapp-template-sync';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const PILOT_ORGANIZATION_ID = '566132f7-a762-474a-85e6-e31edbf6adfb';

export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV !== 'preview') {
    return NextResponse.json({ ok: false, error: 'Preview only.' }, { status: 404 });
  }

  if (!request.nextUrl.hostname.endsWith('.vercel.app')) {
    return NextResponse.json({ ok: false, error: 'Preview hostname required.' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: providerSetting, error: providerError } = await admin
    .from('automation_provider_send_settings')
    .select('provider_send_enabled')
    .eq('organization_id', PILOT_ORGANIZATION_ID)
    .eq('channel', 'whatsapp')
    .eq('provider', 'meta_cloud_api')
    .maybeSingle();

  if (providerError || !providerSetting || providerSetting.provider_send_enabled !== false) {
    return NextResponse.json(
      { ok: false, error: 'Provider-send kill switch must remain disabled.' },
      { status: 409 },
    );
  }

  const result = await syncWhatsAppTemplatesForOrganization(PILOT_ORGANIZATION_ID);

  return NextResponse.json(
    {
      ok: result.ok,
      syncRunId: result.syncRunId,
      pagesFetched: result.pagesFetched,
      templatesSeen: result.templatesSeen,
      templatesUpserted: result.templatesUpserted,
      templatesDeactivated: result.templatesDeactivated,
      error: result.error,
      customerMessageSent: false,
    },
    { status: result.ok ? 200 : 502, headers: { 'Cache-Control': 'no-store' } },
  );
}
