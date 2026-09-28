import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  CircleDollarSign,
  ContactRound,
  Flame,
} from 'lucide-react';
import { PipelineBoard } from '@/components/pipeline-board';
import { PipelineInsights } from '@/components/pipeline-insights';
import { PageHeader, StatCard } from '@/components/ui';
import { getLeads } from '@/lib/data';

export default async function PipelinePage() {
  const leads = await getLeads();

  const activeStages = [
    'new',
    'contacted',
    'engaged',
    'qualified',
    'high_intent',
    'payment_pending',
  ];

  const activeLeads = leads.filter((lead) =>
    activeStages.includes(lead.stage)
  );

  const qualifiedPlus = leads.filter((lead) =>
    ['qualified', 'high_intent', 'payment_pending', 'enrolled'].includes(
      lead.stage
    )
  ).length;

  const highIntent = leads.filter(
    (lead) => lead.stage === 'high_intent'
  ).length;

  const paymentPending = leads.filter(
    (lead) => lead.stage === 'payment_pending'
  ).length;

  const enrolled = leads.filter(
    (lead) => lead.stage === 'enrolled'
  ).length;

  const insightData = [
    {
      stage: 'New',
      leads: leads.filter((lead) => lead.stage === 'new').length,
    },
    {
      stage: 'Contacted',
      leads: leads.filter((lead) => lead.stage === 'contacted').length,
    },
    {
      stage: 'Engaged',
      leads: leads.filter((lead) => lead.stage === 'engaged').length,
    },
    {
      stage: 'Qualified',
      leads: leads.filter((lead) => lead.stage === 'qualified').length,
    },
    {
      stage: 'High intent',
      leads: highIntent,
    },
    {
      stage: 'Payment',
      leads: paymentPending,
    },
  ];

  const boardLeads = activeLeads.map((lead) => ({
    id: lead.id,
    name: lead.name,
    stage: lead.stage,
    country: lead.country ?? '',
    location: lead.location ?? '',
    course: lead.course ?? '',
    currentContactChannel: lead.currentContactChannel ?? 'unknown',
  }));

  return (
    <>
      <PageHeader
        eyebrow="Admissions funnel"
        title="Pipeline"
        description="A live operational view of active leads. Use the board to find opportunities quickly, then open a lead to move stages through the audited stage workflow."
        actions={
          <>
            <Link href="/funnel" className="btn-secondary">
              Funnel analytics
            </Link>

            <Link href="/admissions" className="btn-primary">
              Admissions Desk
              <ArrowRight size={15} />
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="animate-rise stagger-1">
          <StatCard
            label="Active pipeline"
            value={activeLeads.length.toLocaleString()}
            note="open admissions opportunities"
            icon={<ContactRound size={19} />}
          />
        </div>

        <div className="animate-rise stagger-2">
          <StatCard
            label="Qualified+"
            value={qualifiedPlus.toLocaleString()}
            note="qualified through enrolled"
            icon={<BadgeCheck size={19} />}
          />
        </div>

        <div className="animate-rise stagger-3">
          <StatCard
            label="High intent"
            value={highIntent.toLocaleString()}
            note="strong buying intent"
            icon={<Flame size={19} />}
          />
        </div>

        <div className="animate-rise stagger-4">
          <StatCard
            label="Payment pending"
            value={paymentPending.toLocaleString()}
            note="closest active stage to enrollment"
            icon={<CircleDollarSign size={19} />}
          />
        </div>

        <div className="animate-rise stagger-5">
          <StatCard
            label="Enrolled"
            value={enrolled.toLocaleString()}
            note="closed successful enrollments"
            icon={<BadgeCheck size={19} />}
          />
        </div>
      </div>

      <div className="mt-4 animate-rise stagger-2">
        <PipelineInsights data={insightData} />
      </div>

      <PipelineBoard leads={boardLeads} />
    </>
  );
}
