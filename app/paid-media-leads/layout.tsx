import './acquisition-responsive.css';

import { requirePrivilegedWorkspaceAccess } from '@/lib/route-access';

export default async function PaidMediaLeadsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requirePrivilegedWorkspaceAccess();

  return children;
}
