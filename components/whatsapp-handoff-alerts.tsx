'use client';
import { toast } from '@/lib/toast';
import { useFeedbackMessages } from '@/components/use-feedback-messages';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MessageSquareText } from 'lucide-react';

type HandoffAlert = {
  id: string;
  leadId: string;
  taskId: string;
  createdAt: string;
};

type AlertFeed = {
  alerts: HandoffAlert[];
  enabled: boolean;
  available: boolean;
};

const EMPTY: AlertFeed = { alerts: [], enabled: false, available: true };

/**
 * Authenticated, recipient-only feed; use a 25-second bounded refresh rather
 * than a public Realtime topic or an unaudited WhatsApp/email notification.
 * The first disabled response prevents polling when the staging feature is OFF.
 */
export function useWhatsAppHandoffAlerts(active: boolean) {
  const [feed, setFeed] = useState<AlertFeed>(EMPTY);
  useFeedbackMessages(active && feed.enabled && !feed.available ? 'Handoff alerts could not be loaded. Please refresh the page.' : null);

  useEffect(() => {
    if (!active) {
      setFeed(EMPTY);
      return;
    }
    let mounted = true;
    let interval: ReturnType<typeof setInterval> | null = null;
    const refresh = async () => {
      try {
        const response = await fetch('/api/whatsapp/handoff-alerts', {
          method: 'GET',
          cache: 'no-store',
          credentials: 'same-origin',
        });
        const data = await response.json();
        if (!mounted) return false;
        if (data.enabled === false) {
          setFeed(EMPTY);
          return false;
        }
        if (!response.ok || !Array.isArray(data.alerts)) {
          setFeed({ enabled: true, available: false, alerts: [] });
          return true;
        }
        const alerts = data.alerts.filter((row: unknown): row is HandoffAlert => {
          if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
          const value = row as Record<string, unknown>;
          return typeof value.id === 'string' &&
            typeof value.leadId === 'string' &&
            typeof value.taskId === 'string' &&
            typeof value.createdAt === 'string';
        }).slice(0, 20);
        setFeed({ enabled: true, available: true, alerts });
        return true;
      } catch {
        if (mounted) setFeed({ enabled: true, available: false, alerts: [] });
        return true;
      }
    };
    void refresh().then((enabled) => {
      if (mounted && enabled) interval = setInterval(() => { void refresh(); }, 25_000);
    });
    return () => {
      mounted = false;
      if (interval) clearInterval(interval);
    };
  }, [active]);

  const acknowledge = async (id: string) => {
    try {
      const response = await fetch('/api/whatsapp/handoff-alerts', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId: id }),
      });
      if (!response.ok) { toast.error("Couldn’t acknowledge the alert. Please retry."); return; }
      const result = await response.json();
      if (result.ok === true) {
        toast.success("Handoff alert acknowledged.");
        setFeed((current) => ({
          ...current,
          alerts: current.alerts.filter((item) => item.id !== id),
        }));
      }
    } catch {
      toast.error("Couldn’t acknowledge the alert. Please retry.");
      // Keep the alert visible for a retry; do not claim acknowledgement.
    }
  };

  return { ...feed, count: feed.alerts.length, acknowledge };
}

export function WhatsAppHandoffAlertsList({
  alerts,
  enabled,
  available,
  acknowledge,
}: {
  alerts: HandoffAlert[];
  enabled: boolean;
  available: boolean;
  acknowledge: (id: string) => Promise<void>;
}) {
  if (!enabled) return null;
  return (
    <div className="mb-2 border-b border-slate-100 pb-2 dark:border-slate-800">
      <div className="px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-100">
        Assigned WhatsApp reviews
      </div>
      {!available ? (
        <p className="px-3 pb-2 text-xs text-amber-700">
          Staff alerts are currently unavailable. Check Tasks &amp; Follow-ups.
        </p>
      ) : alerts.length === 0 ? (
        <p className="px-3 pb-2 text-xs text-slate-500">
          No unread human-support assignments.
        </p>
      ) : alerts.map((alert) => (
        <div key={alert.id} className="flex items-center gap-2 px-3 py-2">
          <Link
            href={`/conversations?lead=${encodeURIComponent(alert.leadId)}`}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg text-xs text-slate-700 hover:text-violet-700 dark:text-slate-200"
          >
            <MessageSquareText size={15} className="shrink-0 text-violet-600" />
            <span>
              <strong className="block">Human review assigned</strong>
              <span className="text-[10px] text-slate-500">
                Open the customer conversation
              </span>
            </span>
          </Link>
          <button
            type="button"
            className="shrink-0 rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
            onClick={() => { void acknowledge(alert.id); }}
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}
