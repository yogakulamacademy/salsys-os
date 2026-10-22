import {
  Activity,
  AppWindow,
  CheckCircle2,
  Code2,
  Globe2,
  MonitorSmartphone,
  PackageOpen,
  Server,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  TriangleAlert,
} from 'lucide-react';

import { ServerTrackingSourceCreator } from '@/components/server-tracking-source-creator';
import { TrackingSourceCreator } from '@/components/tracking-source-creator';
import { PageHeader } from '@/components/ui';
import {
  getTrackingPlatformWorkspace,
  type TrackingPlatformSource,
} from '@/lib/tracking-platform-data';

const PLATFORMS = [
  {
    key: 'custom_web',
    label: 'Custom website',
    description: 'JavaScript SDK for PHP, static HTML, React, Next.js, Vue, Angular and other browser apps.',
    icon: Code2,
  },
  {
    key: 'wordpress',
    label: 'WordPress',
    description: 'Origin-bound website source plus the Salsys WordPress installation adapter.',
    icon: Globe2,
  },
  {
    key: 'webflow',
    label: 'Webflow',
    description: 'Universal browser SDK installed through site-level Custom Code.',
    icon: AppWindow,
  },
  {
    key: 'framer',
    label: 'Framer',
    description: 'Universal browser SDK installed once through Framer Custom Code.',
    icon: MonitorSmartphone,
  },
  {
    key: 'shopify',
    label: 'Shopify',
    description: 'Publishable Custom Pixel/Web Pixel telemetry; authoritative orders stay server-side.',
    icon: ShoppingBag,
  },
  {
    key: 'android',
    label: 'Android',
    description: 'Native Kotlin SDK with consent, sessions, offline queue and publishable source identity.',
    icon: Smartphone,
  },
  {
    key: 'ios',
    label: 'iOS',
    description: 'Native Swift package with consent, sessions, offline queue and publishable source identity.',
    icon: PackageOpen,
  },
  {
    key: 'server_api',
    label: 'Server Events API',
    description: 'Secret-authenticated backend events for leads, bookings, payments and enrollment truth.',
    icon: Server,
  },
] as const;

function sourceMatchesPlatform(source: TrackingPlatformSource, platform: string) {
  if (platform === 'server_api') {
    return ['api', 'webhook', 'system'].includes(source.sourceType);
  }
  if (source.platform === platform) return true;
  if (platform === 'custom_web' && source.sourceType === 'website' && (!source.platform || source.platform === 'web')) {
    return true;
  }
  return false;
}

function healthTone(status: TrackingPlatformSource['healthStatus']) {
  switch (status) {
    case 'healthy':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    case 'idle':
      return 'border-amber-200 bg-amber-50 text-amber-800';
    case 'not_live':
      return 'border-slate-200 bg-slate-50 text-slate-600';
    case 'inactive':
      return 'border-slate-200 bg-slate-100 text-slate-500';
    default:
      return 'border-rose-200 bg-rose-50 text-rose-700';
  }
}

function healthLabel(status: TrackingPlatformSource['healthStatus']) {
  return status.replaceAll('_', ' ');
}

function formatWhen(value: string | null) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function isServerSource(source: TrackingPlatformSource) {
  return ['api', 'webhook', 'system'].includes(source.sourceType);
}

export default async function TrackingSourcesPage() {
  const workspace = await getTrackingPlatformWorkspace();
  const healthy = workspace.sources.filter((source) => source.healthStatus === 'healthy').length;
  const live = workspace.sources.filter((source) => !['not_live', 'inactive', 'misconfigured'].includes(source.healthStatus)).length;
  const serverSources = workspace.sources.filter(isServerSource).length;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Universal Tracking Platform"
        title="Tracking sources"
        description="Use browser tracking for journeys and server tracking for durable business events. Both feed one canonical Salsys event, attribution and intelligence layer."
      />

      {workspace.warning ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {workspace.warning}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-4">
        <Metric
          icon={<Activity size={18} />}
          label="Configured sources"
          value={workspace.sources.length}
          note={workspace.organizationName ?? 'Active workspace'}
        />
        <Metric
          icon={<CheckCircle2 size={18} />}
          label="Healthy now"
          value={healthy}
          note="Accepted events within 24 hours"
        />
        <Metric
          icon={<Server size={18} />}
          label="Server sources"
          value={serverSources}
          note="Backend Events API connections"
        />
        <Metric
          icon={<ShieldCheck size={18} />}
          label="Live / active"
          value={live}
          note="Browser, client and server sources"
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="eyebrow">Supported platforms</div>
            <h2 className="section-title mt-1">Dual-path collection, one canonical protocol</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Browser/mobile SDKs capture behavioral context. The Server Events API captures durable backend facts even when JavaScript, cookies or client tracking are blocked. Both are preserved as separate evidence streams.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
            Server secrets never belong in browser/mobile code
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {PLATFORMS.map((platform) => {
            const Icon = platform.icon;
            const sources = workspace.sources.filter((source) => sourceMatchesPlatform(source, platform.key));
            const best = sources.find((source) => source.healthStatus === 'healthy') ?? sources[0];

            return (
              <div key={platform.key} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700">
                    <Icon size={18} />
                  </span>
                  <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[.06em] ${best ? healthTone(best.healthStatus) : 'border-slate-200 bg-white text-slate-400'}`}>
                    {best ? healthLabel(best.healthStatus) : 'not configured'}
                  </span>
                </div>
                <div className="mt-3 text-sm font-semibold text-slate-900">{platform.label}</div>
                <p className="mt-1 text-xs leading-5 text-slate-500">{platform.description}</p>
                <div className="mt-3 text-xs text-slate-400">
                  {sources.length ? `${sources.length} source${sources.length === 1 ? '' : 's'}` : 'Ready to connect'}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <TrackingSourceCreator />

      <ServerTrackingSourceCreator />

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="eyebrow">Source health</div>
        <h2 className="section-title mt-1">Installed data sources</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          Source health comes from accepted events, credential/privacy configuration and processing evidence. A configured source is not considered live until real events arrive.
        </p>

        {workspace.sources.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            No browser, client or server tracking source exists in this workspace yet.
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[1080px] border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-[.06em] text-slate-400">
                  <th className="border-b border-slate-200 px-3 py-3">Source</th>
                  <th className="border-b border-slate-200 px-3 py-3">Health</th>
                  <th className="border-b border-slate-200 px-3 py-3">Transport</th>
                  <th className="border-b border-slate-200 px-3 py-3">Events</th>
                  <th className="border-b border-slate-200 px-3 py-3">Security / privacy</th>
                  <th className="border-b border-slate-200 px-3 py-3">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {workspace.sources.map((source) => {
                  const server = isServerSource(source);
                  return (
                    <tr key={source.id} className="align-top">
                      <td className="border-b border-slate-100 px-3 py-4">
                        <div className="font-semibold text-slate-900">{source.name}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {server ? source.sourceSystem : source.platform ?? source.sourceType}
                          {source.hostname ? ` · ${source.hostname}` : ''}
                        </div>
                        {source.publicSiteId ? (
                          <div className="mt-1 font-mono text-[11px] text-emerald-700">{source.publicSiteId}</div>
                        ) : source.sourceKey ? (
                          <div className="mt-1 font-mono text-[11px] text-slate-400">{source.sourceKey}</div>
                        ) : null}
                        <div className="mt-1 text-[11px] text-slate-400">
                          {source.allowedEventPrefixes.join(', ') || 'No event prefix restriction'}
                        </div>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-4">
                        <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold capitalize ${healthTone(source.healthStatus)}`}>
                          {healthLabel(source.healthStatus)}
                        </span>
                        {source.rejectedEventCount > 0 ? (
                          <div className="mt-2 flex items-center gap-1 text-xs text-rose-600">
                            <TriangleAlert size={13} />
                            {source.rejectedEventCount} rejected total
                          </div>
                        ) : null}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-4 text-xs text-slate-600">
                        {server ? (
                          <>
                            <div>Server Events API v1</div>
                            <div className="mt-1 text-slate-400">Secret-authenticated HTTPS</div>
                          </>
                        ) : (
                          <>
                            <div>{source.sdkName ?? (source.sourceType === 'website' ? 'Browser SDK' : 'Client SDK / not observed')}</div>
                            <div className="mt-1 text-slate-400">
                              {source.sdkVersion ? `v${source.sdkVersion}` : '—'}
                              {source.sdkIntegration ? ` · ${source.sdkIntegration}` : ''}
                            </div>
                          </>
                        )}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-4 text-xs text-slate-600">
                        <div>{source.sourceType === 'client' ? source.events24h : source.acceptedEventCount} {source.sourceType === 'client' ? '· 24h' : 'accepted total'}</div>
                        <div className="mt-1 text-slate-400">
                          {source.sourceType === 'client'
                            ? `${source.events7d} events · ${source.sessions7d} sessions · 7d`
                            : `${source.duplicateEventCount} duplicates total`}
                        </div>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-4 text-xs text-slate-600">
                        {server ? (
                          <>
                            <div>Backend-only secret</div>
                            <div className="mt-1 text-slate-400">Trusted commercial authority</div>
                          </>
                        ) : source.sourceType === 'client' ? (
                          <>
                            <div>Notice {source.privacyNoticeVersion ?? 'missing'}</div>
                            <div className="mt-1 text-slate-400">{source.privacyReceipts7d} consent receipts · 7d</div>
                          </>
                        ) : (
                          <>
                            <div>Notice {source.privacyNoticeVersion ?? 'missing'}</div>
                            <div className="mt-1 text-slate-400">Strict origin + Site ID gate</div>
                          </>
                        )}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-4 text-xs text-slate-600">
                        {formatWhen(source.lastSeenAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-5">
        <div className="flex gap-3">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-indigo-700">
            <ShieldCheck size={17} />
          </span>
          <div>
            <div className="text-sm font-semibold text-indigo-950">Browser + server is the recommended production setup</div>
            <p className="mt-1 text-xs leading-5 text-indigo-800">
              Browser tracking gives Salsys page, session, CTA and form-context evidence. Server tracking remains available when browser telemetry is blocked and is the authoritative path for lead creation, payment success, booking and enrollment facts. Send the browser visitor/session IDs into your backend whenever available to connect both evidence streams without treating one as a substitute for the other.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  note: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-[.06em] text-slate-400">{label}</div>
        <span className="text-slate-500">{icon}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-950">{value.toLocaleString()}</div>
      <div className="mt-1 text-xs text-slate-500">{note}</div>
    </div>
  );
}
