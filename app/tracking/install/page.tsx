import Link from 'next/link';

import { ArrowLeft } from 'lucide-react';

import { TrackingInstallationCenter } from '@/components/tracking-installation-center';
import { PageHeader } from '@/components/ui';

export default function TrackingInstallationPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Universal Tracking Platform"
        title="Install Salsys"
        description="Connect websites, commerce storefronts, native apps and trusted servers to the same privacy-aware event, identity and attribution layer."
        actions={
          <Link
            href="/tracking"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            <ArrowLeft size={16} />
            Tracking health
          </Link>
        }
      />

      <TrackingInstallationCenter />
    </div>
  );
}
