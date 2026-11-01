import Link from 'next/link';
import { ArrowLeft, Database } from 'lucide-react';
import { notFound } from 'next/navigation';
import { updateLeadAction } from '@/app/actions/crm';
import { GenericLeadForm } from '@/components/forms/generic-lead-form';
import { LeadForm } from '@/components/forms/lead-form';
import { PageHeader } from '@/components/ui';
import { getCourseBatches, getCourses, getLead, isMockMode } from '@/lib/data';
import { isEducationCoreEnabledForCurrentSession } from '@/lib/education-access';

export default async function EditLeadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const mock = isMockMode();
  const [lead, educationEnabled] = await Promise.all([
    getLead(id),
    mock ? Promise.resolve(true) : isEducationCoreEnabledForCurrentSession(),
  ]);
  if (!lead) notFound();

  const [courses, batches] = educationEnabled
    ? await Promise.all([getCourses(), getCourseBatches()])
    : [[], []];
  const action = updateLeadAction.bind(null, id);

  return <>
    <Link href={`/leads/${id}`} className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-brand"><ArrowLeft size={15} /> Back to lead</Link>
    <PageHeader
      eyebrow={lead.leadCode}
      title={`Edit ${lead.name}`}
      description={educationEnabled
        ? "Update admissions details without changing the lead's attribution history or audited funnel history."
        : "Update lead qualification and commercial context without changing attribution history or audited funnel history."}
    />
    {query.error && <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{query.error}</div>}
    {mock && <div className="mb-4 flex gap-2 rounded-xl border border-orange-100 bg-orange-50 px-4 py-3 text-sm text-orange-700"><Database size={17} className="mt-0.5 shrink-0" /> Mock mode is active. Changes will not persist.</div>}
    {educationEnabled ? (
      <LeadForm courses={courses} batches={batches} lead={lead} action={action} submitLabel="Save changes" />
    ) : (
      <GenericLeadForm lead={lead} action={action} submitLabel="Save changes" />
    )}
  </>;
}
