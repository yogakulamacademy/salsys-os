import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

import { CrmWorkspaceFrame } from '@/components/crm/crm-workspace-frame';
import { requirePrivilegedWorkspaceAccess } from '@/lib/route-access';
import { createClient } from '@/lib/supabase/server';

type AutomationHealthRow = {
  last_run_status: string | null;
  last_completed_at: string | null;
  runs_24h: number | string | null;
  failures_24h: number | string | null;
  last_error_message: string | null;
};

export default async function AdmissionsLayout({ children }: { children: ReactNode }) {
  const workspace = await requirePrivilegedWorkspaceAccess();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('v_admissions_automation_health')
    .select('last_run_status,last_completed_at,runs_24h,failures_24h,last_error_message')
    .eq('organization_id', workspace.organizationId)
    .maybeSingle();

  const health = error ? null : (data as AutomationHealthRow | null);
  const failures24h = toNumber(health?.failures_24h);
  const healthy =
    Boolean(health) &&
    health?.last_run_status === 'success' &&
    failures24h === 0;

  return (
    <CrmWorkspaceFrame>
      <div className="space-y-4">
        {healthy ? (
          <section className="flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm dark:border-emerald-900/60 dark:bg-emerald-950/20 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200">
              <CheckCircle2 size={16} />
              <strong>Admissions automation healthy</strong>
            </div>
            <div className="text-xs text-emerald-700 dark:text-emerald-300">
              {formatNumber(health?.runs_24h)} runs · 0 failures in 24h
              {health?.last_completed_at ? ` · Last completed ${formatDateTime(health.last_completed_at)}` : ''}
            </div>
          </section>
        ) : (
          <section className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div>
              <strong>Admissions automation requires review</strong>
              <div className="mt-0.5 text-xs leading-5 text-amber-800 dark:text-amber-200">
                {error
                  ? 'Canonical automation health could not be read. No healthy state is inferred while the health source is unavailable.'
                  : health
                    ? `${formatNumber(health.runs_24h)} runs · ${formatNumber(health.failures_24h)} failures in 24h${health.last_error_message ? ` · ${health.last_error_message}` : ''}`
                    : 'No canonical Admissions automation-health record is available.'}
              </div>
            </div>
          </section>
        )}
        {children}
      </div>
    </CrmWorkspaceFrame>
  );
}

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: number | string | null | undefined) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(
    toNumber(value),
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(date);
}
