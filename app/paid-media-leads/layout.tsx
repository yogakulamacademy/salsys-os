import './acquisition-responsive.css';

import { AcquisitionJourneyBar } from '@/components/marketing/acquisition-journey-bar';

export default function PaidMediaLeadsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <AcquisitionJourneyBar />
      {children}
    </>
  );
}
