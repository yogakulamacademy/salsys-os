import type { ReactNode } from 'react';

import { MarketingNavigation } from '@/components/marketing/marketing-navigation';
import styles from './marketing-workspace-frame.module.css';

export function MarketingWorkspaceFrame({ children }: { children: ReactNode }) {
  return (
    <div className={`${styles.studio} grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[238px_minmax(0,1fr)] xl:gap-6`}>
      <MarketingNavigation />
      <div className="min-w-0 pb-8">{children}</div>
    </div>
  );
}
