"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bot } from "lucide-react";

type Alert = { leadId: string; name: string; reason: string; at: string | null };

/** Leads AI Autopilot handed to the team, refreshed every 60 seconds. */
export function useAiHandoverAlerts(active: boolean) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  useEffect(() => {
    if (!active) { setAlerts([]); return; }
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/ai/autopilot/alerts", { cache: "no-store", credentials: "same-origin" });
        const data = await res.json();
        if (alive && Array.isArray(data.alerts)) setAlerts(data.alerts.slice(0, 20));
      } catch { /* keep the last list */ }
    };
    void load();
    const timer = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(timer); };
  }, [active]);
  return alerts;
}

export function AiHandoverAlertsList({ alerts }: { alerts: Alert[] }) {
  if (!alerts.length) return null;
  return (
    <div className="border-b border-slate-100 px-1 pb-2 dark:border-slate-800">
      <div className="px-2 py-2 text-sm font-bold text-slate-900 dark:text-white">AI needs you</div>
      {alerts.slice(0, 5).map((alert) => (
        <Link key={alert.leadId} href={`/conversations?lead=${alert.leadId}`} className="flex items-start gap-3 rounded-xl px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-900">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-rose-50 text-rose-600"><Bot size={15} /></span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-bold text-slate-800 dark:text-slate-100">{alert.name}</span>
            <span className="block text-[10px] text-slate-500">{alert.reason}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}
