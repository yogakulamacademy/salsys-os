import { KeyRound, ShieldCheck } from 'lucide-react';

import { syncRuntimeSchedulerVaultSecretAction } from '@/app/automation/runtime-scheduler-test/vault-action';
import { PageHeader } from '@/components/ui';

export default async function RuntimeSchedulerSecretSyncPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const query = await searchParams;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automation · Scheduler"
        title="Scheduler Vault Credential Sync"
        description="Securely copy the deployment CRON_SECRET into Supabase Vault without exposing the plaintext credential in the browser or application tables."
      />

      {query.notice ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {query.notice}
        </div>
      ) : null}
      {query.error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          {query.error}
        </div>
      ) : null}

      <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm leading-6 text-violet-900">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 shrink-0" size={18} />
          <div>
            <strong>Safe sync mode:</strong> the server reads CRON_SECRET from the deployment environment and passes it directly to a service-role-only database RPC. The secret is stored only in Supabase Vault. AUTOMATION_SCHEDULER_ENABLED must remain false/unset.
          </div>
        </div>
      </div>

      <section className="card-pad max-w-2xl">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700">
            <KeyRound size={18} />
          </div>
          <div>
            <h2 className="font-bold text-slate-950">Sync scheduler credential</h2>
            <p className="mt-1 text-sm text-slate-500">
              This does not enable the scheduler, change workflow runtime flags, advance any enrollment, or send any customer message.
            </p>
          </div>
        </div>

        <form action={syncRuntimeSchedulerVaultSecretAction} className="mt-5">
          <button type="submit" className="btn-primary">Sync CRON_SECRET to Vault</button>
        </form>
      </section>
    </div>
  );
}
