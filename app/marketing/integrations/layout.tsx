import type { ReactNode } from 'react';

import { ExecutiveDecisionBrief } from '@/components/marketing/executive-decision-brief';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceContextForUser } from '@/lib/workspace';

const EXPECTED_PROVIDERS = ['google', 'meta', 'instagram', 'whatsapp'] as const;

type ConnectionRow = {
  provider: string;
  status: string;
  updated_at: string | null;
};

export default async function MarketingIntegrationsLayout({ children }: { children: ReactNode }) {
  const summary = await getIntegrationHealth();

  return (
    <div className="space-y-4">
      <ExecutiveDecisionBrief
        eyebrow="Integration health brief"
        title={summary.title}
        summary={summary.summary}
        confidenceLabel={summary.confidenceLabel}
        confidenceDetail="Integration health describes connection state visible to SalsysOS. It does not claim that every downstream API, historical sync or event stream is complete unless supporting evidence is available."
        signals={summary.signals}
        actions={summary.actions}
      />
      {children}
    </div>
  );
}

async function getIntegrationHealth() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return unavailable('Integration health is unavailable until a workspace user is resolved.');

    const workspace = await getWorkspaceContextForUser(supabase, user.id);
    if (!workspace.activeWorkspace) return unavailable('No active workspace is available for integration health.');

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('integration_connections')
      .select('provider,status,updated_at')
      .eq('organization_id', workspace.activeWorkspace.organizationId)
      .order('updated_at', { ascending: false });

    if (error) return unavailable(`Integration status could not be read: ${error.message}`);

    const rows = (data ?? []) as ConnectionRow[];
    const latestByProvider = new Map<string, ConnectionRow>();
    for (const row of rows) if (!latestByProvider.has(row.provider)) latestByProvider.set(row.provider, row);

    const states = EXPECTED_PROVIDERS.map((provider) => ({
      provider,
      connection: latestByProvider.get(provider) ?? null,
    }));
    const connected = states.filter((item) => item.connection?.status === 'connected').length;
    const attention = states.filter((item) => item.connection && ['error', 'expired', 'revoked'].includes(item.connection.status)).length;
    const missing = states.filter((item) => !item.connection || ['disconnected', 'revoked'].includes(item.connection.status)).length;
    const coverage = (connected / EXPECTED_PROVIDERS.length) * 100;
    const priority = states.find((item) => item.connection && ['error', 'expired'].includes(item.connection.status))
      ?? states.find((item) => !item.connection || ['disconnected', 'revoked'].includes(item.connection?.status ?? ''))
      ?? null;

    const title = attention > 0
      ? `${attention} marketing integration${attention === 1 ? '' : 's'} need attention.`
      : connected === EXPECTED_PROVIDERS.length
        ? 'Core marketing integrations are connected.'
        : `${connected} of ${EXPECTED_PROVIDERS.length} core marketing integrations are connected.`;

    const summary = priority
      ? `${label(priority.provider)} is the next connection to review. Any downstream screen that depends on this provider should present missing evidence as partial or unknown until the connection is healthy.`
      : 'The core provider connection layer is available. Continue to validate asset selection, sync freshness and tracking coverage before making budget decisions.';

    return {
      title,
      summary,
      confidenceLabel: `${coverage.toFixed(0)}% connected`,
      signals: states.map((item) => ({
        label: label(item.provider),
        value: stateLabel(item.connection?.status),
        detail: item.connection?.updated_at ? `Last connection update ${formatWhen(item.connection.updated_at)}.` : 'No connection record is visible.',
        tone: item.connection?.status === 'connected' ? 'positive' as const : ['error', 'expired'].includes(item.connection?.status ?? '') ? 'risk' as const : 'watch' as const,
      })),
      actions: priority ? [{ label: `Review ${label(priority.provider)}`, href: `/settings/integrations${priority.provider === 'whatsapp' ? '/whatsapp' : ''}` }] : [],
    };
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : 'Integration health is unavailable.');
  }
}

function unavailable(detail: string) {
  return {
    title: 'Integration health is currently unknown.',
    summary: 'SalsysOS is not treating unavailable integration evidence as disconnected. Open the integration controls to inspect the underlying provider state.',
    confidenceLabel: 'Evidence unavailable',
    signals: [
      { label: 'Google', value: 'Unknown', detail, tone: 'watch' as const },
      { label: 'Meta', value: 'Unknown', detail, tone: 'watch' as const },
      { label: 'Instagram', value: 'Unknown', detail, tone: 'watch' as const },
      { label: 'WhatsApp', value: 'Unknown', detail, tone: 'watch' as const },
    ],
    actions: [{ label: 'Open integration controls', href: '/settings/integrations' }],
  };
}

function label(provider: string) {
  if (provider === 'google') return 'Google';
  if (provider === 'meta') return 'Meta';
  if (provider === 'instagram') return 'Instagram';
  if (provider === 'whatsapp') return 'WhatsApp';
  return provider;
}

function stateLabel(status: string | null | undefined) {
  if (!status) return 'Not configured';
  return status.replaceAll('_', ' ').replace(/\b\w/g, (value) => value.toUpperCase());
}

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(date);
}
