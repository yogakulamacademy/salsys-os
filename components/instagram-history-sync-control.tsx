'use client';

import { useState } from 'react';

type HistorySummary = {
  ok?: boolean;
  error?: string;
  conversationsScanned?: number;
  conversationsMatched?: number;
  messagesSeen?: number;
  messagesImported?: number;
  messagesAlreadyPresent?: number;
  hasMore?: boolean;
  dryRun?: boolean;
};

export function InstagramHistorySyncControl({
  connectionId, enabled,
}: { connectionId: string; enabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<HistorySummary | null>(null);
  const [echoStatus, setEchoStatus] = useState<{ subscribed: boolean; fields: string[] } | null>(null);

  async function sync(apply: boolean, echoCheck = false) {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch('/api/instagram/history-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ connectionId, apply, mode: echoCheck ? 'echo_status' : 'history' }),
      });
      const result = await response.json().catch(() => ({})) as HistorySummary;
      if (echoCheck && response.ok && result.ok && typeof (result as { subscribed?: unknown }).subscribed === 'boolean') {
        setEchoStatus({
          subscribed: (result as { subscribed: boolean }).subscribed,
          fields: Array.isArray((result as { fields?: unknown }).fields) ?
            (result as { fields: string[] }).fields : [],
        });
        setSummary(null);
      } else {
        setSummary(response.ok ? result : {
          ok: false, error: result.error || 'Instagram synchronization verification failed.',
        });
      }
    } catch {
      setSummary({ ok: false, error: 'Could not reach Instagram history sync.' });
    } finally {
      setBusy(false);
    }
  }

  return <div className="aiu-historical" aria-live="polite">
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="aiu-secondary" disabled={busy} onClick={() => sync(false, true)}>
        Check outgoing-message sync
      </button>
      <button type="button" className="aiu-secondary" disabled={busy} onClick={() => sync(false)}>
        {busy ? 'Checking…' : 'Preview message history'}
      </button>
      {enabled && <button type="button" className="aiu-secondary" disabled={busy} onClick={() => sync(true)}>
        Sync next batch
      </button>}
    </div>
    {!enabled && <p>History import is awaiting Meta access verification. Preview is read-only.</p>}
    {echoStatus && <p>{echoStatus.subscribed ?
      'Meta confirms outgoing-message webhook subscription. A live echo test and server feature flag are still required.' :
      'Meta does not report the message_echoes subscription. App-sent messages cannot yet be confirmed as live-synced.'}
    </p>}
    {summary?.error && <p role="alert">{summary.error}</p>}
    {summary?.ok && <p>
      Conversations checked: {summary.conversationsScanned ?? 0}
      {' · '}Matching CRM threads: {summary.conversationsMatched ?? 0}
      {' · '}Messages available: {summary.messagesSeen ?? 0}
      {!summary.dryRun && (' · Imported: ' + (summary.messagesImported ?? 0) +
        ' · Already present: ' + (summary.messagesAlreadyPresent ?? 0))}
      {summary.hasMore ? ' · More conversations available' : ''}
    </p>}
  </div>;
}
