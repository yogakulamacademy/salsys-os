'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Beaker, Brain, Download, RefreshCw, Search, ShieldCheck, Swords } from 'lucide-react';

type Data = {
  competitors: any[];
  targets: any[];
  latest: any[];
  analyses: any[];
  recommendation_links: any[];
  rank_provider_configured: boolean;
  claude_configured: boolean;
};

export function SeoCompetitorIntelligence() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [domain, setDomain] = useState('');
  const [query, setQuery] = useState('');
  const [surface, setSurface] = useState<'seo'|'aeo'|'geo'>('seo');

  async function load() {
    setError('');
    const res = await fetch('/api/seo/competitors/v1', { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Unable to load competitor intelligence.');
    setData(json);
  }

  useEffect(() => { load().catch((e) => setError(e.message)); }, []);

  async function post(payload: Record<string, unknown>, key: string) {
    setBusy(key); setError('');
    try {
      const res = await fetch('/api/seo/competitors/v1', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.reason || 'Request failed.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Request failed.'); }
    finally { setBusy(''); }
  }

  async function addCompetitorSubmit(e: FormEvent) {
    e.preventDefault();
    await post({ action: 'add_competitor', domain }, 'competitor');
    setDomain('');
  }

  async function addTargetSubmit(e: FormEvent) {
    e.preventDefault();
    await post({ action: 'add_rank_target', query, surface, device: 'desktop', country_code: 'IN', locale: 'en-IN' }, 'target');
    setQuery('');
  }

  const latestAnalysis = data?.analyses?.[0];
  const recommendations = Array.isArray(latestAnalysis?.recommendations) ? latestAnalysis.recommendations : [];
  const linkedByIndex = new Map<number, any>(
    (data?.recommendation_links || [])
      .filter((link: any) => link.analysis_run_id === latestAnalysis?.id)
      .map((link: any) => [Number(link.recommendation_index), link]),
  );

  return (
    <div className="space-y-5">
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card-pad">
          <div className="flex items-center gap-2"><Swords size={17} className="text-brand"/><h2 className="font-semibold">Competitors</h2></div>
          <form onSubmit={addCompetitorSubmit} className="mt-4 flex gap-2">
            <input value={domain} onChange={(e)=>setDomain(e.target.value)} className="input" placeholder="competitor.com" required />
            <button className="btn-primary" disabled={busy==='competitor'}>{busy==='competitor'?'Adding…':'Add'}</button>
          </form>
          <div className="mt-4 space-y-2">
            {(data?.competitors || []).map((c) => <div key={c.id} className="rounded-xl border border-slate-100 px-3 py-2 text-sm"><div className="font-medium">{c.display_name || c.domain}</div><div className="text-xs text-slate-500">{c.domain} · {c.competitor_type}</div></div>)}
            {data && data.competitors.length===0 && <p className="text-sm text-slate-500">Add direct organic, commercial, content or AI-visibility competitors.</p>}
          </div>
        </section>

        <section className="card-pad">
          <div className="flex items-center gap-2"><Search size={17} className="text-brand"/><h2 className="font-semibold">SEO / AEO / GEO rank targets</h2></div>
          <form onSubmit={addTargetSubmit} className="mt-4 space-y-2">
            <div className="flex gap-2"><input value={query} onChange={(e)=>setQuery(e.target.value)} className="input" placeholder="e.g. 200 hour yoga teacher training india" required /><button className="btn-primary" disabled={busy==='target'}>Track</button></div>
            <div className="flex gap-2">{(['seo','aeo','geo'] as const).map((s)=><button type="button" key={s} onClick={()=>setSurface(s)} className={surface===s?'btn-primary':'btn-secondary'}>{s.toUpperCase()}</button>)}</div>
          </form>
          <div className="mt-4 text-xs text-slate-500">SEO = organic SERP position · AEO = answer/featured-result visibility · GEO = AI citation/visibility.</div>
        </section>
      </div>

      <section className="card-pad">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-semibold">Live ranking monitor</h2><p className="mt-1 text-xs text-slate-500">Real-time checks require a configured ranking data provider. Search Console remains useful for finalized historical SEO data.</p></div>
          <div className="flex gap-2"><span className={`badge ${data?.rank_provider_configured?'badge-green':'badge-gray'}`}>{data?.rank_provider_configured?'Rank provider ready':'Rank provider not configured'}</span></div>
        </div>
        <div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2">Surface</th><th>Query</th><th>Position</th><th>AEO</th><th>GEO citation</th><th>Observed</th><th></th></tr></thead><tbody>{(data?.latest||[]).map((r:any)=><tr key={r.target_id} className="border-b border-slate-100"><td className="py-3 font-medium">{String(r.surface).toUpperCase()}</td><td>{r.query}</td><td>{r.own_position ?? '—'}</td><td>{r.answer_visibility===true?'Visible':r.answer_visibility===false?'Not visible':'—'}</td><td>{r.ai_cited===true?'Cited':r.ai_cited===false?'Not cited':'—'}</td><td>{r.observed_at?new Date(r.observed_at).toLocaleString():'Never'}</td><td><button className="btn-secondary" disabled={!data?.rank_provider_configured || busy===r.target_id} onClick={()=>post({action:'check_rank',target_id:r.target_id},r.target_id)}><RefreshCw size={14}/>Check</button></td></tr>)}</tbody></table></div>
      </section>

      <section className="card-pad">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><div className="flex items-center gap-2"><Brain size={17} className="text-brand"/><h2 className="font-semibold">Claude competitor strategist</h2></div><p className="mt-1 text-xs text-slate-500">Claude analyzes only grounded rank observations and competitor evidence; it is not used as the source of ranking truth.</p></div>
          <button className="btn-primary" disabled={!data?.claude_configured || busy==='analyze'} onClick={()=>post({action:'analyze'},'analyze')}>{busy==='analyze'?'Analyzing…':'Analyze & recommend'}</button>
        </div>
        <div className="mt-4 space-y-3">
          {recommendations.slice(0,8).map((r:any,i:number)=>{
            const link = linkedByIndex.get(i);
            const actionBusy = busy === `experiment-${i}`;
            return <div key={i} className="rounded-xl border border-slate-100 p-4">
              <div className="flex flex-wrap gap-2"><span className="badge badge-blue">{String(r.surface||'seo').toUpperCase()}</span><span className="badge badge-gray">Priority {r.priority ?? '—'}</span><span className="badge badge-gray">{r.confidence || 'unknown'} confidence</span>{r.target_query && <span className="badge badge-gray">{r.target_query}</span>}</div>
              <div className="mt-2 font-semibold">{r.action || 'Recommended action'}</div>
              <p className="mt-1 text-sm text-slate-600">{r.why || ''}</p>
              {r.competitor_advantage && <p className="mt-2 text-xs text-slate-500"><strong>Competitor advantage:</strong> {r.competitor_advantage}</p>}
              {r.expected_signal && <p className="mt-1 text-xs text-slate-500"><strong>Expected signal:</strong> {r.expected_signal}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {link ? <>
                  <span className="badge badge-green"><Beaker size={12}/> Draft experiment created</span>
                  <a href="/seo" className="btn-secondary">Review experiment</a>
                </> : <button
                  className="btn-secondary"
                  disabled={actionBusy}
                  onClick={()=>post({ action:'create_draft_experiment', analysis_run_id: latestAnalysis.id, recommendation_index:i }, `experiment-${i}`)}
                ><Beaker size={14}/>{actionBusy?'Creating…':'Create draft experiment'}</button>}
                <span className="text-[11px] text-slate-400">No publishing occurs here. Human approval is still required.</span>
              </div>
            </div>;
          })}
          {data && !latestAnalysis && <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Add competitors and ranking observations, then run Claude analysis for grounded actions to outperform observed competitors.</div>}
        </div>
      </section>

      <section className="card-pad">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><ShieldCheck size={17}/><h2 className="font-semibold">Export report</h2></div><p className="mt-1 text-xs text-slate-500">Export current ranking evidence and analyzed recommendations.</p></div><div className="flex gap-2">{['pdf','csv','doc'].map((format)=><a key={format} href={`/api/seo/competitors/export?format=${format}`} className="btn-secondary"><Download size={14}/>{format.toUpperCase()}</a>)}</div></div>
      </section>
    </div>
  );
}
