import './attribution-responsive.css';

import { requirePrivilegedWorkspaceAccess } from '@/lib/route-access';

export default async function AttributionLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requirePrivilegedWorkspaceAccess();
  return <div className="attribution-responsive-scope">{children}</div>;
}
