import './source-icons.css';
import './command-center-v2.css';

import { requirePrivilegedWorkspaceAccess } from '@/lib/route-access';

export default async function HomeLayout({ children }: { children: React.ReactNode }) {
  await requirePrivilegedWorkspaceAccess();

  return <>{children}</>;
}
