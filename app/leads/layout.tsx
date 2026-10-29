import type { ReactNode } from 'react';

import { CrmWorkspaceFrame } from '@/components/crm/crm-workspace-frame';
import { TeamAssignmentPanel } from '@/components/team-assignment-panel';

export default function LeadsLayout({ children }: { children: ReactNode }) {
  return (
    <CrmWorkspaceFrame>
      <div className="mb-4">
        <TeamAssignmentPanel returnTo="/leads" />
      </div>
      {children}
    </CrmWorkspaceFrame>
  );
}
