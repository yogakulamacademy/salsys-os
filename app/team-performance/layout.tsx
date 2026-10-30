import type { ReactNode } from 'react';

import { CrmWorkspaceFrame } from '@/components/crm/crm-workspace-frame';

import './team-performance-ph4d.css';

export default function TeamPerformanceLayout({ children }: { children: ReactNode }) {
  return (
    <CrmWorkspaceFrame>
      <div className="team-performance-scope">{children}</div>
    </CrmWorkspaceFrame>
  );
}
