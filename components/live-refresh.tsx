'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const watchedTables = [
  'leads',
  'tasks',
  'messages',
  'activities',
  'lead_stage_history',
  'conversations',
];

const LIVE_ROUTE_PREFIXES = [
  '/dashboard',
  '/admissions',
  '/leads',
  '/pipeline',
  '/conversations',
  '/follow-ups',
];

const MIN_REFRESH_INTERVAL_MS = 15_000;
const EVENT_DEBOUNCE_MS = 1_000;

function supportsLiveRefresh(pathname: string) {
  return LIVE_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function LiveRefresh({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRefreshAt = useRef(Date.now());
  const [connected, setConnected] = useState(false);

  const routeEnabled = enabled && supportsLiveRefresh(pathname);

  useEffect(() => {
    if (!routeEnabled) {
      setConnected(false);
      return;
    }

    const supabase = createClient();
    const channel = supabase.channel(`crm-live-refresh:${pathname}`);

    const scheduleRefresh = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }

      if (timer.current) {
        clearTimeout(timer.current);
      }

      const elapsed = Date.now() - lastRefreshAt.current;
      const delay = Math.max(
        EVENT_DEBOUNCE_MS,
        MIN_REFRESH_INTERVAL_MS - elapsed,
      );

      timer.current = setTimeout(() => {
        if (document.visibilityState !== 'visible') {
          return;
        }

        lastRefreshAt.current = Date.now();
        router.refresh();
      }, delay);
    };

    for (const table of watchedTables) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        scheduleRefresh,
      );
    }

    channel.subscribe((status) => {
      setConnected(status === 'SUBSCRIBED');
    });

    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }

      setConnected(false);
      void supabase.removeChannel(channel);
    };
  }, [pathname, routeEnabled, router]);

  if (!routeEnabled) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 hidden items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-[11px] font-semibold text-slate-500 shadow-sm backdrop-blur lg:flex">
      <span
        className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-amber-400'}`}
      />
      {connected ? 'Live sync' : 'Connecting…'}
    </div>
  );
}
