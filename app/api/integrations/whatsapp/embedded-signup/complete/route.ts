import { revalidatePath } from 'next/cache';
import {
  NextRequest,
  NextResponse,
} from 'next/server';

import { hashOAuthState } from '@/lib/integrations/crypto';
import { completeWhatsAppEmbeddedSignup } from '@/lib/integrations/whatsapp-embedded-signup';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type OAuthStateRow = {
  id: string;
  created_by: string;
  organization_id: string;
  expires_at: string;
  used_at: string | null;
};

type CompletePayload = {
  intent?: unknown;
  code?: unknown;
  waba_id?: unknown;
  phone_number_id?: unknown;
};

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { ok: false, error: message },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
      },
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
    return jsonError('Sign in to connect WhatsApp.', 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, active')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile || profile.active !== true) {
    return jsonError('Your CRM account is not active.', 403);
  }

  let payload: CompletePayload;

  try {
    payload = (await request.json()) as CompletePayload;
  } catch {
    return jsonError('Invalid WhatsApp authorization payload.', 400);
  }

  const intent = text(payload.intent);
  const code = text(payload.code);
  const wabaId = text(payload.waba_id);
  const phoneNumberId = text(payload.phone_number_id) || null;

  if (!intent || !code || !/^\d+$/.test(wabaId)) {
    return jsonError(
      'WhatsApp Embedded Signup did not return the required authorization details.',
      400,
    );
  }

  if (phoneNumberId && !/^\d+$/.test(phoneNumberId)) {
    return jsonError('Meta returned an invalid Phone Number ID.', 400);
  }

  const admin = createAdminClient();
  const intentHash = hashOAuthState(intent);

  const { data: rawState, error: stateError } = await admin
    .from('integration_oauth_states')
    .select(
      'id, created_by, organization_id, expires_at, used_at',
    )
    .eq('provider', 'whatsapp')
    .eq('state_hash', intentHash)
    .maybeSingle();

  const state = rawState as unknown as OAuthStateRow | null;

  if (
    stateError ||
    !state ||
    !state.organization_id ||
    state.created_by !== user.id ||
    state.used_at ||
    new Date(state.expires_at).getTime() <= Date.now()
  ) {
    return jsonError(
      'WhatsApp authorization session is invalid or expired. Please connect again.',
      400,
    );
  }

  const [membershipResult, organizationResult] = await Promise.all([
    admin
      .from('organization_members')
      .select('id, role, active')
      .eq('organization_id', state.organization_id)
      .eq('user_id', user.id)
      .eq('active', true)
      .in('role', ['owner', 'admin'])
      .maybeSingle(),

    admin
      .from('organizations')
      .select('id, status')
      .eq('id', state.organization_id)
      .maybeSingle(),
  ]);

  if (
    membershipResult.error ||
    !membershipResult.data ||
    organizationResult.error ||
    !organizationResult.data ||
    organizationResult.data.status !== 'active'
  ) {
    return jsonError(
      'You no longer have permission to manage integrations for this workspace.',
      403,
    );
  }

  const { data: consumedRows, error: consumeError } = await admin
    .from('integration_oauth_states')
    .update({
      used_at: new Date().toISOString(),
    })
    .eq('id', state.id)
    .is('used_at', null)
    .select('id');

  if (
    consumeError ||
    !consumedRows ||
    consumedRows.length !== 1
  ) {
    return jsonError(
      'WhatsApp authorization session has already been used. Please connect again.',
      400,
    );
  }

  try {
    const result = await completeWhatsAppEmbeddedSignup({
      organizationId: state.organization_id,
      actorUserId: user.id,
      code,
      wabaId,
      phoneNumberId,
    });

    revalidatePath('/settings/integrations');

    return NextResponse.json(
      {
        ok: true,
        message: result.displayPhoneNumber
          ? `WhatsApp ${result.displayPhoneNumber} connected successfully.`
          : 'WhatsApp Business connected successfully.',
        connectionId: result.connectionId,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'WhatsApp authorization failed.';

    await admin.from('integration_audit_log').insert({
      organization_id: state.organization_id,
      provider: 'whatsapp',
      event_type: 'authorization_error',
      actor_user_id: user.id,
      detail: {
        message: message.slice(0, 500),
        auth_mode: 'embedded_signup',
      },
    });

    return jsonError(message, 400);
  }
}
