'use client';

import { useEffect } from 'react';
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

const MIN_REFRESH_INTERVAL_MS = 5_000;

export function ConversationsRealtime() {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let lastRefreshAt = 0;
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

    // Webhook updates that arrive while the tab is hidden are intentionally
    // not rendered immediately. Refresh when the operator returns, rather
    // than leaving the inbox stale until another message arrives.
    const refreshOnVisibility = () => {
      if (document.visibilityState === 'visible') refreshInbox();
    };
    document.addEventListener('visibilitychange', refreshOnVisibility);
    window.addEventListener('focus', refreshInbox);
    window.addEventListener('online', refreshInbox);

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
          if (!message) return;
          if (message.direction === 'inbound') {
            window.dispatchEvent(
              new CustomEvent('crm:conversation-inbound', {
                detail: { leadId: message.lead_id ?? null },
              }),
            );
          }
          // Outbound messages also change latest-conversation-activity sorting.
          refreshInbox();
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'leads' },
        () => refreshInbox(),
      )
      .subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      document.removeEventListener('visibilitychange', refreshOnVisibility);
      window.removeEventListener('focus', refreshInbox);
      window.removeEventListener('online', refreshInbox);
      void supabase.removeChannel(channel);
    };
  }, [router]);

  // Realtime refresh, inbound events and Instagram outbound integration stay
  // active. The connection status badge must not reserve space above Inbox.
  return <InstagramOutboundBridge />;
}
