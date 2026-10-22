import type { ReactNode } from 'react';

import { CrmLeadInspectorBridge } from '@/components/crm/crm-lead-inspector-bridge';
import { CrmNavigation } from '@/components/crm/crm-navigation';
import styles from '@/components/crm/crm-studio.module.css';

export function CrmWorkspaceFrame({ children }: { children: ReactNode }) {
  return (
    <div className={`${styles.studio} grid gap-5 min-[881px]:grid-cols-[220px_minmax(0,1fr)] min-[1280px]:grid-cols-[236px_minmax(0,1fr)] min-[1280px]:gap-6`}>
      <CrmNavigation />
      <CrmLeadInspectorBridge>
        <div className="min-w-0 pb-8">{children}</div>
      </CrmLeadInspectorBridge>
    </div>
  );
}
