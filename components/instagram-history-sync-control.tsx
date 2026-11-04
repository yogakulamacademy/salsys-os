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

  async function sync(apply: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch('/api/instagram/history-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ connectionId, apply }),
      });
      const result = await response.json().catch(() => ({})) as HistorySummary;
      setSummary(response.ok ? result : {
        ok: false, error: result.error || 'History synchronization is unavailable.',
      });
    } catch {
      setSummary({ ok: false, error: 'Could not reach Instagram history sync.' });
    } finally {
      setBusy(false);
    }
  }

  return <div className="aiu-historical" aria-live="polite">
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="aiu-secondary" disabled={busy} onClick={() => sync(false)}>
        {busy ? 'Checking…' : 'Preview message history'}
      </button>
      {enabled && <button type="button" className="aiu-secondary" disabled={busy} onClick={() => sync(true)}>
        Sync next batch
      </button>}
    </div>
    {!enabled && <p>History import is awaiting Meta access verification. Preview is read-only.</p>}
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
