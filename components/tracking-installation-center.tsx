'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

import {
  Apple,
  Check,
  Clipboard,
  Code2,
  Globe2,
  Loader2,
  PanelsTopLeft,
  RefreshCw,
  Server,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Sparkles,
} from 'lucide-react';

type PlatformId =
  | 'custom_web'
  | 'wordpress'
  | 'webflow'
  | 'framer'
  | 'shopify'
  | 'android'
  | 'ios'
  | 'server';

type TrackingSource = {
  id: string;
  name: string;
  source_type: string;
  source_system: string;
  source_key: string;
  auth_mode: string;
  hostname: string | null;
  status: string;
  allowed_event_prefixes: string[];
  accepted_event_count: number;
  duplicate_event_count: number;
  rejected_event_count: number;
  last_seen_at: string | null;
  last_rejected_at: string | null;
  privacy_notice_version: string | null;
  metadata: Record<string, unknown> | null;
};

type ProvisionResult = {
  source: TrackingSource;
  credentials: {
    source_key: string;
    secret?: string | null;
    publishable?: boolean;
    origin_bound?: boolean;
    shown_once?: boolean;
  };
};

type PlatformDefinition = {
  id: PlatformId;
  title: string;
  subtitle: string;
  sourceType: 'website' | 'client' | 'api';
  requiresHostname: boolean;
  requiresPrivacyVersion: boolean;
};

const PLATFORMS: PlatformDefinition[] = [
  {
    id: 'custom_web',
    title: 'Custom website',
    subtitle: 'HTML, PHP, React, Next.js, Vue or Angular',
    sourceType: 'website',
    requiresHostname: true,
    requiresPrivacyVersion: true,
  },
  {
    id: 'wordpress',
    title: 'WordPress',
    subtitle: 'Install the Salsys plugin or canonical snippet',
    sourceType: 'website',
    requiresHostname: true,
    requiresPrivacyVersion: true,
  },
  {
    id: 'webflow',
    title: 'Webflow',
    subtitle: 'Site-wide Custom Code installation',
    sourceType: 'website',
    requiresHostname: true,
    requiresPrivacyVersion: true,
  },
  {
    id: 'framer',
    title: 'Framer',
    subtitle: 'Project Custom Code installation',
    sourceType: 'website',
    requiresHostname: true,
    requiresPrivacyVersion: true,
  },
  {
    id: 'shopify',
    title: 'Shopify',
    subtitle: 'Customer Events pixel + trusted commerce webhooks',
    sourceType: 'client',
    requiresHostname: false,
    requiresPrivacyVersion: true,
  },
  {
    id: 'android',
    title: 'Android',
    subtitle: 'Native Kotlin SDK',
    sourceType: 'client',
    requiresHostname: false,
    requiresPrivacyVersion: true,
  },
  {
    id: 'ios',
    title: 'iOS',
    subtitle: 'Native Swift Package SDK',
    sourceType: 'client',
    requiresHostname: false,
    requiresPrivacyVersion: true,
  },
  {
    id: 'server',
    title: 'Server Events API',
    subtitle: 'Trusted backend facts and authoritative outcomes',
    sourceType: 'api',
    requiresHostname: false,
    requiresPrivacyVersion: false,
  },
];

function PlatformIcon({ id }: { id: PlatformId }) {
  const props = { size: 20, strokeWidth: 1.8 };
  if (id === 'wordpress') return <PanelsTopLeft {...props} />;
  if (id === 'webflow' || id === 'framer') return <Sparkles {...props} />;
  if (id === 'shopify') return <ShoppingBag {...props} />;
  if (id === 'android') return <Smartphone {...props} />;
  if (id === 'ios') return <Apple {...props} />;
  if (id === 'server') return <Server {...props} />;
  return <Globe2 {...props} />;
}

function cleanHostname(value: string) {
  const raw = value.trim();
  if (!raw) return '';
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
    return url.hostname;
  } catch {
    return raw;
  }
}

function platformForSource(source: TrackingSource) {
  const platform = source.metadata?.platform;
  return typeof platform === 'string' ? platform : null;
}

function prettyTime(value: string | null) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return 'Unknown';
  return date.toLocaleString();
}

function webSnippet() {
  return `<script\n  src="https://salsysos.com/salsys-intelligence.js"\n  data-consent-mode="required"\n  data-form-mode="lead-only"\n  defer>\n</script>\n<script\n  src="https://salsysos.com/salsys-consent.js"\n  data-consent-banner="auto"\n  data-consent-settings="floating"\n  data-consent-brand="Your Brand"\n  defer>\n</script>`;
}

function setupCode(
  platform: PlatformId,
  credentials: ProvisionResult['credentials'] | null,
) {
  const sourceKey = credentials?.source_key ?? 'YOUR_PUBLISHABLE_SOURCE_KEY';

  if (platform === 'wordpress') {
    return `1. Install integrations/wordpress/salsys-tracking/ as a WordPress plugin.\n2. Activate “Salsys Tracking”.\n3. Open Settings → Salsys Tracking.\n4. Keep analytics consent = Required unless another CMP is authoritative.\n5. Add only real enquiry-form CSS selectors when needed.\n\nManual installation alternative:\n${webSnippet()}`;
  }

  if (platform === 'webflow') {
    return `Webflow → Site settings → Custom Code\n\nPaste once site-wide:\n\n${webSnippet()}\n\nThen mark intended enquiry forms with the custom attribute:\ndata-salsys-lead-form`;
  }

  if (platform === 'framer') {
    return `Framer → Project Settings → Custom Code\n\nPaste once site-wide:\n\n${webSnippet()}\n\nDo not add another copy on individual pages/components.`;
  }

  if (platform === 'custom_web') {
    return `${webSnippet()}\n\nFor a real enquiry form:\n<form data-salsys-lead-form>…</form>`;
  }

  if (platform === 'shopify') {
    return `Shopify → Settings → Customer events → Add custom pixel\n\nUse the Salsys Custom Pixel adapter:\nintegrations/shopify/salsys-custom-pixel.js\n\nPublishable source key:\n${sourceKey}\n\nReplace REPLACE_WITH_PUBLISHABLE_SOURCE_KEY with the key above.\nStorefront events remain non-authoritative; orders/payments/refunds must use trusted server events.`;
  }

  if (platform === 'android') {
    return `import com.salsys.sdk.Salsys\nimport com.salsys.sdk.SalsysConfig\n\nSalsys.initialize(\n    applicationContext,\n    SalsysConfig(sourceKey = "${sourceKey}")\n)\n\nSalsys.setConsent(\n    mapOf("analytics" to "granted")\n)\n\nSalsys.track(\n    "app.screen_viewed",\n    mapOf("screen_name" to "CourseDetail")\n)`;
  }

  if (platform === 'ios') {
    return `import Salsys\n\nSalsys.shared.configure(\n    SalsysConfig(sourceKey: "${sourceKey}")\n)\n\nSalsys.shared.setConsent([\n    "analytics": "granted"\n])\n\nSalsys.shared.track(\n    "app.screen_viewed",\n    properties: ["screen_name": "CourseDetail"]\n)`;
  }

  const secret = credentials?.secret ?? 'YOUR_SERVER_SOURCE_SECRET';
  return `POST https://salsysos.com/api/events/v1\nX-Salsys-Source-Key: ${sourceKey}\nAuthorization: Bearer ${secret}\nContent-Type: application/json\n\n{\n  "event_id": "evt_your_unique_id",\n  "event_name": "payment.succeeded",\n  "schema_version": 1,\n  "occurred_at": "2026-10-20T00:00:00Z",\n  "properties": {\n    "reference": "server-generated-reference"\n  },\n  "metadata": {\n    "sdk": {\n      "name": "your-server-adapter",\n      "version": "1.0.0"\n    }\n  }\n}`;
}

export function TrackingInstallationCenter() {
  const [platform, setPlatform] = useState<PlatformId>('custom_web');
  const [name, setName] = useState('');
  const [hostname, setHostname] = useState('');
  const [privacyVersion, setPrivacyVersion] = useState('');
  const [sources, setSources] = useState<TrackingSource[]>([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const [provisioning, setProvisioning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProvisionResult | null>(null);
  const [copied, setCopied] = useState(false);

  const definition = useMemo(
    () => PLATFORMS.find((item) => item.id === platform) ?? PLATFORMS[0],
    [platform],
  );

  async function loadSources() {
    setLoadingSources(true);
    try {
      const response = await fetch('/api/tracking/sources', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to load tracking sources.');
      setSources(Array.isArray(data.sources) ? data.sources : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load tracking sources.');
    } finally {
      setLoadingSources(false);
    }
  }

  useEffect(() => {
    void loadSources();
  }, []);

  useEffect(() => {
    setResult(null);
    setError(null);
    setCopied(false);
    setName('');
    setHostname('');
  }, [platform]);

  async function provision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProvisioning(true);
    setError(null);
    setResult(null);

    try {
      const body: Record<string, unknown> = {
        name: name.trim() || definition.title,
        sourceType: definition.sourceType,
      };

      if (definition.sourceType === 'website') {
        body.platform = platform;
        body.hostname = cleanHostname(hostname);
        body.privacyNoticeVersion = privacyVersion.trim();
      } else if (definition.sourceType === 'client') {
        body.platform = platform;
        body.privacyNoticeVersion = privacyVersion.trim();
      } else {
        body.sourceSystem = 'server_events';
        body.allowedEventPrefixes = [
          'lead.',
          'conversation.',
          'message.',
          'booking.',
          'payment.',
          'enrollment.',
        ];
      }

      const response = await fetch('/api/tracking/sources', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to create tracking source.');

      setResult({ source: data.source, credentials: data.credentials });
      await loadSources();
    } catch (provisionError) {
      setError(
        provisionError instanceof Error
          ? provisionError.message
          : 'Unable to create tracking source.',
      );
    } finally {
      setProvisioning(false);
    }
  }

  async function copySetup() {
    const value = setupCode(platform, result?.credentials ?? null);
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  const currentSourceMatches = sources.filter((source) => {
    if (definition.sourceType !== source.source_type) return false;
    if (definition.sourceType === 'website') {
      const sourcePlatform = platformForSource(source);
      return sourcePlatform === platform || (!sourcePlatform && platform === 'custom_web');
    }
    return platformForSource(source) === platform;
  });

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950">Choose a data source</h2>
            <p className="mt-1 text-sm text-slate-500">
              Every adapter feeds the same canonical Salsys event and identity layer.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
            <ShieldCheck size={14} />
            Client installs never receive trusted server secrets
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {PLATFORMS.map((item) => {
            const active = item.id === platform;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setPlatform(item.id)}
                className={`rounded-2xl border p-4 text-left transition ${
                  active
                    ? 'border-slate-950 bg-slate-950 text-white shadow-md'
                    : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div
                  className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl ${
                    active ? 'bg-white/10' : 'bg-slate-100'
                  }`}
                >
                  <PlatformIcon id={item.id} />
                </div>
                <div className="font-semibold">{item.title}</div>
                <div className={`mt-1 text-xs leading-5 ${active ? 'text-slate-300' : 'text-slate-500'}`}>
                  {item.subtitle}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
              <PlatformIcon id={platform} />
              Provision {definition.title}
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {definition.sourceType === 'website'
                ? 'The browser endpoint authenticates this source from its registered origin. No source secret is embedded in the page.'
                : definition.sourceType === 'client'
                  ? 'Salsys creates a publishable source key for non-authoritative client telemetry. It is safe to embed in the app/pixel.'
                  : 'Salsys creates a source key plus a trusted secret. The secret is shown once and belongs only on your backend.'}
            </p>
          </div>

          <form onSubmit={provision} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Source name
              </span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={`${definition.title} - Production`}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                required
                maxLength={120}
              />
            </label>

            {definition.requiresHostname ? (
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Live hostname
                </span>
                <input
                  value={hostname}
                  onChange={(event) => setHostname(event.target.value)}
                  placeholder="www.example.com"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                  required
                  maxLength={300}
                />
                <p className="mt-1.5 text-xs leading-5 text-slate-500">
                  Register each real hostname separately when both www and apex versions serve traffic.
                </p>
              </label>
            ) : null}

            {definition.requiresPrivacyVersion ? (
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Privacy notice version
                </span>
                <input
                  value={privacyVersion}
                  onChange={(event) => setPrivacyVersion(event.target.value)}
                  placeholder="2026-10-20"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                  required
                  maxLength={120}
                />
                <p className="mt-1.5 text-xs leading-5 text-slate-500">
                  Use the tenant&apos;s actual published notice version; Salsys does not invent one.
                </p>
              </label>
            ) : null}

            {error ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={provisioning}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {provisioning ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {provisioning ? 'Creating source…' : 'Create tracking source'}
            </button>
          </form>

          {result?.credentials.secret ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs leading-5 text-amber-800">
              <strong>Save the server secret now.</strong> It is returned only during source creation. Never put it in browser JavaScript, Shopify, WordPress, Android or iOS.
            </div>
          ) : null}
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 shadow-sm">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Code2 size={17} />
                Installation
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {result ? 'Source created — use the configuration below.' : 'Create the source to receive its final configuration.'}
              </p>
            </div>
            <button
              type="button"
              onClick={copySetup}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
            >
              {copied ? <Check size={14} /> : <Clipboard size={14} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <pre className="max-h-[620px] overflow-auto whitespace-pre-wrap break-words p-5 text-xs leading-6 text-slate-200">
            {setupCode(platform, result?.credentials ?? null)}
          </pre>

          <div className="border-t border-white/10 px-5 py-4 text-xs leading-5 text-slate-400">
            {definition.sourceType === 'api'
              ? 'Trusted server events may represent authoritative business facts. The source secret must stay server-side.'
              : 'Client/browser signals are telemetry. Payment, enrollment, refund and revenue truth must come from an authenticated server integration.'}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-950">Connected sources</h2>
            <p className="mt-1 text-sm text-slate-500">
              Tenant-bound source health from the authoritative tracking registry.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadSources()}
            disabled={loadingSources}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw size={14} className={loadingSources ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {loadingSources && sources.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
            Loading tracking sources…
          </div>
        ) : sources.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
            No tracking sources yet. Choose a platform above to create the first one.
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {sources.map((source) => (
              <div key={source.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-950">{source.name}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {source.source_type} · {source.auth_mode}
                      {source.hostname ? ` · ${source.hostname}` : ''}
                      {platformForSource(source) ? ` · ${platformForSource(source)}` : ''}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      source.status === 'active'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {source.status}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-slate-50 px-2 py-2">
                    <div className="text-sm font-semibold text-slate-900">{source.accepted_event_count ?? 0}</div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Accepted</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-2 py-2">
                    <div className="text-sm font-semibold text-slate-900">{source.duplicate_event_count ?? 0}</div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Duplicate</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-2 py-2">
                    <div className="text-sm font-semibold text-slate-900">{source.rejected_event_count ?? 0}</div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Rejected</div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span>Last event: {prettyTime(source.last_seen_at)}</span>
                  {source.privacy_notice_version ? (
                    <span>Notice: {source.privacy_notice_version}</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}

        {currentSourceMatches.length > 0 ? (
          <p className="mt-4 text-xs text-slate-500">
            {currentSourceMatches.length} existing source{currentSourceMatches.length === 1 ? '' : 's'} match the currently selected platform. Avoid creating a duplicate unless it represents a different hostname/app/store/environment.
          </p>
        ) : null}
      </section>
    </div>
  );
}
