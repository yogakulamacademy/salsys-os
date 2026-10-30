import './acquisition-responsive.css';

import { AcquisitionJourneyBar } from '@/components/marketing/acquisition-journey-bar';
import { requirePrivilegedWorkspaceAccess } from '@/lib/route-access';

export default async function PaidMediaLeadsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requirePrivilegedWorkspaceAccess();

  return (
    <>
      <AcquisitionJourneyBar />
      {children}
    </>
  );
}
