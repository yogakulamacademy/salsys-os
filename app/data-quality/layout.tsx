import type { ReactNode } from 'react';

import { requirePrivilegedWorkspaceAccess } from '@/lib/route-access';

export default async function DataQualityLayout({ children }: { children: ReactNode }) {
  await requirePrivilegedWorkspaceAccess();
  // Data Quality now lives under Settings, so it no longer shows the CRM menu.
  return <>{children}</>;
}
