import type { ReactNode } from 'react';

import { AutomationNavigation } from '@/components/automation/automation-navigation';
import { requirePrivilegedWorkspaceAccess } from '@/lib/route-access';
import styles from './automation-studio.module.css';

export default async function AutomationLayout({ children }: { children: ReactNode }) {
  await requirePrivilegedWorkspaceAccess();

  return (
    <div
      className={`${styles.studio} grid gap-6 lg:grid-cols-[232px_minmax(0,1fr)] xl:grid-cols-[252px_minmax(0,1fr)] xl:gap-7`}
    >
      <AutomationNavigation />
      <main className="min-w-0 pb-10">{children}</main>
    </div>
  );
}
