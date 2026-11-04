import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, FileCheck2, LockKeyhole } from 'lucide-react';

import { getPilotEvidenceDraft } from '@/lib/ai/pilot-evidence-drafts';
import { savePilotEvidenceDraftAction } from './actions';

export const dynamic = 'force-dynamic';

const fields = [
  {
    name: 'privacy_ref',
    title: 'Privacy and data processing',
    description: 'Reference the approved purpose, data notice, permitted sources and sensitive-data handling review.',
    placeholder: 'PRIVACY-REVIEW-2026',
  },
  {
    name: 'retention_ref',
    title: 'Retention and deletion',
    description: 'Reference the proposed retention schedule and verified deletion procedure.',
    placeholder: 'RETENTION-POLICY-V1',
  },
  {
    name: 'provider_budget_ref',
    title: 'Claude budget and alerts',
    description: 'Reference provider-side spending limits, alert recipients and rollback ownership.',
    placeholder: 'BUDGET-CONTROLS-V1',
  },
  {
    name: 'quality_review_ref',
    title: 'Evidence and quality review',
    description: 'Reference the evaluation rubric, synthetic results and human-reviewed sample.',
    placeholder: 'QUALITY-REVIEW-V1',
  },
] as const;

export default async function PilotEvidenceDraftPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const data = await getPilotEvidenceDraft();
  if (!data) notFound();

  const { saved } = await searchParams;
  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-6">
      <Link href="/settings/ai-insights" className="inline-flex items-center gap-1.5 text-xs font-semibold text-copy-muted hover:text-copy">
        <ArrowLeft size={13} aria-hidden/> Back to AI operations
      </Link>

      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-copy-muted">
          Owner-only · Internal preparation
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-copy">Pilot review evidence</h1>
        <p className="mt-2 text-sm leading-6 text-copy-muted">
          Save references to separately secured approval documents. Drafts remain
          in the active workspace and every save creates a new historical entry.
          This does not approve, enable or test AI.
        </p>
        <p className="mt-1 text-xs text-copy-muted">{data.organizationName}</p>
      </header>

      {saved === '1' ? (
        <p role="status" className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-copy">
          Draft references saved. No pilot approval or activation was recorded.
        </p>
      ) : null}

      <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
        <div className="flex gap-2">
          <FileCheck2 size={17} className="mt-0.5 shrink-0 text-copy-muted" aria-hidden/>
          <div>
            <h2 className="text-sm font-semibold text-copy">Evidence reference packet</h2>
            <p className="mt-1 text-xs leading-5 text-copy-muted">
              Use document IDs only (8–100 characters: letters, digits, hyphens, underscores).
              Do not paste documents, passwords, customer names, message text or API keys.
            </p>
            <p className="mt-1 text-xs leading-5 text-copy-muted">
              {data.latest ? `Most recent draft: ${new Date(data.latest.created_at).toLocaleString()}` : 'No draft has been saved.'}
            </p>
          </div>
        </div>

        <form action={savePilotEvidenceDraftAction} className="mt-5 space-y-4">
          {fields.map(field => (
            <div key={field.name}>
              <label htmlFor={field.name} className="block text-sm font-semibold text-copy">
                {field.title}
              </label>
              <p className="mt-1 text-xs leading-5 text-copy-muted">{field.description}</p>
              <input
                id={field.name}
                name={field.name}
                type="text"
                defaultValue={data.latest?.[field.name] ?? ''}
                placeholder={field.placeholder}
                maxLength={100}
                pattern="[A-Za-z][A-Za-z0-9_-]{7,99}"
                title="Use an 8–100 character document reference ID without spaces."
                autoComplete="off"
                className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-copy outline-none focus-visible:ring-2 focus-visible:ring-copy-muted"
              />
            </div>
          ))}
          <button type="submit" className="inline-flex items-center rounded-lg bg-copy px-4 py-2.5 text-sm font-semibold text-surface hover:opacity-90">
            Save draft references
          </button>
        </form>
      </section>

      <section className="flex gap-3 rounded-xl border border-line p-4">
        <LockKeyhole size={17} className="mt-0.5 shrink-0 text-copy-muted" aria-hidden/>
        <div>
          <h2 className="text-sm font-semibold text-copy">Final approval is separate</h2>
          <p className="mt-1 text-xs leading-6 text-copy-muted">
            These identifiers are working references, not confirmed evidence.
            The existing release gate still requires dated human signoffs, an attributable approver,
            a current approval record and an enabled tenant policy. None is created here.
          </p>
        </div>
      </section>
    </main>
  );
}
