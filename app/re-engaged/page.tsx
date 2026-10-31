import { redirect } from 'next/navigation';

import {
  buildCrmCompatibilityUrl,
  firstParam,
  type LegacySearchParams,
} from '@/lib/crm/legacy-route-redirect';

export default async function ReEngagedPage({
  searchParams,
}: {
  searchParams: Promise<LegacySearchParams>;
}) {
  const params = await searchParams;
  const legacyView = firstParam(params.view);

  redirect(
    buildCrmCompatibilityUrl('/opportunities', params, {
      surface: 'activity',
      activity: legacyView || null,
      view: null,
    }),
  );
}
