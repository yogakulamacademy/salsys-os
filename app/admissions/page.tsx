import { redirect } from 'next/navigation';

import {
  buildCrmCompatibilityUrl,
  firstParam,
  type LegacySearchParams,
} from '@/lib/crm/legacy-route-redirect';

export default async function AdmissionsPage({
  searchParams,
}: {
  searchParams: Promise<LegacySearchParams>;
}) {
  const params = await searchParams;
  const view = firstParam(params.view);

  if (view === 'performance') {
    redirect(
      buildCrmCompatibilityUrl('/crm/performance', params, {
        view: null,
        owner: null,
        band: null,
      }),
    );
  }

  redirect(
    buildCrmCompatibilityUrl('/work-queue/team', params, {
      view: null,
    }),
  );
}
