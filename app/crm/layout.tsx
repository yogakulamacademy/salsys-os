import type { ReactNode } from 'react';

import { CrmWorkspaceFrame } from '@/components/crm/crm-workspace-frame';
import { requirePrivilegedWorkspaceAccess } from '@/lib/route-access';

import './crm-command-center-polish.css';

export default async function CrmLayout({ children }: { children: ReactNode }) {
  await requirePrivilegedWorkspaceAccess();
  return (
    <CrmWorkspaceFrame>
      <div className="crm-command-center-polish">{children}</div>
    </CrmWorkspaceFrame>
  );
}
