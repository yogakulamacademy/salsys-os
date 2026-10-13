import { Activity, KeyRound, RefreshCw, ShieldCheck, Trash2, Webhook } from 'lucide-react';

import {
  createTrackingCredentialAction,
  registerTrackingSiteAction,
  revokeTrackingCredentialAction,
  rotateTrackingCredentialAction,
} from '@/app/tracking/actions';
import type { TrackingInstallation } from '@/lib/tracking-data';

function formatDate(value: string | null) {
  if (!value) return 'Not yet';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function TrackingInstallationPanel({
  installation,
}: {
  installation: TrackingInstallation;
}) {
  const hasKey = Boolean(installation.publicKey && installation.credentialId);
  const hasSites = installation.sites.length > 0;

  return (
    <div className="mt-5 space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <DiagnosticCard
          icon={<Webhook size={16} />}
          label="Website"
          value={installation.site ?? 'Not configured'}
          note={`${installation.sites.length} active domain${installation.sites.length === 1 ? '' : 's'}`}
          ok={Boolean(installation.site)}
        />

        <DiagnosticCard
          icon={<KeyRound size={16} />}
          label="Publishable key"
          value={hasKey ? 'Active' : 'Not created'}
          note={installation.environment ? `${installation.environment} environment` : 'Create a live browser key'}
          ok={hasKey}
        />

        <DiagnosticCard
          icon={<Activity size={16} />}
          label="Collector activity"
          value={`${installation.events24h.toLocaleString()} events · 24h`}
          note={installation.lastEventAt ? `Last event ${formatDate(installation.lastEventAt)}` : 'No event received yet'}
          ok={installation.events24h > 0 || Boolean(installation.lastEventAt)}
          neutral={!installation.lastEventAt}
        />

        <DiagnosticCard
          icon={<ShieldCheck size={16} />}
          label="Last processing"
          value={installation.lastEventStatus ?? 'No event yet'}
          note={installation.lastEventSdkVersion ? `SDK ${installation.lastEventSdkVersion} · schema ${installation.lastEventSchemaVersion ?? '—'}` : 'SDK version appears after first event'}
          ok={installation.lastEventStatus === 'processed'}
          neutral={!installation.lastEventStatus}
        />
      </div>

      {installation.canManage ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-semibold text-slate-800">1. Register website</div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Add the public hostname that will send browser events. The actual request origin must match this hostname.
            </p>

            <form action={registerTrackingSiteAction} className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                name="hostname"
                placeholder="example.com"
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none ring-brand/20 focus:ring-4"
                required
              />
              <button type="submit" className="btn-secondary whitespace-nowrap">
                Add website
              </button>
            </form>

            {hasSites ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {installation.sites.map((site) => (
                  <span key={site} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                    {site}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-semibold text-slate-800">2. Browser tracking key</div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              The publishable <code>pk_live_*</code> key is safe for the website. Salsys never places a secret key in the browser snippet.
            </p>

            {!hasKey ? (
              <form action={createTrackingCredentialAction} className="mt-4 flex flex-col gap-2 sm:flex-row">
                <select
                  name="hostname"
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                  required
                  defaultValue={installation.site ?? ''}
                  disabled={!hasSites}
                >
                  {!hasSites ? <option value="">Register a website first</option> : null}
                  {installation.sites.map((site) => (
                    <option key={site} value={site}>{site}</option>
                  ))}
                </select>
                <button type="submit" className="btn-secondary whitespace-nowrap" disabled={!hasSites}>
                  Create live key
                </button>
              </form>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[.08em] text-emerald-700">Active credential</div>
                  <div className="mt-1 break-all font-mono text-xs text-emerald-900">{installation.publicKey}</div>
                  <div className="mt-2 text-[11px] leading-5 text-emerald-800">
                    {installation.credentialName ?? 'Browser tracking'} · created {formatDate(installation.createdAt)} · last used {formatDate(installation.lastUsedAt)}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <form action={rotateTrackingCredentialAction}>
                    <input type="hidden" name="credential_id" value={installation.credentialId ?? ''} />
                    <button type="submit" className="btn-secondary !px-3 !py-2 text-xs">
                      <RefreshCw size={14} /> Rotate key
                    </button>
                  </form>

                  <form action={revokeTrackingCredentialAction}>
                    <input type="hidden" name="credential_id" value={installation.credentialId ?? ''} />
                    <button type="submit" className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100">
                      <Trash2 size={14} /> Revoke key
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
          Tracking installation is read-only for your workspace role. An owner or admin can register websites and manage tracking keys.
        </div>
      )}
    </div>
  );
}

function DiagnosticCard({
  icon,
  label,
  value,
  note,
  ok,
  neutral = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
  ok: boolean;
  neutral?: boolean;
}) {
  const tone = neutral
    ? 'border-slate-200 bg-white text-slate-500'
    : ok
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : 'border-amber-200 bg-amber-50 text-amber-800';

  return (
    <div className={`rounded-xl border p-3 ${tone}`}>
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.08em] opacity-80">
        {icon}
        {label}
      </div>
      <div className="mt-2 break-words text-sm font-semibold">{value}</div>
      <div className="mt-1 text-[11px] leading-5 opacity-80">{note}</div>
    </div>
  );
}
