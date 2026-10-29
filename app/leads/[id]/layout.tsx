import type { ReactNode } from 'react';

import { LeadOwnerControl } from '@/components/lead-owner-control';

export default async function LeadRecordLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <>
      <LeadOwnerControl leadId={id} />
      {children}
    </>
  );
}
