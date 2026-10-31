import type { ReactNode } from 'react';

import { MarketingNavigation } from '@/components/marketing/marketing-navigation';
import styles from './marketing-workspace-frame.module.css';

export function MarketingWorkspaceFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <div className={`growth-workspace-scope ${styles.studio} grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[238px_minmax(0,1fr)] xl:gap-6`}>
        <MarketingNavigation />
        <div className="min-w-0 pb-8">{children}</div>
      </div>

      <style>{`
        /* The AppShell page-enter animation leaves a transform on the page wrapper.
         * A transformed ancestor breaks reliable sticky positioning for workspace
         * sidebars, so workspace frames opt out of that wrapper transform. */
        .page-transition:has(.growth-workspace-scope) {
          animation: none !important;
          transform: none !important;
        }
      `}</style>
    </>
  );
}
