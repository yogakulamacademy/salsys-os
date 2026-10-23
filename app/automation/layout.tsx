import type { ReactNode } from 'react';

import { AutomationNavigation } from '@/components/automation/automation-navigation';
import styles from './automation-studio.module.css';

export default function AutomationLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${styles.studio} grid gap-6 lg:grid-cols-[232px_minmax(0,1fr)] xl:grid-cols-[252px_minmax(0,1fr)] xl:gap-7`}
    >
      <AutomationNavigation />
      <main className="min-w-0 pb-10">{children}</main>
    </div>
  );
}
