import { redirect } from 'next/navigation';

import { buildCrmCompatibilityUrl, type LegacySearchParams } from '@/lib/crm/legacy-route-redirect';

export default async function DataQualityPage({
  searchParams,
}: {
  searchParams: Promise<LegacySearchParams>;
}) {
  const params = await searchParams;
  redirect(
    buildCrmCompatibilityUrl('/opportunities', params, {
      surface: 'quality',
    }),
  );
}
