'use client';

import { useState } from 'react';

import {
  parseInstagramHistoryPreview,
  type InstagramHistoryPreview as Preview,
} from '@/lib/integrations/instagram-history-preview-validation';

type ConnectedAccount = { id: string; label: string };
type State =
  | { status: 'checking' }
  | { status: 'unavailable' }
  | { status: 'observed'; checkedAt: string; report: Preview };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Owner/admin-only preview surface. Invokes only the existing bounded Graph
 * Conversations GET path. It never requests import, sends a DM, sets a cursor,
 * changes a flag or activates the retry scheduler.
 */
export function InstagramHistoryPreview({ connections }: {
  connections: ConnectedAccount[];
}) {
  const [states, setStates] = useState<Record<string, State>>({});

  async function preview(connectionId: string) {
    if (!UUID.test(connectionId) || states[connectionId]?.status === 'checking') return;
    setStates(previous => ({ ...previous, [connectionId]: { status: 'checking' } }));
    try {
      const response = await fetch('/api/instagram/history-sync', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId, mode: 'history_preview', apply: false }),
      });
      if (!response.ok) throw new Error('Provider history unavailable');
      const payload: unknown = await response.json().catch(() => null);
      const report = parseInstagramHistoryPreview(payload);
      setStates(previous => ({
        ...previous,
        [connectionId]: { status: 'observed', checkedAt: new Date().toISOString(), report },
      }));
    } catch {
      setStates(previous => ({ ...previous, [connectionId]: { status: 'unavailable' } }));
    }
  }

  if (connections.length === 0) {
    return <p className="mt-3 text-xs text-copy-muted">No connected Instagram account was found for this workspace.</p>;
  }

  return (
    <div className="mt-3 space-y-3" aria-live="polite">
      {connections.map(connection => {
        const state = states[connection.id];
        return <div key={connection.id} className="rounded-lg border border-line p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-copy">{connection.label}</p>
            <button
              type="button"
              className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-copy disabled:opacity-50"
              disabled={state?.status === 'checking'}
              onClick={() => void preview(connection.id)}
            >
              {state?.status === 'checking' ? 'Checking history…' : 'Preview history (read-only)'}
            </button>
          </div>
          {!state ? (
            <p className="mt-2 text-xs text-copy-muted">No provider history preview checked in this session.</p>
          ) : state.status === 'checking' ? (
            <p className="mt-2 text-xs text-copy-muted">Checking a bounded sample from Meta's Conversations API.</p>
          ) : state.status === 'unavailable' ? (
            <p role="alert" className="mt-2 text-xs text-copy-muted">
              Provider history preview unavailable. Access, coverage and completeness remain unknown.
            </p>
          ) : (
            <div className="mt-2 space-y-1 text-xs text-copy-muted">
              <p>Provider conversations examined: {state.report.conversationsScanned} (maximum 1).</p>
              <p>Matched to an existing CRM thread: {state.report.conversationsMatched}.</p>
              <p>Provider messages examined: {state.report.messagesSeen} (maximum 20).</p>
              <p>Distinct outbound provider messages in this sample: {state.report.outboundMessagesSeen}.</p>
              <p>Outbound provider IDs matched in the existing CRM thread: {state.report.outboundMessagesMatched}.</p>
              <p>Sampled outbound provider IDs without a match in that CRM thread: {state.report.outboundMessagesNotInCrm}.</p>
              <p>Skipped or unmatched items: {state.report.messagesSkipped}.</p>
              <p>Additional provider conversation pages reported: {state.report.hasMore ? 'Yes' : 'No / not reported'}.</p>
              <p>Checked {new Date(state.checkedAt).toLocaleString()}.</p>
              <p>
                This is a read-only sample, not a full sync. An unmatched outbound sample is
                a review candidate, not proof a message is lost; zero unmatched samples do not
                prove complete history. Provider direction and existing CRM thread identity are
                checked before comparison. No messages were imported, sent, or modified.
              </p>
            </div>
          )}
        </div>;
      })}
    </div>
  );
}
