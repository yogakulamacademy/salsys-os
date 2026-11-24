import 'server-only';
import { requirePlatformAdminAccess } from '@/lib/platform-admin-access';
import { createAdminClient } from '@/lib/supabase/admin';

type HealthSummary = { total: number; healthy: number; warning: number; critical: number; checkedAt: string };
function count(value: unknown): number {
  const number = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < 0) throw Error('Invalid monitoring count.');
  return number;
}

export async function loadPlatformHealth() {
  if (process.env.SALSYS_PLATFORM_ADMIN_ENABLED !== 'true') throw Error('Platform overview unavailable.');
  const { activeWorkspace } = await requirePlatformAdminAccess();
  const flags = {
    publicSignupSwitch: process.env.SALSYS_PUBLIC_SIGNUP_ENABLED === 'true',
    admissionMode: ['closed','pilot','public'].includes(process.env.SALSYS_SIGNUP_ADMISSION_MODE ?? '') ? process.env.SALSYS_SIGNUP_ADMISSION_MODE : 'unknown',
    commercialAccess: process.env.SALSYS_COMMERCIAL_ACCESS_ENABLED === 'true',
    trialReconciliation: process.env.SALSYS_TRIAL_RECONCILIATION_ENABLED === 'true',
    manualReconciliation: process.env.SALSYS_MANUAL_RECONCILIATION_ENABLED === 'true',
    manualActivation: process.env.SALSYS_MANUAL_ACTIVATION_ENABLED === 'true',
    cronSecretConfigured: Boolean(process.env.CRON_SECRET?.trim()),
  };
  let health: HealthSummary | null = null;
  try {
    const { data, error } = await createAdminClient().from('v_system_health_summary')
      .select('total_systems,healthy_systems,warning_systems,critical_systems,checked_at')
      .eq('organization_id',activeWorkspace.organizationId).maybeSingle();
    if (error || !data || typeof data.checked_at !== 'string' || !Number.isFinite(Date.parse(data.checked_at))) throw Error('Monitoring unavailable.');
    const total = count(data.total_systems), healthy = count(data.healthy_systems), warning = count(data.warning_systems), critical = count(data.critical_systems);
    if (healthy + warning + critical !== total) throw Error('Inconsistent monitoring counts.');
    health = {total,healthy,warning,critical,checkedAt:new Date(data.checked_at).toISOString()};
  } catch { /* No fabricated healthy or zero results. */ }
  return { flags, health };
}
