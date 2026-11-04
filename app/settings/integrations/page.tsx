import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceContextForUser } from '@/lib/workspace';
import type { IntegrationAsset } from '@/lib/integrations/types';
import { IntegrationsDashboard, type SafeIntegrationConnection } from './integrations-dashboard';
import './integrations-ui.css';

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string; organization_id?: string }>;
}) {
  const query = await searchParams;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect('/login');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, active')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError || !profile || profile.active !== true) redirect('/dashboard');

  const workspaceContext = await getWorkspaceContextForUser(supabase, user.id);
  const activeWorkspace = workspaceContext.activeWorkspace;
  if (!activeWorkspace || !['owner', 'admin'].includes(activeWorkspace.role)) {
    redirect('/dashboard');
  }
  const organizationId = activeWorkspace.organizationId;
  const admin = createAdminClient();

  const { data: organization, error: organizationError } = await admin
    .from('organizations')
    .select('id, name, status')
    .eq('id', organizationId)
    .eq('status', 'active')
    .maybeSingle();
  if (organizationError || !organization) redirect('/dashboard');

  // Secret-minimized connection inventory. Tokens and provider metadata never
  // reach the UI component. All reads are tenant-bound before rendering.
  const [connectionsResult, assetsResult] = await Promise.all([
    admin.from('integration_connections')
      .select('id, provider, status, account_name, account_email, last_verified_at, last_error, connected_at, updated_at, scopes')
      .eq('organization_id', organizationId)
      .order('updated_at', { ascending: false }),
    admin.from('integration_assets')
      .select('id, connection_id, asset_type, external_id, name, status, is_selected, metadata, discovered_at, updated_at')
      .eq('organization_id', organizationId)
      .order('asset_type', { ascending: true }),
  ]);

  const foundationMissing =
    connectionsResult.error?.code === '42P01' ||
    assetsResult.error?.code === '42P01';
  const loadError = foundationMissing
    ? null
    : connectionsResult.error?.message ?? assetsResult.error?.message ?? null;
  const usable = !foundationMissing && !loadError;
  const connections = usable ? (connectionsResult.data ?? []) as unknown as SafeIntegrationConnection[] : [];
  const assets = usable ? (assetsResult.data ?? []) as unknown as IntegrationAsset[] : [];

  return <IntegrationsDashboard
    connections={connections} assets={assets}
    installed={!foundationMissing} error={loadError}
    encryptionConfigured={Boolean(process.env.INTEGRATION_ENCRYPTION_KEY)}
    notice={query.notice} actionError={query.error}
  />;
}
