'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, RotateCcw, Save } from 'lucide-react';
import { saveCrmSettingsBulkAction } from './actions';

export type ForecastConfig = {
  stage: string;
  probability_percent: number;
};
export type AgingConfig = {
  stage: string;
  warning_hours: number;
  stuck_hours: number;
};
type Source = 'database' | 'reference' | 'unavailable';
type AgingDraft = { warning: string; stuck: string };

const pretty = (name: string) => name.replaceAll('_',' ').replace(/\b\w/g, letter => letter.toUpperCase());
const fmt = (n: number) => String(Number(n.toFixed(2)));
const unit = (n: number) => n > 0 && n % 24 === 0
  ? (n / 24) + (n === 24 ? ' day' : ' days') : fmt(n) + ' h';

export function CrmRuleEditor({ forecasts, aging, source, agingReady, canManage }:{
  forecasts: ForecastConfig[];
  aging: AgingConfig[];
  source: Source;
  agingReady: boolean;
  canManage: boolean;
}) {
  const editable = canManage && source === 'database';
  const [probValues, setProbValues] = useState<Record<string,string>>(
    () => Object.fromEntries(forecasts.map(row => [row.stage, fmt(row.probability_percent)])),
  );
  const [agingValues, setAgingValues] = useState<Record<string,AgingDraft>>(
    () => Object.fromEntries(aging.map(row => [row.stage,{
      warning:fmt(row.warning_hours), stuck:fmt(row.stuck_hours),
    }])),
  );
  const [allStages, setAllStages] = useState(false);

  const result = useMemo(() => {
    const probabilities: {stage:string;old_percent:number;new_percent:number}[]=[];
    const agingChanges: {
      stage:string;old_warning_hours:number;old_stuck_hours:number;
      warning_hours:number;stuck_hours:number;
    }[]=[];
    let invalid = false;

    for (const row of forecasts) {
      const raw = probValues[row.stage] ?? '';
      const next = Number(raw);
      if (!raw.trim() || !Number.isFinite(next) || next < 0 || next > 100 ||
          Math.abs(Math.round(next * 100) - next * 100) > 0.000001) {
        invalid = true;
      } else if (next !== row.probability_percent) {
        probabilities.push({stage:row.stage,old_percent:row.probability_percent,new_percent:next});
      }
    }

    if (agingReady) {
      for (const row of aging) {
        const draft = agingValues[row.stage] || {warning:'',stuck:''};
        const warning = Number(draft.warning);
        const stuck = Number(draft.stuck);
        if (!draft.warning.trim() || !draft.stuck.trim() ||
            !Number.isFinite(warning) || !Number.isFinite(stuck) ||
            warning < 0 || stuck <= warning ||
            Math.abs(Math.round(warning * 100) - warning * 100) > 0.000001 ||
            Math.abs(Math.round(stuck * 100) - stuck * 100) > 0.000001) {
          invalid = true;
        } else if (warning !== row.warning_hours || stuck !== row.stuck_hours) {
          agingChanges.push({
            stage:row.stage, old_warning_hours:row.warning_hours,
            old_stuck_hours:row.stuck_hours, warning_hours:warning, stuck_hours:stuck,
          });
        }
      }
    }

    return {
      changes: {probabilities,aging:agingChanges},
      invalid,
      dirty: probabilities.length + agingChanges.length,
    };
  }, [forecasts, aging, agingReady, probValues, agingValues]);

  const reset = () => {
    setProbValues(Object.fromEntries(forecasts.map(row => [row.stage,fmt(row.probability_percent)])));
    setAgingValues(Object.fromEntries(aging.map(row => [row.stage,{
      warning:fmt(row.warning_hours),stuck:fmt(row.stuck_hours),
    }])));
  };

  return (
    <section className="cr-panel cr-pipeline" aria-labelledby="cr-pipeline-heading">
      <form action={saveCrmSettingsBulkAction} className="cr-editor-form">
        <div className="cr-panel-heading cr-editor-heading">
          <span className="cr-icon"><Save size={20}/></span>
          <div className="cr-flex"><h2 id="cr-pipeline-heading">Pipeline Configuration</h2>
            <p>Manage forecast planning weights and lead-aging thresholds together.</p></div>
          <div className="cr-editor-actions">
            <button type="button" className="cr-btn cr-btn-muted" onClick={reset}
              disabled={!editable || result.dirty === 0} aria-label="Reset unsaved pipeline changes">
              <RotateCcw size={13}/> Reset
            </button>
            <button type="submit" className="cr-btn cr-btn-primary" disabled={!editable || result.invalid || result.dirty === 0}>
              <CheckCircle2 size={15}/> Save Changes
            </button>
          </div>
        </div>
        <input type="hidden" name="changes_json" value={JSON.stringify(result.changes)}/>
        {source === 'reference' ? <div className="cr-mode-note" role="status">Reference defaults only · not tenant data. Saving is disabled.</div> : null}
        {source === 'unavailable' ? <div className="cr-editor-unavailable">
          <AlertTriangle size={20}/> Live forecast probabilities could not be verified, so no fallback values are presented as tenant configuration.
          Live pipeline-aging rules could not be verified. No thresholds are inferred from fallback defaults.
        </div> : <>
          {result.invalid && editable ? <p className="cr-validation" role="alert">
            Enter valid percentages (0–100) and thresholds. Stuck hours must be greater than warning hours.
          </p> : null}
          <div className="cr-editor-grid">
            <div className="cr-editor-column" aria-label="Stage probabilities">
              <h3>Stage probabilities</h3>
              <p>Weighted probabilities used in the Revenue Forecast, not observed conversion rates.</p>
              {forecasts.length ? <div className="cr-prob-list">
                {(allStages ? forecasts : forecasts.slice(0,7)).map(row => (
                  <label className="cr-prob-row" key={row.stage}>
                    <span className="cr-stage-name"><i aria-hidden="true"/>{pretty(row.stage)}</span>
                    <span className="cr-prob-field">
                      <input aria-label={pretty(row.stage)+' forecast probability'} type="number"
                        inputMode="decimal" min="0" max="100" step="0.01"
                        disabled={!editable} value={probValues[row.stage] ?? ''}
                        onChange={event => setProbValues(prev=>({...prev,[row.stage]:event.target.value}))}/>
                      <span aria-hidden="true">%</span>
                    </span>
                  </label>
                ))}
              </div> : <div className="cr-editor-unavailable">No forecast-stage configuration is recorded for this workspace.</div>}
              {forecasts.length > 7 ? <button type="button" className="cr-see-more" onClick={()=>setAllStages(prev=>!prev)}>
                {allStages?'Show fewer stages':'Show all '+forecasts.length+' stages'} <ChevronDown size={14}/>
              </button> : null}
            </div>
            <div className="cr-editor-column" aria-label="Aging thresholds">
              <h3>Aging thresholds</h3>
              <p>Warn when leads need attention, then flag stuck stages. Values are edited in hours.</p>
              {!agingReady ? <div className="cr-editor-unavailable">Aging schema not detected. Pipeline data has not been changed. Controls remain unavailable.</div>
                : aging.length ? <div className="cr-aging-list">
                  <div className="cr-aging-header"><span>Stage</span><span>Warning after</span><span>Stuck after</span></div>
                  {(allStages ? aging : aging.slice(0,7)).map(row => (
                    <div className="cr-aging-row" key={row.stage}>
                      <span className="cr-stage-name"><i aria-hidden="true"/>{pretty(row.stage)}</span>
                      <label>
                        <span className="sr-only">{pretty(row.stage)} warning hours</span>
                        <input aria-label={pretty(row.stage)+' warning hours'} type="number"
                          min="0" step="0.01" inputMode="decimal" disabled={!editable}
                          value={agingValues[row.stage]?.warning ?? ''}
                          onChange={event=>setAgingValues(prev=>({...prev,[row.stage]:{
                            ...prev[row.stage],warning:event.target.value,
                          }}))}/>
                        <small>{unit(row.warning_hours)} current</small>
                      </label>
                      <label>
                        <span className="sr-only">{pretty(row.stage)} stuck hours</span>
                        <input aria-label={pretty(row.stage)+' stuck hours'} type="number"
                          min="0.01" step="0.01" inputMode="decimal" disabled={!editable}
                          value={agingValues[row.stage]?.stuck ?? ''}
                          onChange={event=>setAgingValues(prev=>({...prev,[row.stage]:{
                            ...prev[row.stage],stuck:event.target.value,
                          }}))}/>
                        <small>{unit(row.stuck_hours)} current</small>
                      </label>
                    </div>
                  ))}
                </div> : <div className="cr-editor-unavailable">No aging rules are recorded for this workspace.</div>}
              {aging.length > 7 ? <button type="button" className="cr-see-more" onClick={()=>setAllStages(prev=>!prev)}>
                {allStages?'Show fewer rules':'Show all '+aging.length+' rules'} <ChevronDown size={14}/>
              </button> : null}
            </div>
          </div>
          <div className="cr-save-footnote" role="status">
            {editable ? result.dirty > 0 ? result.dirty+' unsaved change'+(result.dirty === 1?'':'s')
              : 'No unsaved changes' : 'Read-only — changes require a verified tenant and settings permission'}
            <span>Changes save in one transaction and are audited by stage. Reset restores loaded values.</span>
          </div>
        </>}
      </form>
    </section>
  );
}
