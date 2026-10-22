'use client';

import { useMemo, useState } from 'react';

const PLATFORM_OPTIONS = [
  { value: 'custom_web', label: 'Custom website', kind: 'website' },
  { value: 'wordpress', label: 'WordPress', kind: 'website' },
  { value: 'webflow', label: 'Webflow', kind: 'website' },
  { value: 'framer', label: 'Framer', kind: 'website' },
  { value: 'shopify', label: 'Shopify', kind: 'client' },
  { value: 'android', label: 'Android', kind: 'client' },
  { value: 'ios', label: 'iOS', kind: 'client' },
] as const;

type CreatedSource = {
  source: {
    id: string;
    name: string;
    source_key: string;
    source_type: string;
    hostname?: string | null;
    metadata?: Record<string, unknown>;
  };
  site?: {
    id: string;
    public_site_id: string;
    hostname: string;
    environment: string;
  };
  credentials: {
    site_id?: string;
    source_key: string;
    publishable?: boolean;
    origin_bound?: boolean;
    secret?: string | null;
  };
};

function websiteSnippet(siteId: string) {
  const encoded = encodeURIComponent(siteId);
  return `<script\n  src="https://salsysos.com/salsys-intelligence.js"\n  data-salsys-site="${siteId}"\n  data-endpoint="https://salsysos.com/api/events/browser/v1?site_id=${encoded}"\n  data-consent-endpoint="https://salsysos.com/api/privacy/consent/v1?site_id=${encoded}"\n  data-consent-mode="required"\n  data-form-mode="lead-only"\n  defer>\n</script>\n<script\n  src="https://salsysos.com/salsys-consent.js"\n  data-consent-banner="auto"\n  data-consent-settings="floating"\n  defer>\n</script>`;
}

function installationText(
  platform: string,
  sourceKey: string,
  hostname: string,
  siteId: string,
) {
  if (platform === 'android') {
    return `Salsys.initialize(\n  applicationContext,\n  SalsysConfig(sourceKey = "${sourceKey}")\n)\n\nSalsys.setConsent(mapOf("analytics" to "granted"))\nSalsys.track("app.screen_viewed", mapOf("screen" to "home"))`;
  }

  if (platform === 'ios') {
    return `Salsys.shared.configure(\n  SalsysConfig(sourceKey: "${sourceKey}")\n)\n\nSalsys.shared.setConsent(["analytics": "granted"])\nSalsys.shared.track("app.screen_viewed", properties: ["screen": "home"])`;
  }

  if (platform === 'shopify') {
    return `// Shopify Custom Pixel\nconst SALSYS_SOURCE_KEY = '${sourceKey}';\n// Use integrations/shopify/salsys-custom-pixel.js and replace\n// REPLACE_WITH_PUBLISHABLE_SOURCE_KEY with the value above.\n// Configure Shopify Customer Events privacy to require analytics consent.`;
  }

  if (platform === 'wordpress') {
    return `Salsys Site ID: ${siteId}\nRegistered hostname: ${hostname}\n\nFor immediate installation, add this snippet through your approved global header/custom-code mechanism:\n\n${websiteSnippet(siteId)}\n\nThe Site ID is public, but Salsys still verifies it against the registered hostname.`;
  }

  return websiteSnippet(siteId);
}

export function TrackingSourceCreator() {
  const [platform, setPlatform] = useState<(typeof PLATFORM_OPTIONS)[number]['value']>('custom_web');
  const [name, setName] = useState('');
  const [hostname, setHostname] = useState('');
  const [privacyNoticeVersion, setPrivacyNoticeVersion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedSource | null>(null);

  const selected = PLATFORM_OPTIONS.find((item) => item.value === platform) ?? PLATFORM_OPTIONS[0];
  const isWebsite = selected.kind === 'website';
  const suggestedName = useMemo(() => {
    const suffix = hostname.trim() || 'source';
    return `${selected.label}: ${suffix}`;
  }, [hostname, selected.label]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setCreated(null);

    try {
      const response = await fetch('/api/tracking/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || suggestedName,
          sourceType: selected.kind,
          platform,
          hostname: isWebsite ? hostname.trim() : undefined,
          privacyNoticeVersion: privacyNoticeVersion.trim(),
        }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof body.error === 'string' ? body.error : 'Unable to create tracking source.');
      }

      setCreated(body as CreatedSource);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create tracking source.');
    } finally {
      setSubmitting(false);
    }
  }

  const sourceKey = created?.credentials?.source_key ?? '';
  const siteId = created?.site?.public_site_id ?? created?.credentials?.site_id ?? '';

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <div className="eyebrow">Add data source</div>
        <h2 className="section-title mt-1">Connect another platform</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          Every website receives a unique public Salsys Site ID and remains bound to its registered hostname. Android, iOS and Shopify use a publishable source key. Trusted payment, enrollment and revenue events still require the server Events API.
        </p>
      </div>

      <form onSubmit={submit} className="mt-5 grid gap-4 lg:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Platform
          <select
            value={platform}
            onChange={(event) => setPlatform(event.target.value as typeof platform)}
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
          >
            {PLATFORM_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium text-slate-700">
          Source name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={suggestedName}
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900"
          />
        </label>

        {isWebsite ? (
          <label className="text-sm font-medium text-slate-700">
            Live hostname
            <input
              required
              value={hostname}
              onChange={(event) => setHostname(event.target.value)}
              placeholder="www.example.com"
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900"
            />
          </label>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            A publishable source key will be generated for this client integration. It is safe to ship in the app or Shopify pixel; a trusted server secret is never returned.
          </div>
        )}

        <label className="text-sm font-medium text-slate-700">
          Privacy notice version
          <input
            required
            value={privacyNoticeVersion}
            onChange={(event) => setPrivacyNoticeVersion(event.target.value)}
            placeholder="2026-10-20"
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900"
          />
          <span className="mt-1 block text-xs font-normal text-slate-400">Use the version/date of the privacy notice shown to users on this platform.</span>
        </label>

        <div className="lg:col-span-2 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Creating…' : `Create ${selected.label} source`}
          </button>
          {error ? <span className="text-sm text-rose-600">{error}</span> : null}
        </div>
      </form>

      {created ? (
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
          <div className="text-sm font-semibold text-emerald-900">Source created</div>
          <p className="mt-1 text-xs leading-5 text-emerald-800">
            {isWebsite
              ? 'This public Site ID identifies the registered website. Salsys verifies both the Site ID and browser origin before accepting events.'
              : 'The source key below is publishable. Keep trusted Salsys server secrets out of client applications.'}
          </p>

          {isWebsite && siteId ? (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-white p-3">
              <div className="text-[10px] font-semibold uppercase tracking-[.08em] text-emerald-700">Salsys Site ID</div>
              <div className="mt-1 font-mono text-sm font-semibold text-slate-900">{siteId}</div>
            </div>
          ) : null}

          {!isWebsite ? (
            <div className="mt-3 rounded-xl bg-white p-3 font-mono text-xs text-slate-700 break-all">
              {sourceKey}
            </div>
          ) : null}

          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-4 text-xs leading-5 text-slate-100">
            {installationText(platform, sourceKey, hostname.trim(), siteId)}
          </pre>

          <p className="mt-3 text-xs leading-5 text-emerald-800">
            Refresh this page after the first accepted event to see source health and SDK provenance.
          </p>
        </div>
      ) : null}
    </section>
  );
}
