import 'server-only';

import { createClient } from '@/lib/supabase/server';

export type WhatsAppSenderReadiness = {
  connected: boolean;
  accountId: string | null;
  displayPhoneNumber: string | null;
  activeAccountCount: number;
  activeDefaultCount: number;
  boundActiveAccountCount: number;
  unboundActiveAccountCount: number;
  issueCode: string | null;
  issueMessage: string | null;
};

type RawReadiness = {
  connected?: unknown;
  account_id?: unknown;
  display_phone_number?: unknown;
  active_account_count?: unknown;
  active_default_count?: unknown;
  bound_active_account_count?: unknown;
  unbound_active_account_count?: unknown;
  issue_code?: unknown;
  issue_message?: unknown;
};

function stringOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberOrZero(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function parseReadiness(value: unknown): WhatsAppSenderReadiness {
  const row = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as RawReadiness)
    : {};

  return {
    connected: row.connected === true,
    accountId: stringOrNull(row.account_id),
    displayPhoneNumber: stringOrNull(row.display_phone_number),
    activeAccountCount: numberOrZero(row.active_account_count),
    activeDefaultCount: numberOrZero(row.active_default_count),
    boundActiveAccountCount: numberOrZero(row.bound_active_account_count),
    unboundActiveAccountCount: numberOrZero(row.unbound_active_account_count),
    issueCode: stringOrNull(row.issue_code),
    issueMessage: stringOrNull(row.issue_message),
  };
}

export async function getWhatsAppSenderReadiness(
  organizationId: string,
): Promise<WhatsAppSenderReadiness> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_whatsapp_sender_readiness_v1', {
    p_organization_id: organizationId,
  });

  if (error) {
    throw new Error(`Unable to verify WhatsApp sender readiness: ${error.message}`);
  }

  return parseReadiness(data);
}
