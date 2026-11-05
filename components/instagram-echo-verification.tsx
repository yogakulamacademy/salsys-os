'use client';

import { useState } from 'react';

type ConnectedAccount = { id: string; label: string };
type Evidence = {
  state: 'checking' | 'observed' | 'unavailable';
  fields: string[];
  checkedAt: string | null;
};
type ProviderResult = {
  ok?: unknown;
  subscribed?: unknown;
  fields?: unknown;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELD = /^[a-z_]{2,50}$/;

/**
 * On-demand read-only Meta check. It never requests history import, sends a DM,
 * subscribes accounts, or enables the Instagram echo parser.
 * A subscription snapshot alone is NOT evidence that echoes reach the CRM.
 */
export function InstagramEchoVerification({ connections }: {
  connections: ConnectedAccount[];
}) {
  const [results, setResults] = useState<Record<string, Evidence>>({});

  async function check(connectionId: string) {
    if (!UUID.test(connectionId) || results[connectionId]?.state === 'checking') return;
    setResults(previous => ({
      ...previous,
      [connectionId]: { state: 'checking', fields: [], checkedAt: null },
    }));

    try {
      const response = await fetch('/api/instagram/history-sync', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId, mode: 'echo_status', apply: false }),
      });
      const payload = (await response.json().catch(() => null)) as ProviderResult | null;
      if (!response.ok || !payload || payload.ok !== true ||
          typeof payload.subscribed !== 'boolean' || !Array.isArray(payload.fields) ||
          payload.fields.length > 40 ||
          !payload.fields.every(field => typeof field === 'string' && FIELD.test(field))) {
        throw new Error('Unable to verify provider subscription.');
      }
      const fields = Array.from(new Set(payload.fields as string[])).sort();
      if (payload.subscribed !== fields.includes('message_echoes')) {
        throw new Error('Conflicting provider subscription response.');
      }
      setResults(previous => ({
        ...previous,
        [connectionId]: { state: 'observed', fields, checkedAt: new Date().toISOString() },
      }));
    } catch {
      setResults(previous => ({
        ...previous,
        [connectionId]: { state: 'unavailable', fields: [], checkedAt: null },
      }));
    }
  }

  if (connections.length === 0) {
    return <p className="mt-3 text-xs text-copy-muted">
      No connected Instagram account was found for this workspace.
    </p>;
  }

  return <div className="mt-3 space-y-3" aria-live="polite">
    {connections.map(connection => {
      const result = results[connection.id];
      const hasEchoes = result?.fields.includes('message_echoes') ?? false;
      const hasMessages = result?.fields.includes('messages') ?? false;
      return <div key={connection.id} className="rounded-lg border border-line p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-copy">{connection.label}</p>
          <button
            type="button"
            className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-copy disabled:opacity-50"
            disabled={result?.state === 'checking'}
            onClick={() => void check(connection.id)}
          >
            {result?.state === 'checking' ? 'Checking Meta…' : 'Check Meta subscription'}
          </button>
        </div>
        {!result ? (
          <p className="mt-2 text-xs text-copy-muted">Not yet checked in this session.</p>
        ) : result.state === 'checking' ? (
          <p className="mt-2 text-xs text-copy-muted">Checking the connected account's current Meta subscription.</p>
        ) : result.state === 'unavailable' ? (
          <p role="alert" className="mt-2 text-xs text-copy-muted">
            Provider status unavailable. No conclusion about subscription or delivery can be made.
          </p>
        ) : (
          <div className="mt-2 space-y-1 text-xs text-copy-muted">
            <p>
              {hasEchoes
                ? 'Meta lists a separate message_echoes field for this application.'
                : hasMessages
                  ? 'Meta lists messages for this application; no separate message_echoes field is listed.'
                  : 'Meta lists neither messages nor message_echoes for this application.'}
            </p>
            <p>
              {hasMessages ? 'Incoming messages field: listed.' : 'Incoming messages field: not listed.'}
              {' '}Separate message_echoes field: {hasEchoes ? 'listed' : 'not listed'}.
            </p>
            <p className="break-words">Provider fields: {result.fields.join(', ') || 'none returned'}</p>
            <p>Checked {result.checkedAt ? new Date(result.checkedAt).toLocaleString() : 'just now'}.</p>
            <p>
              {hasMessages || hasEchoes
                ? 'Depending on the Instagram integration, outbound events may arrive through messages with message.is_echo=true. A missing separate message_echoes field alone cannot prove echo delivery is unavailable.'
                : 'No relevant messaging field is listed. Check the Meta app and account configuration before attempting live acceptance.'}
            </p>
            <p>Subscription metadata does not prove signed webhook delivery, a matching CRM thread, or native-app echo capture. A controlled, authorized live-message test is still required before activation.</p>
          </div>
        )}
      </div>;
    })}
  </div>;
}
