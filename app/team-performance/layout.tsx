import type { ReactNode } from 'react';

import { CrmWorkspaceFrame } from '@/components/crm/crm-workspace-frame';

export default function TeamPerformanceLayout({ children }: { children: ReactNode }) {
  return (
    <CrmWorkspaceFrame>
      <div className="team-performance-scope">{children}</div>
    </CrmWorkspaceFrame>
  );
}
