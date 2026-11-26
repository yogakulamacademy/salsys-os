import type { ReactNode } from 'react';

import { OperationsNavigation } from '@/components/operations/operations-navigation';
import styles from '@/components/marketing/marketing-workspace-frame.module.css';

export function OperationsWorkspaceFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <div className={`growth-workspace-scope ${styles.studio} grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[238px_minmax(0,1fr)] xl:gap-6`}>
        <OperationsNavigation />
        <div className="min-w-0 pb-8">{children}</div>
      </div>
      <style>{`
        .page-transition:has(.growth-workspace-scope) {
          animation: none !important;
          transform: none !important;
        }
      `}</style>
    </>
  );
}
