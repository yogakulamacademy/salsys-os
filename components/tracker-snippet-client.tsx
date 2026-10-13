'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

export type TrackerSnippetClientProps = {
  publicKey?: string | null;
  site?: string | null;
  legacyCompat?: boolean;
};

export function TrackerSnippetClient({
  publicKey,
  site,
  legacyCompat = false,
}: TrackerSnippetClientProps) {
  const [origin, setOrigin] = useState('https://your-crm-domain.com');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const key = publicKey?.trim() || '';
  const hostname = site?.trim() || 'your-domain.com';

  const snippet = useMemo(() => {
    const keyedCollect = key
      ? `${origin}/api/tracking/collect?salsys_key=${encodeURIComponent(key)}`
      : `${origin}/api/tracking/collect`;

    const keyedConsent = key
      ? `${origin}/api/tracking/consent?salsys_key=${encodeURIComponent(key)}`
      : `${origin}/api/tracking/consent`;

    return `<script
  src="${origin}/salsys.js"
  data-key="${key || 'pk_live_your_publishable_key'}"
  data-endpoint="${keyedCollect}"
  data-consent-endpoint="${keyedConsent}"
  data-site="${hostname}"
  data-consent-mode="required"${legacyCompat ? '\n  data-legacy-compat="true"' : ''}
  defer>
</script>`;
  }, [hostname, key, legacyCompat, origin]);

  const testSnippet = useMemo(() => {
    const keyedCollect = key
      ? `${origin}/api/tracking/collect?salsys_key=${encodeURIComponent(key)}`
      : `${origin}/api/tracking/collect`;

    const keyedConsent = key
      ? `${origin}/api/tracking/consent?salsys_key=${encodeURIComponent(key)}`
      : `${origin}/api/tracking/consent`;

    return `<script
  src="${origin}/salsys.js"
  data-key="${key || 'pk_test_your_publishable_key'}"
  data-endpoint="${keyedCollect}"
  data-consent-endpoint="${keyedConsent}"
  data-site="${hostname}"
  data-consent-mode="granted"${legacyCompat ? '\n  data-legacy-compat="true"' : ''}
  data-debug="true"
  defer>
</script>`;
  }, [hostname, key, legacyCompat, origin]);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="tracking-snippet mt-5 space-y-5">
      {!key ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
          No active website tracking key is configured for this workspace yet.
          The snippet below is a template and will not authorize production
          events until a workspace publishable key is created.
        </div>
      ) : null}

      <div className="tracking-snippet-block">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="text-xs font-medium text-slate-400">
            Production snippet — consent required
          </div>

          <button
            type="button"
            onClick={() => copy(snippet)}
            className="tracking-copy-button btn-secondary !px-3 !py-2 text-xs"
            disabled={!key}
            title={!key ? 'Create a workspace tracking key first' : undefined}
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
          Temporary testing snippet — use while diagnosing
        </div>

        <pre className="tracking-code-block overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">
          <code>{testSnippet}</code>
        </pre>
      </div>
    </div>
  );
}
