'use client';

import { useEffect, useRef, useState } from 'react';
import { KnowledgeImportUploadPanelReview } from './knowledge-import-upload-panel-review';
import { KnowledgeImportCentreReview } from './knowledge-import-centre-review';
import { createKnowledgeHistoryPollingReview, type KnowledgeHistorySnapshot } from '@/lib/knowledge-import-history-polling-review';

export function KnowledgeImportCentrePollingReview({ scopeKey }: { scopeKey: string }) {
  return <PollingView key={scopeKey} scopeKey={scopeKey}/>;
}

function PollingView({ scopeKey }: { scopeKey: string }) {
  const refresh = useRef<(() => void) | null>(null);
  const [{ snapshot, verified }, setView] = useState<{ snapshot: KnowledgeHistorySnapshot; verified: boolean }>({
    snapshot: { state: 'loading', rows: null }, verified: false,
  });

  useEffect(() => {
    let mounted = true;
    const poll = createKnowledgeHistoryPollingReview({
      origin: window.location.origin,
      scopeKey,
      emit: (value) => {
        if (!mounted) return;
        // Keep a selected file through a transient outage or hidden tab. Authorization loss clears it.
        setView((current) => ({
          snapshot: value,
          verified: value.state === 'ready' || (value.state !== 'denied' && current.verified),
        }));
      },
      visible: () => document.visibilityState === 'visible',
      setTimer: (fn, ms) => window.setTimeout(fn, ms),
      clearTimer: (id) => window.clearTimeout(id as number),
    });
    const visibility = () => poll.visibilityChanged();
    refresh.current = () => { void poll.refresh(); };
    document.addEventListener('visibilitychange', visibility);
    void poll.refresh();
    return () => {
      mounted = false;
      refresh.current = null;
      document.removeEventListener('visibilitychange', visibility);
      poll.stop();
    };
  }, [scopeKey]);

  return <KnowledgeImportCentreReview snapshot={snapshot} uploadControls={verified
    ? <KnowledgeImportUploadPanelReview scopeKey={scopeKey} disabled={snapshot.state !== 'ready'} onChanged={() => refresh.current?.()}/>
    : null}/>;
}
