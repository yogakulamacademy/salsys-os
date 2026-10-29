import type { ReactNode } from 'react';

import { CrmWorkspaceFrame } from '@/components/crm/crm-workspace-frame';
import { PageHeader } from '@/components/ui';

import './team-performance-ph4d.css';

export default function TeamPerformanceLayout({ children }: { children: ReactNode }) {
  return (
    <CrmWorkspaceFrame>
      <div className="team-performance-scope">
        <PageHeader
          eyebrow="Admin intelligence"
          title="Team Performance"
          description="Compare current workload, work completed, response efficiency and conversion outcomes without reducing employee performance to one activity score."
        />
        {children}
      </div>
    </CrmWorkspaceFrame>
  );
}
