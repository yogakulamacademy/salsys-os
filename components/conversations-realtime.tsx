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
          refreshInbox();
        },
      )
      .subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [router]);

  return <InstagramOutboundBridge />;
}
