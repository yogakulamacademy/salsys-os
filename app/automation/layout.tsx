import type { ReactNode } from 'react';

import { AutomationNavigation } from '@/components/automation/automation-navigation';

export default function AutomationLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[232px_minmax(0,1fr)]">
      <AutomationNavigation />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
