import type { ReactNode } from 'react';

import { CrmWorkspaceFrame } from '@/components/crm/crm-workspace-frame';

export default function WorkQueueLayout({ children }: { children: ReactNode }) {
  return <CrmWorkspaceFrame>{children}</CrmWorkspaceFrame>;
}
