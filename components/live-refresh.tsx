'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type LiveRouteConfig = {
  prefixes: string[];
  tables: string[];
};

/*
 * Keep the generic refresh fallback intentionally small and route-scoped.
 * Specialized screens (for example Conversations message delivery/status)
 * can own their own local realtime updates without subscribing to every CRM
 * table or forcing duplicate route refreshes.
 */
const LIVE_ROUTE_CONFIG: LiveRouteConfig[] = [
  {
    prefixes: ['/dashboard'],
    tables: [
      'leads',
      'tasks',
      'messages',
      'activities',
      'lead_stage_history',
      'conversations',
    ],
  },
  {
    prefixes: ['/admissions', '/leads', '/pipeline'],
    tables: ['leads', 'tasks', 'activities', 'lead_stage_history'],
  },
  {
    prefixes: ['/follow-ups'],
    tables: ['tasks', 'leads', 'activities'],
  },
  {
    // Message INSERT/UPDATE handling on the selected thread is specialized.
    // The generic listener only keeps conversation-level server data fresh.
    prefixes: ['/conversations'],
    tables: ['conversations', 'leads', 'activities'],
  },
];

const MIN_REFRESH_INTERVAL_MS = 3_000;
const EVENT_DEBOUNCE_MS = 350;

function routeTables(pathname: string) {
  const match = LIVE_ROUTE_CONFIG.find((config) =>
    config.prefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    ),
  );

  return match?.tables ?? [];
}

export function LiveRefresh({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRefreshAt = useRef(Date.now());
  const refreshQueuedWhileHidden = useRef(false);
  const [connected, setConnected] = useState(false);

  const tables = useMemo(() => routeTables(pathname), [pathname]);
  const tableKey = tables.join('|');
  const routeEnabled = enabled && tables.length > 0;

  useEffect(() => {
    if (!routeEnabled) {
      setConnected(false);
      return;
    }

    const supabase = createClient();
    const channel = supabase.channel(`crm-live-refresh:${pathname}`);

    const performRefresh = () => {
      if (document.visibilityState !== 'visible') {
        refreshQueuedWhileHidden.current = true;
        return;
      }

      refreshQueuedWhileHidden.current = false;
      lastRefreshAt.current = Date.now();
      router.refresh();
    };

    const scheduleRefresh = () => {
      if (document.visibilityState !== 'visible') {
        refreshQueuedWhileHidden.current = true;
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
        timer.current = null;
        performRefresh();
      }, delay);
    };

    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        refreshQueuedWhileHidden.current
      ) {
        performRefresh();
      }
    };

    for (const table of tables) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        scheduleRefresh,
      );
    }

    channel.subscribe((status) => {
      setConnected(status === 'SUBSCRIBED');
    });

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }

      document.removeEventListener('visibilitychange', handleVisibilityChange);
      setConnected(false);
      void supabase.removeChannel(channel);
    };
  }, [pathname, routeEnabled, router, tableKey]);

  if (!routeEnabled) {
    return null;
  }

  return (
    <div
      className="fixed bottom-4 right-4 z-50 hidden items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-[11px] font-semibold text-slate-500 shadow-sm backdrop-blur lg:flex"
      title="Realtime status for CRM records only. This does not indicate WhatsApp connection or message delivery status."
      aria-label={connected ? 'CRM realtime connected' : 'CRM realtime reconnecting'}
    >
      <span
        className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-amber-400'}`}
        aria-hidden="true"
      />
      {connected ? 'CRM realtime' : 'CRM reconnecting…'}
    </div>
  );
}
