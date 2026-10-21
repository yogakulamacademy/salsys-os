import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

import {
  IntegrationTenantError,
  requireIntegrationAdminTenant,
} from '@/lib/integrations/tenant-context';
import { removeWhatsAppForOrganization } from '@/lib/integrations/whatsapp-remove';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type RemovePayload = {
  connection_id?: unknown;
};

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { ok: false, error: message },
    {
      status,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}

function sameOrigin(request: NextRequest) {
  return request.headers.get('origin') === request.nextUrl.origin;
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return jsonError('Invalid request origin.', 403);
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return jsonError('Sign in to manage WhatsApp.', 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, active')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile || profile.active !== true) {
    return jsonError('Your CRM account is not active.', 403);
  }

  let organizationId: string;

  try {
    const tenant = await requireIntegrationAdminTenant(supabase, user.id);
    organizationId = tenant.organizationId;
  } catch (error) {
    const message =
      error instanceof IntegrationTenantError
        ? error.message
        : 'Unable to verify the active workspace.';
    return jsonError(message, 403);
  }

  let payload: RemovePayload;

  try {
    payload = (await request.json()) as RemovePayload;
  } catch {
    return jsonError('Invalid WhatsApp removal payload.', 400);
  }

  const connectionId = text(payload.connection_id);
  if (!connectionId) {
    return jsonError('WhatsApp connection is missing.', 400);
  }

  try {
    const result = await removeWhatsAppForOrganization({
      organizationId,
      actorUserId: user.id,
      connectionId,
    });

    revalidatePath('/settings/integrations');
    revalidatePath('/settings/integrations/whatsapp');
    revalidatePath('/conversations');

    return NextResponse.json(
      {
        ok: true,
        message: result.providerWarning
          ? `WhatsApp was removed from SalsysOS. ${result.providerWarning}`
          : 'WhatsApp was removed from SalsysOS. You can now connect another number.',
        provider_unsubscribed: result.providerUnsubscribed,
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : 'Unable to remove WhatsApp.',
      400,
    );
  }
}
