import type { ReactNode } from 'react';

import { CrmWorkspaceFrame } from '@/components/crm/crm-workspace-frame';
import { requirePrivilegedWorkspaceAccess } from '@/lib/route-access';

export default async function Customer360Layout({ children }: { children: ReactNode }) {
  await requirePrivilegedWorkspaceAccess();
  return <CrmWorkspaceFrame>{children}</CrmWorkspaceFrame>;
}
