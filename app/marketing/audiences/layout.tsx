import type { ReactNode } from 'react';

import { AudienceRuleBuilderDrawer } from '@/components/marketing/audience-rule-builder-drawer';

export default function AudienceActivationLayout({ children }: { children: ReactNode }) {
  return <>{children}<AudienceRuleBuilderDrawer /></>;
}
