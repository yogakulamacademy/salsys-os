import Link from 'next/link';
import { ArrowLeft, FormInput, ShieldCheck } from 'lucide-react';

import { DetectedFormsPanel } from '@/components/detected-forms-panel';
import { PageHeader } from '@/components/ui';

export default function TrackingFormsPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Universal Tracking Platform"
        title="Detected forms"
        description="Discover website forms automatically, map approved lead fields, and enable browser lead capture without editing each form or adding a backend helper."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/tracking"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-950"
        >
          <ArrowLeft size={15} /> Back to Tracking
        </Link>
        <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
          <ShieldCheck size={14} /> Field values are not stored during detection
        </div>
      </div>

      <section className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-5">
        <div className="flex gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-indigo-700">
            <FormInput size={18} />
          </span>
          <div>
            <div className="text-sm font-semibold text-indigo-950">Install once, configure from Salsys</div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-indigo-800">
              The Universal Tracking SDK reports safe form structure for registered websites. Owners/admins can then explicitly enable a form and map canonical lead fields. Saved mappings are returned to the SDK and override heuristic field detection for that form.
            </p>
          </div>
        </div>
      </section>

      <DetectedFormsPanel />
    </div>
  );
}
