import 'server-only';

import { createHash, randomBytes } from 'node:crypto';

import { createAdminClient } from '@/lib/supabase/admin';

export const PASSWORD_RECOVERY_GRANT_COOKIE = 'salsys_recovery_grant';
export const PASSWORD_RECOVERY_GRANT_MAX_AGE_SECONDS = 15 * 60;

function hashRecoveryToken(token: string) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export async function issuePasswordRecoveryGrant(
  userId: string,
  organizationId: string,
) {
  const admin = createAdminClient();
  const now = new Date();
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashRecoveryToken(token);
  const expiresAt = new Date(
    now.getTime() + PASSWORD_RECOVERY_GRANT_MAX_AGE_SECONDS * 1000,
  ).toISOString();

  const { error: invalidateError } = await admin
    .from('password_recovery_grants')
    .update({ consumed_at: now.toISOString() })
    .eq('user_id', userId)
    .is('consumed_at', null);

  if (invalidateError) {
    throw new Error('Unable to invalidate previous password recovery grants.');
  }

  const { error: insertError } = await admin
    .from('password_recovery_grants')
    .insert({
      user_id: userId,
      organization_id: organizationId,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

  if (insertError) {
    throw new Error('Unable to create password recovery grant.');
  }

  return token;
}

export async function hasValidPasswordRecoveryGrant(
  token: string | undefined,
  userId: string,
  organizationId: string,
) {
  if (!token) return false;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('password_recovery_grants')
    .select('id,expires_at,consumed_at')
    .eq('token_hash', hashRecoveryToken(token))
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error || !data || data.consumed_at) return false;

  return new Date(data.expires_at).getTime() > Date.now();
}

export async function claimPasswordRecoveryGrant(
  token: string | undefined,
  userId: string,
  organizationId: string,
) {
  if (!token) return false;

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('password_recovery_grants')
    .update({ consumed_at: now })
    .eq('token_hash', hashRecoveryToken(token))
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .is('consumed_at', null)
    .gt('expires_at', now)
    .select('id');

  return !error && Array.isArray(data) && data.length === 1;
}
