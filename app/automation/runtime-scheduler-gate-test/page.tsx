import { syncAndEnableSupabaseSchedulerGateTestAction } from '@/app/automation/runtime-scheduler-test/scheduler-control-actions';
import { PageHeader } from '@/components/ui';

export default async function RuntimeSchedulerGateTestPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const query = await searchParams;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automation · Scheduler"
        title="Supabase Scheduler Gate Test"
        description="Run one controlled database-scheduler authentication check while automatic workflow execution remains disabled."
      />

      {query.notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{query.notice}</div> : null}
      {query.error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{query.error}</div> : null}

      <section className="card-pad max-w-2xl">
        <p className="text-sm leading-6 text-slate-600">
          This controlled check prepares the database scheduler credential and invokes one request. The application-level scheduler switch must remain disabled, so no workflow or customer message can run.
        </p>
        <form action={syncAndEnableSupabaseSchedulerGateTestAction} className="mt-5">
          <button type="submit" className="btn-primary">Run controlled scheduler gate</button>
        </form>
      </section>
    </div>
  );
}
