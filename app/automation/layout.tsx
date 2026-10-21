import type { ReactNode } from 'react';

import { AutomationNavigation } from '@/components/automation/automation-navigation';
import styles from './automation-studio.module.css';

export default function AutomationLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${styles.studio} grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[238px_minmax(0,1fr)] xl:gap-6`}>
      <AutomationNavigation />
      <div className="min-w-0 pb-8">{children}</div>
    </div>
  );
}
