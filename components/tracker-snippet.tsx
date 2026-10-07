'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

export function TrackerSnippet() {
  const [origin, setOrigin] = useState('https://your-crm-domain.com');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const snippet = useMemo(
    () => `<script
  src="${origin}/yogakulam-tracker.js"
  data-endpoint="${origin}/api/tracking/collect"
  data-consent-endpoint="${origin}/api/tracking/consent"
  data-site="yogakulamacademy.com"
  data-consent-mode="required"
  defer>
</script>`,
    [origin],
  );

  const testSnippet = useMemo(
    () => `<script
  src="${origin}/yogakulam-tracker.js"
  data-endpoint="${origin}/api/tracking/collect"
  data-consent-endpoint="${origin}/api/tracking/consent"
  data-site="yogakulamacademy.com"
  data-consent-mode="granted"
  data-debug="true"
  defer>
</script>`,
    [origin],
  );

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
      <div className="tracking-snippet-block">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="text-xs font-medium text-slate-400">
            Production snippet â€” consent required
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
          Temporary testing snippet â€” use in GTM while diagnosing
        </div>

        <pre className="tracking-code-block overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">
          <code>{testSnippet}</code>
        </pre>
      </div>
    </div>
  );
}
