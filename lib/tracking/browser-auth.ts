import type { SupabaseClient } from '@supabase/supabase-js';

export type BrowserTrackingCredential = {
  credentialId: string;
  connectionId: string;
  organizationId: string;
  publicKey: string;
  hostname: string;
  environment: 'live' | 'test';
  scopes: string[];
};

type CredentialRow = {
  id: string;
  connection_id: string;
  organization_id: string;
  public_key: string;
  credential_kind: string;
  environment: string;
  scopes: string[] | null;
  allowed_hosts: string[] | null;
  status: string;
  expires_at: string | null;
};

type ConnectionRow = {
  id: string;
  organization_id: string;
  provider: string;
  auth_mode: string;
  status: string;
};

export function trackingOriginHostname(origin: string | null) {
  if (!origin) return null;

  try {
    const url = new URL(origin);

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return null;
    }

    return url.hostname.trim().toLowerCase().replace(/\.$/, '') || null;
  } catch {
    return null;
  }
}

export async function resolveBrowserTrackingCredential({
  supabase,
  publicKey,
  origin,
  requiredScope = 'events:write',
}: {
  supabase: SupabaseClient;
  publicKey: string;
  origin: string | null;
  requiredScope?: string;
}): Promise<BrowserTrackingCredential | null> {
  const key = publicKey.trim();
  const hostname = trackingOriginHostname(origin);

  if (!hostname || !/^pk_(live|test)_[A-Za-z0-9_-]+$/.test(key)) {
    return null;
  }

  const {
    data: rawCredential,
    error: credentialError,
  } = await supabase
    .from('integration_api_credentials')
    .select(
      'id, connection_id, organization_id, public_key, credential_kind, environment, scopes, allowed_hosts, status, expires_at',
    )
    .eq('public_key', key)
    .maybeSingle();

  if (credentialError || !rawCredential) {
    return null;
  }

  const credential = rawCredential as unknown as CredentialRow;
  const scopes = Array.isArray(credential.scopes) ? credential.scopes : [];
  const allowedHosts = Array.isArray(credential.allowed_hosts)
    ? credential.allowed_hosts.map((host) => host.trim().toLowerCase())
    : [];

  if (
    credential.status !== 'active' ||
    credential.credential_kind !== 'website' ||
    !scopes.includes(requiredScope) ||
    !allowedHosts.includes(hostname) ||
    (credential.expires_at && new Date(credential.expires_at).getTime() <= Date.now())
  ) {
    return null;
  }

  const {
    data: rawConnection,
    error: connectionError,
  } = await supabase
    .from('integration_connections')
    .select('id, organization_id, provider, auth_mode, status')
    .eq('id', credential.connection_id)
    .eq('organization_id', credential.organization_id)
    .maybeSingle();

  if (connectionError || !rawConnection) {
    return null;
  }

  const connection = rawConnection as unknown as ConnectionRow;

  if (
    connection.status !== 'connected' ||
    connection.provider !== 'salsys' ||
    connection.auth_mode !== 'api_key'
  ) {
    return null;
  }

  const {
    data: organizationSite,
    error: siteError,
  } = await supabase
    .from('organization_sites')
    .select('organization_id, hostname')
    .eq('organization_id', credential.organization_id)
    .eq('hostname', hostname)
    .eq('status', 'active')
    .maybeSingle();

  if (siteError || !organizationSite) {
    return null;
  }

  // Usage bookkeeping must never make a valid browser event fail.
  void supabase
    .from('integration_api_credentials')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', credential.id)
    .eq('organization_id', credential.organization_id);

  return {
    credentialId: credential.id,
    connectionId: credential.connection_id,
    organizationId: credential.organization_id,
    publicKey: credential.public_key,
    hostname,
    environment: credential.environment === 'test' ? 'test' : 'live',
    scopes,
  };
}
