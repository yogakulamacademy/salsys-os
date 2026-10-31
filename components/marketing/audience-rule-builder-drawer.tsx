'use client';

import { Filter, LockKeyhole, Search, ShieldCheck, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import styles from './audience-rule-builder-drawer.module.css';

type OptionPayload = {
  courses: string[];
  locations: string[];
  sources: string[];
  stages: string[];
  intents: string[];
  channels: string[];
  recencyDays: number[];
};

type PreviewPayload = {
  matchedLeads: number;
  matchedPeople: number;
  identityUnlinkedLeads: number;
  dataTruncated: boolean;
  readOnly: true;
  writesPerformed: 0;
  exportableIdentifiersReturned: false;
  sensitiveRuleRejected: boolean;
  reason?: string;
  breakdowns: Record<string, Array<{ label: string; count: number }>>;
};

type ApiPayload = { ok: boolean; error?: string; options?: OptionPayload; preview?: PreviewPayload | null };

type Filters = { course: string; location: string; stage: string; intent: string; source: string; channel: string; recency: string };

const EMPTY_FILTERS: Filters = { course: '', location: '', stage: '', intent: '', source: '', channel: '', recency: '' };

export function AudienceRuleBuilderDrawer() {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<OptionPayload | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || options) return;
    void fetchPreview(false);
  }, [open, options]);

  const hasFilters = useMemo(() => Object.values(filters).some(Boolean), [filters]);

  async function fetchPreview(includeFilters = true) {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (includeFilters) Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
    try {
      const response = await fetch(`/api/marketing/audiences/preview${params.size ? `?${params.toString()}` : ''}`, { method: 'GET', cache: 'no-store', credentials: 'same-origin' });
      const payload = await response.json() as ApiPayload;
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Unable to preview audience.');
      if (payload.options) setOptions(payload.options);
      setPreview(payload.preview ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to preview audience.');
    } finally {
      setLoading(false);
    }
  }

  function updateFilter(key: keyof Filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPreview(null);
  }

  function reset() {
    setFilters(EMPTY_FILTERS);
    setPreview(null);
    setError(null);
  }

  return (
    <div className={styles.builderWrap}>
      <button
        type="button"
        className={styles.launcher}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls="custom-audience-builder"
      >
        <Filter size={15} /> {open ? 'Hide custom audience' : '+ Custom audience'}
      </button>

      {open ? (
        <section id="custom-audience-builder" className={styles.panel} aria-label="Custom audience rule builder">
          <div className={styles.header}>
            <div>
              <div className={styles.eyebrow}>Custom Rule Builder</div>
              <h2>Preview a custom audience</h2>
              <p>Combine safe first-party CRM signals and preview aggregate matches before creating any membership.</p>
            </div>
            <button type="button" className={styles.closeButton} onClick={() => setOpen(false)} aria-label="Close custom audience builder"><X size={18} /></button>
          </div>

          <div className={styles.safetyBar}><ShieldCheck size={15} /><span>Read-only</span><span>0 writes</span><span>No identifiers returned</span></div>

          <div className={styles.body}>
            <div className={styles.grid}>
              <Select label="Course" value={filters.course} onChange={(value) => updateFilter('course', value)} options={options?.courses ?? []} empty="Any safe course" />
              <Select label="Location" value={filters.location} onChange={(value) => updateFilter('location', value)} options={options?.locations ?? []} empty="Any location" />
              <Select label="Stage" value={filters.stage} onChange={(value) => updateFilter('stage', value)} options={options?.stages ?? []} empty="Any stage" pretty />
              <Select label="Intent" value={filters.intent} onChange={(value) => updateFilter('intent', value)} options={options?.intents ?? []} empty="Any intent" pretty />
              <Select label="Acquisition source" value={filters.source} onChange={(value) => updateFilter('source', value)} options={options?.sources ?? []} empty="Any source" />
              <Select label="Lead channel" value={filters.channel} onChange={(value) => updateFilter('channel', value)} options={options?.channels ?? []} empty="Any channel" pretty />
              <Select label="Recency" value={filters.recency} onChange={(value) => updateFilter('recency', value)} options={(options?.recencyDays ?? []).map(String)} empty="Any time" format={(value) => `Last ${value} days`} />
            </div>

            <div className={styles.privacyNote}><LockKeyhole size={14} /><span>Pregnancy, medical, diagnosis, treatment and other sensitive categories are removed from options and rejected again server-side.</span></div>

            <div className={styles.actions}>
              <button type="button" className={styles.resetButton} onClick={reset} disabled={!hasFilters && !preview}>Reset</button>
              <button type="button" className={styles.previewButton} onClick={() => void fetchPreview(true)} disabled={!hasFilters || loading}><Search size={14} />{loading ? 'Previewing…' : 'Preview audience'}</button>
            </div>

            {error ? <div className={styles.error}>{error}</div> : null}
            {preview?.sensitiveRuleRejected ? <div className={styles.rejected}>This rule was blocked because it contains a sensitive audience category.</div> : null}
            {preview && !preview.sensitiveRuleRejected ? (
              <div className={styles.results}>
                <div className={styles.metrics}>
                  <Metric label="Matched people" value={preview.matchedPeople} />
                  <Metric label="Matched leads" value={preview.matchedLeads} />
                  <Metric label="Identity unlinked" value={preview.identityUnlinkedLeads} />
                </div>
                {preview.dataTruncated ? <div className={styles.warning}>Preview reached the 20,000-row safety ceiling.</div> : null}
                <div className={styles.breakdownGrid}>
                  <Breakdown title="Stage" rows={preview.breakdowns.stage ?? []} />
                  <Breakdown title="Source" rows={preview.breakdowns.source ?? []} />
                  <Breakdown title="Location" rows={preview.breakdowns.location ?? []} />
                </div>
                <div className={styles.resultFooter}>Aggregate preview only · writes performed: {preview.writesPerformed}</div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Select({ label, value, onChange, options, empty, pretty = false, format }: { label: string; value: string; onChange: (value: string) => void; options: string[]; empty: string; pretty?: boolean; format?: (value: string) => string }) {
  return <label className={styles.field}><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">{empty}</option>{options.map((option) => <option key={option} value={option}>{format ? format(option) : pretty ? prettify(option) : option}</option>)}</select></label>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className={styles.metric}><span>{label}</span><strong>{value.toLocaleString()}</strong></div>;
}

function Breakdown({ title, rows }: { title: string; rows: Array<{ label: string; count: number }> }) {
  return <div className={styles.breakdown}><h3>{title}</h3>{rows.length ? rows.slice(0, 5).map((row) => <div key={row.label} className={styles.breakdownRow}><span>{prettify(row.label)}</span><strong>{row.count.toLocaleString()}</strong></div>) : <p>No matches</p>}</div>;
}

function prettify(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}
