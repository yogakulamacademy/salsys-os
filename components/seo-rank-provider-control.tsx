'use client';

import { useEffect, useState } from 'react';
import { Activity, Gauge, PlayCircle, ShieldCheck } from 'lucide-react';

type ControlData = {
  configured: boolean;
  settings: any | null;
  recent_health: any[];
};

export function SeoRankProviderControl() {
  const [data, setData] = useState<ControlData | null>(null);
  const [query, setQuery] = useState('200 hour yoga teacher training india');
  const [surface, setSurface] = useState<'seo'|'aeo'|'geo'>('seo');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setError('');
    const res = await fetch('/api/seo/competitors/provider/v1', { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Unable to load ranking provider controls.');
    setData(json);
    if (json.settings?.test_query) setQuery(json.settings.test_query);
  }

  useEffect(() => { load().catch((e) => setError(e.message)); }, []);

  async function post(payload: Record<string, unknown>, key: string) {
    setBusy(key); setError('');
    try {
      const res = await fetch('/api/seo/competitors/provider/v1', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Request failed.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed.');
    } finally {
      setBusy('');
    }
  }

  const settings = data?.settings;
  const last = data?.recent_health?.[0];
  const canEnable = Boolean(data?.configured && ['ok','degraded'].includes(String(settings?.last_health_status || '')));

  return (
    <section className="card-pad">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><Gauge size={17} className="text-brand"/><h2 className="font-semibold">Live ranking provider control</h2></div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Credentials stay server-side. This control only exposes readiness, surface permissions, rate budgets and health checks; it never returns provider secrets.</p>
        </div>
        <div className="flex gap-2">
          <span className={`badge ${data?.configured ? 'badge-green' : 'badge-gray'}`}>{data?.configured ? 'Credentials configured' : 'Credentials missing'}</span>
          <span className={`badge ${settings?.enabled ? 'badge-green' : 'badge-gray'}`}>{settings?.enabled ? 'Live worker enabled' : 'Live worker disabled'}</span>
        </div>
      </div>

      {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="text-xs text-slate-500">Minimum interval</div><div className="mt-1 font-semibold">{settings?.min_interval_minutes ?? 60} min</div></div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="text-xs text-slate-500">Hourly budget</div><div className="mt-1 font-semibold">{settings?.max_checks_per_hour ?? 20} checks</div></div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="text-xs text-slate-500">Daily budget</div><div className="mt-1 font-semibold">{settings?.max_checks_per_day ?? 200} checks</div></div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="text-xs text-slate-500">Last health</div><div className="mt-1 font-semibold">{settings?.last_health_status || 'Not tested'}</div><div className="mt-1 text-xs text-slate-400">{settings?.last_health_latency_ms != null ? `${settings.last_health_latency_ms} ms` : '—'}</div></div>
      </div>

      <div className="mt-5 rounded-xl border border-slate-100 p-4">
        <div className="flex items-center gap-2"><Activity size={16}/><div className="font-semibold">One-query normalization test</div></div>
        <p className="mt-1 text-xs text-slate-500">Tests the real provider response without creating a ranking snapshot. The result must match the SalsysOS SEO/AEO/GEO normalization contract before live checks are enabled.</p>
        <div className="mt-3 flex flex-col gap-2 lg:flex-row">
          <input className="input flex-1" value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Test query" />
          <div className="flex gap-2">{(['seo','aeo','geo'] as const).map((s)=><button type="button" key={s} onClick={()=>setSurface(s)} className={surface===s?'btn-primary':'btn-secondary'}>{s.toUpperCase()}</button>)}</div>
          <button className="btn-secondary" disabled={busy==='test' || !query.trim()} onClick={()=>post({action:'test_provider',surface,query,country_code:'IN',locale:'en-IN',device:'desktop'},'test')}><PlayCircle size={14}/>{busy==='test'?'Testing…':'Test provider'}</button>
        </div>
        {last && <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><strong>{String(last.surface).toUpperCase()}</strong> · {last.status} · normalized {last.normalized_ok ? 'yes' : 'no'} · {last.latency_ms ?? '—'} ms{last.error_category ? ` · ${last.error_category}` : ''}</div>}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-4">
        <div className="flex items-start gap-2"><ShieldCheck size={16} className="mt-0.5"/><div><div className="font-semibold">Controlled activation</div><p className="mt-1 text-xs text-slate-500">Activation requires server credentials plus a successful/degraded normalization test. Worker claims remain tenant-scoped and budget-limited.</p></div></div>
        <button className={settings?.enabled ? 'btn-secondary' : 'btn-primary'} disabled={busy==='toggle' || (!settings?.enabled && !canEnable)} onClick={()=>post({action:'save_settings',enabled:!settings?.enabled},'toggle')}>{busy==='toggle'?'Saving…':settings?.enabled?'Disable live checks':'Enable live checks'}</button>
      </div>
    </section>
  );
}
