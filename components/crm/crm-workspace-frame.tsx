import type { ReactNode } from 'react';

import { CrmLeadInspectorBridge } from '@/components/crm/crm-lead-inspector-bridge';
import { CrmNavigation } from '@/components/crm/crm-navigation';
import styles from '@/components/crm/crm-studio.module.css';
import { LiveRefresh } from '@/components/live-refresh';
import { useMockData } from '@/lib/config';

export function CrmWorkspaceFrame({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${styles.studio} grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[238px_minmax(0,1fr)] xl:gap-6`}
    >
      <LiveRefresh enabled={!useMockData} />
      <CrmNavigation />
      <CrmLeadInspectorBridge>
        <main className="min-w-0 pb-8">{children}</main>
      </CrmLeadInspectorBridge>
    </div>
  );
}
