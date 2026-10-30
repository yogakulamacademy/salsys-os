import type { ReactNode } from 'react';

import { AutomationNavigation } from '@/components/automation/automation-navigation';
import { requirePrivilegedWorkspaceAccess } from '@/lib/route-access';
import styles from './automation-studio.module.css';

export default async function AutomationLayout({ children }: { children: ReactNode }) {
  const workspace = await requirePrivilegedWorkspaceAccess();
  const canManageAutomation = ['owner', 'admin'].includes(workspace.role);

  return (
    <div
      className={`${styles.studio} grid gap-6 lg:grid-cols-[232px_minmax(0,1fr)] xl:grid-cols-[252px_minmax(0,1fr)] xl:gap-7`}
    >
      <AutomationNavigation />
      <main className="min-w-0 pb-10">
        {!canManageAutomation ? (
          <div
            className="mb-5 rounded-xl border px-4 py-3 text-sm leading-6"
            style={{
              borderColor: 'var(--app-border)',
              background: 'var(--app-surface-soft)',
              color: 'var(--app-text-muted)',
            }}
            role="status"
          >
            <strong style={{ color: 'var(--app-text-strong)' }}>Read-only automation access.</strong>{' '}
            Managers can review workflows, runs, approvals, and readiness. Creating, publishing,
            archiving, or changing automation requires an Owner or Admin.
          </div>
        ) : null}
        {children}
      </main>
    </div>
  );
}
