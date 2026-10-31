import type { ReactNode } from 'react';

import { CrmWorkspaceFrame } from '@/components/crm/crm-workspace-frame';
import { requireAdminWorkspaceAccess } from '@/lib/route-access';

import './team-performance-ph4d.css';

export default async function TeamPerformanceLayout({ children }: { children: ReactNode }) {
  await requireAdminWorkspaceAccess();

  return (
    <CrmWorkspaceFrame>
      <div className="team-performance-scope">{children}</div>
    </CrmWorkspaceFrame>
  );
}
