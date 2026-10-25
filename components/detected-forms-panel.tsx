'use client';

import { CheckCircle2, EyeOff, FormInput, RefreshCw, Settings2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

type WebsiteSource = {
  id: string;
  name: string;
  hostname: string | null;
  siteId: string;
};

type DetectedField = {
  selector: string;
  name: string | null;
  type: string;
  label: string | null;
  required: boolean;
};

type DetectedForm = {
  id: string;
  form_key: string;
  form_name: string | null;
  page_path: string;
  form_action: string | null;
  method: string;
  status: 'detected' | 'enabled' | 'ignored';
  lead_capture_enabled: boolean;
  field_inventory: DetectedField[];
  field_mapping: Record<string, string>;
  first_seen_at: string;
  last_seen_at: string;
  metadata: Record<string, unknown>;
};

const CANONICAL_FIELDS = [
  ['firstName', 'Name'],
  ['lastName', 'Last name'],
  ['email', 'Email'],
  ['phone', 'Phone'],
  ['country', 'Country'],
  ['courseCode', 'Course / product'],
  ['message', 'Message'],
] as const;

function sourceFromRow(row: Record<string, unknown>): WebsiteSource | null {
  if (row.source_type !== 'website' || row.status !== 'active') return null;
  const metadata =
    row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  if (metadata.merged_alias === true) return null;
  const siteId = typeof metadata.public_site_id === 'string' ? metadata.public_site_id : '';
  if (!siteId) return null;
  return {
    id: String(row.id),
    name: String(row.name ?? row.hostname ?? 'Website'),
    hostname: typeof row.hostname === 'string' ? row.hostname : null,
    siteId,
  };
}

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function fieldLabel(field: DetectedField) {
  return field.label || field.name || field.selector;
}

function statusClasses(status: DetectedForm['status']) {
  if (status === 'enabled') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'ignored') return 'border-slate-200 bg-slate-100 text-slate-500';
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

export function DetectedFormsPanel() {
  const [sources, setSources] = useState<WebsiteSource[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [forms, setForms] = useState<DetectedForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState('');
  const [expandedId, setExpandedId] = useState('');
  const [draftMappings, setDraftMappings] = useState<Record<string, Record<string, string>>>({});

  useEffect(() => {
    let cancelled = false;
    fetch('/api/tracking/sources', { cache: 'no-store' })
      .then((response) => response.json())
      .then((body) => {
        if (cancelled || !body?.ok || !Array.isArray(body.sources)) return;
        const websites = body.sources
          .map((row: unknown) =>
            row && typeof row === 'object' && !Array.isArray(row)
              ? sourceFromRow(row as Record<string, unknown>)
              : null,
          )
          .filter((source: WebsiteSource | null): source is WebsiteSource => Boolean(source));
        setSources(websites);
        setSelectedSiteId((current) => current || websites[0]?.siteId || '');
      })
      .catch(() => setError('Unable to load registered websites.'));
    return () => {
      cancelled = true;
    };
  }, []);

  const loadForms = useCallback(async () => {
    if (!selectedSiteId) {
      setForms([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await fetch(
        `/api/tracking/forms?site_id=${encodeURIComponent(selectedSiteId)}`,
        { cache: 'no-store' },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.ok || !Array.isArray(body.forms)) {
        throw new Error(typeof body?.error === 'string' ? body.error : 'Unable to load detected forms.');
      }
      const nextForms = body.forms as DetectedForm[];
      setForms(nextForms);
      setDraftMappings(
        Object.fromEntries(
          nextForms.map((form) => [form.id, { ...(form.field_mapping || {}) }]),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load detected forms.');
    } finally {
      setLoading(false);
    }
  }, [selectedSiteId]);

  useEffect(() => {
    loadForms();
  }, [loadForms]);

  const selectedSource = useMemo(
    () => sources.find((source) => source.siteId === selectedSiteId) ?? null,
    [selectedSiteId, sources],
  );

  async function saveForm(
    form: DetectedForm,
    options: { status?: DetectedForm['status']; enabled?: boolean } = {},
  ) {
    setSavingId(form.id);
    setError('');
    try {
      const enabled = options.enabled ?? form.lead_capture_enabled;
      const response = await fetch('/api/tracking/forms', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: form.id,
          status: options.status ?? (enabled ? 'enabled' : form.status),
          leadCaptureEnabled: enabled,
          fieldMapping: draftMappings[form.id] ?? form.field_mapping ?? {},
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.ok || !body.form) {
        throw new Error(typeof body?.error === 'string' ? body.error : 'Unable to save form configuration.');
      }
      const updated = body.form as DetectedForm;
      setForms((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setDraftMappings((current) => ({ ...current, [updated.id]: { ...(updated.field_mapping || {}) } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save form configuration.');
    } finally {
      setSavingId('');
    }
  }

  if (!sources.length && !loading) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
        Register a website under Tracking Sources first. Detected Forms becomes available after the Universal Tracking SDK is installed on that website.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-[.08em] text-slate-400">Website</div>
          <select
            value={selectedSiteId}
            onChange={(event) => setSelectedSiteId(event.target.value)}
            className="mt-2 w-full max-w-xl rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
          >
            {sources.map((source) => (
              <option key={source.id} value={source.siteId}>
                {source.hostname ?? source.name} · {source.siteId}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Salsys discovers form structure from the SDK. Visitor-entered form values are not stored in the detection registry.
          </p>
        </div>
        <button
          type="button"
          onClick={loadForms}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading detected forms…</div>
      ) : forms.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <FormInput className="mx-auto text-slate-400" size={24} />
          <div className="mt-3 text-sm font-semibold text-slate-800">No forms detected yet</div>
          <p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-slate-500">
            Visit {selectedSource?.hostname ?? 'the registered website'} with the Universal Tracking SDK installed. The SDK reports form structure automatically, including dynamically added forms.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {forms.map((form) => {
            const expanded = expandedId === form.id;
            const mapping = draftMappings[form.id] ?? form.field_mapping ?? {};
            const likelyLead = form.metadata?.likely_lead_form === true;
            return (
              <section key={form.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-base font-semibold text-slate-900">{form.form_name || 'Anonymous form'}</div>
                      <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[.06em] ${statusClasses(form.status)}`}>
                        {form.status}
                      </span>
                      {likelyLead ? (
                        <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[.06em] text-indigo-700">Likely lead form</span>
                      ) : null}
                    </div>
                    <div className="mt-2 font-mono text-xs text-slate-500">{form.page_path}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      {form.method.toUpperCase()} · action {form.form_action || 'same page'} · {form.field_inventory?.length ?? 0} safe fields · last seen {formatWhen(form.last_seen_at)}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? '' : form.id)}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Settings2 size={14} /> Configure
                    </button>
                    {form.status === 'ignored' ? (
                      <button
                        type="button"
                        disabled={savingId === form.id}
                        onClick={() => saveForm(form, { status: 'detected', enabled: false })}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Restore
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={savingId === form.id}
                        onClick={() => saveForm(form, { status: 'ignored', enabled: false })}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                      >
                        <EyeOff size={14} /> Ignore
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={savingId === form.id || form.status === 'ignored'}
                      onClick={() => saveForm(form, { status: 'enabled', enabled: true })}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <CheckCircle2 size={14} />
                      {form.lead_capture_enabled ? 'Save & keep enabled' : 'Enable capture'}
                    </button>
                  </div>
                </div>

                {expanded ? (
                  <div className="mt-5 border-t border-slate-100 pt-5">
                    <div className="text-sm font-semibold text-slate-900">Field mapping</div>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Map only the fields Salsys should use for lead identity and context. Saved mappings override automatic field guessing for this form.
                    </p>
                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {CANONICAL_FIELDS.map(([key, label]) => (
                        <label key={key} className="text-xs font-semibold text-slate-600">
                          {label}
                          <select
                            value={mapping[key] ?? ''}
                            onChange={(event) =>
                              setDraftMappings((current) => ({
                                ...current,
                                [form.id]: {
                                  ...(current[form.id] ?? form.field_mapping ?? {}),
                                  [key]: event.target.value,
                                },
                              }))
                            }
                            className="mt-1.5 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800"
                          >
                            <option value="">Automatic / not mapped</option>
                            {(form.field_inventory ?? []).map((field) => (
                              <option key={`${key}:${field.selector}`} value={field.selector}>
                                {fieldLabel(field)} · {field.type}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        disabled={savingId === form.id || form.status === 'ignored'}
                        onClick={() => saveForm(form, { status: 'enabled', enabled: true })}
                        className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                      >
                        {savingId === form.id ? 'Saving…' : 'Save mapping & enable'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
