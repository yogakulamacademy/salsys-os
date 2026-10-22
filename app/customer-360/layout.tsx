import type { ReactNode } from 'react';

import { CrmWorkspaceFrame } from '@/components/crm/crm-workspace-frame';

export default function Customer360Layout({ children }: { children: ReactNode }) {
  return <CrmWorkspaceFrame>{children}</CrmWorkspaceFrame>;
}
