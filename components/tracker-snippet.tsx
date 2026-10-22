'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

type WebsiteSource = {
  id: string;
  name: string;
  hostname: string | null;
  siteId: string;
  aliases: string[];
};

function sourceFromRow(row: Record<string, unknown>): WebsiteSource | null {
  if (row.source_type !== 'website' || row.status !== 'active') return null;
  const metadata =
    row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  if (metadata.merged_alias === true) return null;
  const siteId = typeof metadata.public_site_id === 'string' ? metadata.public_site_id : '';
  if (!siteId) return null;
  const aliases = Array.isArray(metadata.site_aliases)
    ? metadata.site_aliases.filter((value): value is string => typeof value === 'string')
    : [];
  return {
    id: String(row.id),
    name: String(row.name ?? row.hostname ?? 'Website'),
    hostname: typeof row.hostname === 'string' ? row.hostname : null,
    siteId,
    aliases,
  };
}

function installSnippet(siteId: string, consentMode: 'required' | 'granted') {
  const encoded = encodeURIComponent(siteId);
  return `<script
  src="https://salsysos.com/salsys-intelligence.js"
  data-salsys-site="${siteId}"
  data-endpoint="https://salsysos.com/api/events/browser/v1?site_id=${encoded}"
  data-consent-endpoint="https://salsysos.com/api/privacy/consent/v1?site_id=${encoded}"
  data-consent-mode="${consentMode}"
  data-form-mode="lead-only"${consentMode === 'granted' ? '\n  data-debug="true"' : ''}
  defer>
</script>${consentMode === 'required' ? `
<script
  src="https://salsysos.com/salsys-consent.js"
  data-consent-banner="auto"
  data-consent-settings="floating"
  defer>
</script>` : ''}`;
}

export function TrackerSnippet() {
  const [sources, setSources] = useState<WebsiteSource[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/tracking/sources', { cache: 'no-store' })
      .then((response) => response.json())
      .then((body) => {
        if (cancelled || !body?.ok || !Array.isArray(body.sources)) return;
        const websites = body.sources
          .map((row: unknown) =>
            row && typeof row === 'object' && !Array.isArray(row)
              ? sourceFromRow(row as Record<string, unknown>)
              : null,
          )
          .filter((source: WebsiteSource | null): source is WebsiteSource => Boolean(source));
        setSources(websites);
        setSelectedId((current) => current || websites[0]?.id || '');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(
    () => sources.find((source) => source.id === selectedId) ?? sources[0] ?? null,
    [selectedId, sources],
  );

  const snippet = useMemo(
    () => (selected ? installSnippet(selected.siteId, 'required') : ''),
    [selected],
  );

  const testSnippet = useMemo(
    () => (selected ? installSnippet(selected.siteId, 'granted') : ''),
    [selected],
  );

  async function copy(text: string) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  if (loading) {
    return <div className="mt-5 text-sm text-slate-500">Loading registered website IDs…</div>;
  }

  if (!selected) {
    return (
      <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm leading-6 text-slate-600">
        Register a website under <strong>Tracking Sources</strong> first. Salsys will generate a unique public Site ID and then provide the installation snippet here.
      </div>
    );
  }

  return (
    <div className="tracking-snippet mt-5 space-y-5">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <label className="text-xs font-semibold uppercase tracking-[.06em] text-slate-500">
          Registered website
          <select
            value={selected.id}
            onChange={(event) => setSelectedId(event.target.value)}
            className="mt-2 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-900"
          >
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.hostname ?? source.name} · {source.siteId}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-3 text-xs text-slate-500">
          Public Site ID: <code className="font-semibold text-slate-800">{selected.siteId}</code>. The ID is not a secret; Salsys verifies it against the canonical domain and its registered aliases.
        </div>
        {selected.aliases.length ? (
          <div className="mt-2 text-xs text-slate-500">
            Also valid on: <span className="font-medium text-slate-700">{selected.aliases.join(', ')}</span>
          </div>
        ) : null}
      </div>

      <div className="tracking-snippet-block">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="text-xs font-medium text-slate-400">
            Production snippet — Site ID + origin verified, consent required
          </div>

          <button
            type="button"
            onClick={() => copy(snippet)}
            className="tracking-copy-button btn-secondary !px-3 !py-2 text-xs"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        <pre className="tracking-code-block overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">
          <code>{snippet}</code>
        </pre>
      </div>

      <div className="tracking-snippet-block">
        <div className="mb-2 text-xs font-medium text-amber-600">
          Temporary controlled test snippet — do not use for normal production traffic
        </div>

        <pre className="tracking-code-block overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">
          <code>{testSnippet}</code>
        </pre>
      </div>
    </div>
  );
}
