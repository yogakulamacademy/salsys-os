import type { ReactNode } from 'react';

import { InstagramPolicyNotes } from '@/components/automation/instagram-policy-notes';

export default function InstagramAutomationLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-4">
      {children}
      <InstagramPolicyNotes />
    </div>
  );
}
