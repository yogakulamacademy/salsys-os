import 'server-only';
import { requirePlatformAdminAccess } from '@/lib/platform-admin-access';
import { createAdminClient } from '@/lib/supabase/admin';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validOrganizationId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

const providers = ['google','meta','instagram','whatsapp'] as const;
const statuses = ['pending','connected','expired','error','revoked','disconnected'] as const;

export function catalogLimits(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const limits = value as Record<string,unknown>;
  const users = limits.named_users, leads = limits.lead_records;
  if (typeof users !== 'number' || !Number.isSafeInteger(users) || users < 1 ||
      typeof leads !== 'number' || !Number.isSafeInteger(leads) || leads < 1) return null;
  return { namedUsers:users, leadRecords:leads };
}

export async function loadPlatformOrganizationProfile(id: string) {
  if (process.env.SALSYS_PLATFORM_ADMIN_ENABLED !== 'true') throw Error('Platform administration unavailable.');
  const { activeWorkspace } = await requirePlatformAdminAccess();
  if (!validOrganizationId(id)) return null;
  const admin = createAdminClient();
  const organization = await admin.from('organizations').select('id,name,slug,status,created_at').eq('id',id).maybeSingle();
  if (organization.error) throw Error('Organization profile unavailable.');
  if (!organization.data) return null;
  if (organization.data.id !== id) throw Error('Organization profile unavailable.');
  const internal = id === activeWorkspace.organizationId;
  const [onboarding, members, workspaces, subscription, events, leads, integrations] = await Promise.all([
    admin.from('organization_onboarding').select('status,current_step,enforce_on_sign_in,completed_at').eq('organization_id',id).maybeSingle(),
    admin.from('organization_members').select('id',{count:'exact',head:true}).eq('organization_id',id).eq('active',true),
    admin.from('organization_workspaces').select('workspace_code',{count:'exact'}).eq('organization_id',id).eq('enabled',true).order('workspace_code').limit(100),
    admin.from('saas_organization_subscriptions').select('id,plan_id,status,source,trial_ends_at,current_period_ends_at,canceled_at').eq('organization_id',id).maybeSingle(),
    admin.from('saas_subscription_events').select('event_type,previous_status,new_status,source,occurred_at').eq('organization_id',id).order('occurred_at',{ascending:false}).order('id',{ascending:false}).limit(20),
    admin.from('leads').select('id',{count:'exact',head:true}).eq('organization_id',id),
    admin.from('integration_connections').select('provider,status',{count:'exact'}).eq('organization_id',id).in('provider',[...providers]).order('provider').order('status').limit(100),
  ]);
  let plan: {code:string;display_name:string;version:number;limits:ReturnType<typeof catalogLimits>}|null = null;
  if (!subscription.error && subscription.data) {
    const result = await admin.from('saas_plans').select('code,display_name,version,limits').eq('id',subscription.data.plan_id).maybeSingle();
    if (!result.error && result.data) plan = {code:result.data.code,display_name:result.data.display_name,version:result.data.version,limits:catalogLimits(result.data.limits)};
  }
  const integrationInventory = !integrations.error && Array.isArray(integrations.data) &&
    integrations.count===integrations.data.length && integrations.data.length<=100 &&
    integrations.data.every(row=>providers.includes(row.provider)&&statuses.includes(row.status))
    ? providers.map(provider=>({provider,states:integrations.data!.filter(row=>row.provider===provider).map(row=>row.status)})) : null;
  return {
    leadRecords: !leads.error && typeof leads.count==='number' && Number.isSafeInteger(leads.count) && leads.count>=0 ? leads.count : null,
    integrationInventory,
    organization: organization.data,
    internal,
    onboarding: onboarding.error ? {available:false as const} : {available:true as const,record:onboarding.data},
    activeMemberships: !members.error && typeof members.count==='number' && Number.isSafeInteger(members.count) && members.count>=0 ? members.count : null,
    configuredWorkspaces: !workspaces.error && Array.isArray(workspaces.data) && workspaces.count===workspaces.data.length ? workspaces.data.map(row=>row.workspace_code) : null,
    subscription: subscription.error ? {available:false as const} : {available:true as const,record:subscription.data,plan},
    events: !events.error && Array.isArray(events.data) && events.data.length<=20 ? events.data : null,
  };
}
