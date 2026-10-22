import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceContextForUser } from '@/lib/workspace';

export type TrackingPlatformSource = {
  id: string;
  name: string;
  sourceType: string;
  sourceSystem: string;
  sourceKey: string | null;
  authMode: string | null;
  platform: string | null;
  hostname: string | null;
  publicSiteId: string | null;
  siteEnvironment: string | null;
  status: string;
  healthStatus: 'healthy' | 'idle' | 'not_live' | 'degraded' | 'misconfigured' | 'inactive';
  allowedEventPrefixes: string[];
  privacyNoticeVersion: string | null;
  sdkName: string | null;
  sdkVersion: string | null;
  sdkIntegration: string | null;
  events24h: number;
  events7d: number;
  visitors7d: number;
  sessions7d: number;
  privacyReceipts7d: number;
  acceptedEventCount: number;
  duplicateEventCount: number;
  rejectedEventCount: number;
  lastSeenAt: string | null;
};

export type TrackingPlatformWorkspace = {
  organizationId: string | null;
  organizationName: string | null;
  sources: TrackingPlatformSource[];
  warning: string | null;
};

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function textValue(value: unknown) {
  return value == null || String(value).trim() === '' ? null : String(value);
}

function listValue(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function recentHealth(
  row: Record<string, unknown>,
): 'healthy' | 'idle' | 'not_live' | 'degraded' | 'inactive' {
  if (String(row.status ?? '') !== 'active') return 'inactive';
  const accepted = numberValue(row.accepted_event_count);
  const rejected = numberValue(row.rejected_event_count);
  if (rejected > 0 && accepted === 0) return 'degraded';
  if (accepted === 0) return 'not_live';
  const lastSeen = textValue(row.last_seen_at);
  if (!lastSeen) return 'not_live';
  const age = Date.now() - new Date(lastSeen).getTime();
  return Number.isFinite(age) && age <= 24 * 60 * 60 * 1000 ? 'healthy' : 'idle';
}

function websiteHealth(row: Record<string, unknown>): TrackingPlatformSource['healthStatus'] {
  if (String(row.status ?? '') !== 'active') return 'inactive';
  if (
    String(row.auth_mode ?? '') !== 'origin' ||
    String(row.privacy_mode ?? '') !== 'strict' ||
    row.require_consent_for_optional !== true ||
    !textValue(row.privacy_notice_version)
  ) {
    return 'misconfigured';
  }
  return recentHealth(row);
}

function serverHealth(row: Record<string, unknown>): TrackingPlatformSource['healthStatus'] {
  if (String(row.status ?? '') !== 'active') return 'inactive';
  if (String(row.auth_mode ?? '') !== 'secret') return 'misconfigured';
  return recentHealth(row);
}

export async function getTrackingPlatformWorkspace(): Promise<TrackingPlatformWorkspace> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      organizationId: null,
      organizationName: null,
      sources: [],
      warning: 'Sign in to view tracking sources.',
    };
  }

  const context = await getWorkspaceContextForUser(supabase, user.id);
  const workspace = context.activeWorkspace;

  if (!workspace) {
    return {
      organizationId: null,
      organizationName: null,
      sources: [],
      warning: 'No active workspace is available.',
    };
  }

  const admin = createAdminClient();
  const [sourceResult, clientHealthResult] = await Promise.all([
    admin
      .from('tracking_sources')
      .select(
        'id,name,source_type,source_system,source_key,auth_mode,hostname,status,allowed_event_prefixes,accepted_event_count,duplicate_event_count,rejected_event_count,last_seen_at,privacy_mode,require_consent_for_optional,privacy_notice_version,metadata',
      )
      .eq('organization_id', workspace.organizationId)
      .in('source_type', ['website', 'client', 'api', 'webhook', 'system'])
      .order('created_at', { ascending: true }),
    admin
      .from('v_tracking_client_source_health_v1')
      .select('*')
      .eq('organization_id', workspace.organizationId),
  ]);

  if (sourceResult.error) {
    return {
      organizationId: workspace.organizationId,
      organizationName: workspace.organizationName,
      sources: [],
      warning: `Unable to load tracking sources: ${sourceResult.error.message}`,
    };
  }

  const clientHealth = new Map<string, Record<string, unknown>>();
  if (!clientHealthResult.error) {
    for (const row of clientHealthResult.data ?? []) {
      const item = row as Record<string, unknown>;
      clientHealth.set(String(item.tracking_source_id), item);
    }
  }

  const sources: TrackingPlatformSource[] = (sourceResult.data ?? []).map((rawRow) => {
    const row = rawRow as Record<string, unknown>;
    const id = String(row.id);
    const metadata =
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    const sourceType = String(row.source_type ?? '');
    const isClient = sourceType === 'client';
    const isWebsite = sourceType === 'website';
    const health = clientHealth.get(id);

    return {
      id,
      name: String(row.name ?? 'Tracking source'),
      sourceType,
      sourceSystem: String(row.source_system ?? ''),
      sourceKey: textValue(row.source_key),
      authMode: textValue(row.auth_mode),
      platform: textValue(metadata.platform),
      hostname: textValue(row.hostname),
      publicSiteId: textValue(metadata.public_site_id),
      siteEnvironment: textValue(metadata.environment),
      status: String(row.status ?? ''),
      healthStatus: isClient
        ? ((textValue(health?.health_status) ?? 'not_live') as TrackingPlatformSource['healthStatus'])
        : isWebsite
          ? websiteHealth(row)
          : serverHealth(row),
      allowedEventPrefixes: listValue(row.allowed_event_prefixes),
      privacyNoticeVersion: textValue(row.privacy_notice_version),
      sdkName: textValue(health?.latest_sdk_name),
      sdkVersion: textValue(health?.latest_sdk_version),
      sdkIntegration: textValue(health?.latest_sdk_integration),
      events24h: numberValue(health?.events_24h),
      events7d: numberValue(health?.events_7d),
      visitors7d: numberValue(health?.visitors_7d),
      sessions7d: numberValue(health?.sessions_7d),
      privacyReceipts7d: numberValue(health?.privacy_receipts_7d),
      acceptedEventCount: numberValue(row.accepted_event_count),
      duplicateEventCount: numberValue(row.duplicate_event_count),
      rejectedEventCount: numberValue(row.rejected_event_count),
      lastSeenAt: textValue(row.last_seen_at),
    };
  });

  return {
    organizationId: workspace.organizationId,
    organizationName: workspace.organizationName,
    sources,
    warning: clientHealthResult.error
      ? `Client-source health is temporarily unavailable: ${clientHealthResult.error.message}`
      : null,
  };
}
