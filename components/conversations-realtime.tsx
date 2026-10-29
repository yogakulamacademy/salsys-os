'use client';

import { AlertTriangle, RefreshCw, Wifi } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { createClient } from '@/lib/supabase/browser';
import { InstagramOutboundBridge } from '@/components/instagram-outbound-bridge';

type RealtimeMessage = {
  id?: string;
  lead_id?: string;
  conversation_id?: string;
  direction?: string;
  body?: string;
  created_at?: string;
};

type RealtimeState = 'connecting' | 'live' | 'reconnecting' | 'paused';

const MIN_REFRESH_INTERVAL_MS = 5_000;

export function ConversationsRealtime() {
  const router = useRouter();
  const [realtimeState, setRealtimeState] = useState<RealtimeState>('connecting');
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let lastRefreshAt = 0;
    let disposed = false;

    setRealtimeState('connecting');

    const refreshInbox = () => {
      if (document.visibilityState !== 'visible' || refreshTimer) return;

      const elapsed = Date.now() - lastRefreshAt;
      const delay = Math.max(0, MIN_REFRESH_INTERVAL_MS - elapsed);

      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        if (document.visibilityState !== 'visible') return;
        lastRefreshAt = Date.now();
        router.refresh();
      }, delay);
    };

    const channel = supabase
      .channel('crm-conversations-live')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload: unknown) => {
          const event = payload as { new?: RealtimeMessage };
          const message = event.new;
          if (!message || message.direction === 'outbound') return;

          window.dispatchEvent(
            new CustomEvent('crm:conversation-inbound', {
              detail: { leadId: message.lead_id ?? null },
            }),
          );
          refreshInbox();
        },
      )
      .subscribe((status) => {
        if (disposed) return;

        if (status === 'SUBSCRIBED') {
          setRealtimeState('live');
          return;
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setRealtimeState('reconnecting');
          return;
        }

        if (status === 'CLOSED') {
          setRealtimeState('paused');
        }
      });

    return () => {
      disposed = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [retryToken, router]);

  return (
    <>
      <div className="flex min-h-7 items-center justify-end" aria-live="polite">
        <div
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
            realtimeState === 'live'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : realtimeState === 'connecting'
                ? 'border-slate-200 bg-slate-50 text-slate-600'
                : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}
        >
          {realtimeState === 'live' ? (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Live updates
            </>
          ) : realtimeState === 'connecting' ? (
            <>
              <RefreshCw size={11} className="animate-spin" />
              Connecting live updates
            </>
          ) : (
            <>
              {realtimeState === 'paused' ? (
                <AlertTriangle size={11} />
              ) : (
                <Wifi size={11} />
              )}
              {realtimeState === 'paused'
                ? 'Live updates paused'
                : 'Reconnecting live updates'}
              <button
                type="button"
                onClick={() => setRetryToken((value) => value + 1)}
                className="ml-1 rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[10px] font-bold text-amber-800 transition hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30"
              >
                Retry
              </button>
            </>
          )}
        </div>
      </div>
      <InstagramOutboundBridge />
    </>
  );
}
