'use client';

import { Check, Copy, KeyRound, Pencil, RotateCcw, Save, Server, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

type ServerSource = {
  id: string;
  name: string;
  source_type: string;
  source_system: string;
  source_key: string | null;
  auth_mode: string | null;
  status: string;
  allowed_event_prefixes: string[] | null;
  max_payload_bytes: number | null;
  rate_limit_per_minute: number | null;
  accepted_event_count: number | null;
  duplicate_event_count: number | null;
  rejected_event_count: number | null;
  last_seen_at: string | null;
  secret_version?: number | null;
};

const EVENT_FAMILIES = [
  ['web.', 'Server-observed web requests'],
  ['lead.', 'Lead lifecycle'],
  ['booking.', 'Booking lifecycle'],
  ['payment.', 'Payment truth'],
  ['enrollment.', 'Enrollment truth'],
] as const;

function isServerSource(row: unknown): row is ServerSource {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
  const item = row as Record<string, unknown>;
  return (
    ['api', 'webhook', 'system'].includes(String(item.source_type ?? '')) &&
    String(item.auth_mode ?? '') === 'secret'
  );
}

function formatWhen(value: string | null) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function ServerTrackingSourceManager() {
  const [sources, setSources] = useState<ServerSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [revealedSecret, setRevealedSecret] = useState<{
    sourceId: string;
    sourceKey: string;
    secret: string;
    secretVersion: number | null;
  } | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/tracking/sources', { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.ok || !Array.isArray(body.sources)) {
        throw new Error(typeof body?.error === 'string' ? body.error : 'Unable to load server tracking sources.');
      }
      setSources(body.sources.filter(isServerSource));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load server tracking sources.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function rotateSecret(source: ServerSource) {
    const confirmed = window.confirm(
      `Rotate the secret for “${source.name}”? The current secret will stop working immediately.`,
    );
    if (!confirmed) return;

    setRotatingId(source.id);
    setError(null);
    try {
      const response = await fetch(`/api/tracking/sources/${encodeURIComponent(source.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rotate_secret' }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.ok || !body?.credentials?.secret) {
        throw new Error(typeof body?.error === 'string' ? body.error : 'Unable to rotate server secret.');
      }
      setRevealedSecret({
        sourceId: source.id,
        sourceKey: String(body.credentials.source_key ?? source.source_key ?? ''),
        secret: String(body.credentials.secret),
        secretVersion: Number(body.credentials.secret_version ?? 0) || null,
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to rotate server secret.');
    } finally {
      setRotatingId(null);
    }
  }

  const sourceWithSecret = useMemo(
    () => sources.find((source) => source.id === revealedSecret?.sourceId) ?? null,
    [sources, revealedSecret],
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="eyebrow">Manage server tracking</div>
          <h2 className="section-title mt-1">Edit existing Server Events API sources</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Rename a backend source, change its event permissions and limits, pause delivery, or rotate its secret. Existing secrets are never displayed again.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"
        >
          <RotateCcw size={14} /> Refresh
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      ) : null}

      {revealedSecret && sourceWithSecret ? (
        <OneTimeSecret
          sourceName={sourceWithSecret.name}
          sourceKey={revealedSecret.sourceKey}
          secret={revealedSecret.secret}
          secretVersion={revealedSecret.secretVersion}
          onDismiss={() => setRevealedSecret(null)}
        />
      ) : null}

      {loading ? (
        <div className="mt-5 text-sm text-slate-500">Loading server tracking sources…</div>
      ) : sources.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
          No Server Events API source exists yet. Create one in the Server Tracking section above.
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {sources.map((source) =>
            editingId === source.id ? (
              <ServerSourceEditor
                key={source.id}
                source={source}
                onCancel={() => setEditingId(null)}
                onSaved={async () => {
                  setEditingId(null);
                  await load();
                }}
              />
            ) : (
              <div key={source.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
                        <Server size={15} />
                      </span>
                      <div className="font-semibold text-slate-900">{source.name}</div>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[.06em] ${source.status === 'active' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                        {source.status}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      <code>{source.source_system}</code> · <code>{source.source_key ?? 'No source key'}</code>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(source.allowed_event_prefixes ?? []).map((prefix) => (
                        <span key={prefix} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[10px] text-slate-600">{prefix}</span>
                      ))}
                    </div>
                    <div className="mt-3 text-[11px] text-slate-400">
                      {Number(source.accepted_event_count ?? 0).toLocaleString()} accepted · {Number(source.duplicate_event_count ?? 0).toLocaleString()} duplicates · {Number(source.rejected_event_count ?? 0).toLocaleString()} rejected · last seen {formatWhen(source.last_seen_at)}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingId(source.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                    >
                      <Pencil size={13} /> Edit
                    </button>
                    <button
                      type="button"
                      disabled={rotatingId === source.id}
                      onClick={() => void rotateSecret(source)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 disabled:opacity-50"
                    >
                      <KeyRound size={13} /> {rotatingId === source.id ? 'Rotating…' : 'Rotate secret'}
                    </button>
                  </div>
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </section>
  );
}

function ServerSourceEditor({
  source,
  onCancel,
  onSaved,
}: {
  source: ServerSource;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(source.name);
  const [sourceSystem, setSourceSystem] = useState(source.source_system);
  const [status, setStatus] = useState(source.status === 'paused' ? 'paused' : 'active');
  const [prefixes, setPrefixes] = useState<string[]>(source.allowed_event_prefixes ?? []);
  const [rateLimit, setRateLimit] = useState(String(source.rate_limit_per_minute ?? 1200));
  const [maxPayload, setMaxPayload] = useState(String(source.max_payload_bytes ?? 65536));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function togglePrefix(prefix: string) {
    setPrefixes((current) =>
      current.includes(prefix)
        ? current.filter((item) => item !== prefix)
        : [...current, prefix],
    );
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/tracking/sources/${encodeURIComponent(source.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          sourceSystem,
          status,
          allowedEventPrefixes: prefixes,
          rateLimitPerMinute: Number(rateLimit),
          maxPayloadBytes: Number(maxPayload),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.ok) {
        throw new Error(typeof body?.error === 'string' ? body.error : 'Unable to save server tracking source.');
      }
      await onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save server tracking source.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="rounded-2xl border border-emerald-200 bg-emerald-50/30 p-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Server source name
          <input value={name} onChange={(event) => setName(event.target.value)} required className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Source system key
          <input value={sourceSystem} onChange={(event) => setSourceSystem(event.target.value)} required pattern="[A-Za-z0-9_.-]+" className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-mono text-sm" />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value as 'active' | 'paused')} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
            <option value="active">Active</option>
            <option value="paused">Paused</option>
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Rate limit / minute
          <input type="number" min={1} max={100000} value={rateLimit} onChange={(event) => setRateLimit(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
        </label>
        <label className="text-sm font-medium text-slate-700 lg:col-span-2">
          Maximum payload bytes
          <input type="number" min={1024} max={1048576} value={maxPayload} onChange={(event) => setMaxPayload(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
        </label>
      </div>

      <div className="mt-4">
        <div className="text-sm font-medium text-slate-700">Allowed server event families</div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {EVENT_FAMILIES.map(([prefix, label]) => (
            <label key={prefix} className="flex cursor-pointer gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
              <input type="checkbox" checked={prefixes.includes(prefix)} onChange={() => togglePrefix(prefix)} className="mt-0.5" />
              <span><code className="font-semibold text-slate-800">{prefix}</code><span className="mt-1 block text-[10px] text-slate-400">{label}</span></span>
            </label>
          ))}
        </div>
      </div>

      {error ? <div className="mt-3 text-sm text-rose-600">{error}</div> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          <Save size={14} /> {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" onClick={onCancel} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600">
          <X size={14} /> Cancel
        </button>
      </div>
    </form>
  );
}

function OneTimeSecret({
  sourceName,
  sourceKey,
  secret,
  secretVersion,
  onDismiss,
}: {
  sourceName: string;
  sourceKey: string;
  secret: string;
  secretVersion: number | null;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-amber-950">New secret for {sourceName}</div>
          <p className="mt-1 text-xs leading-5 text-amber-800">
            Save this secret now. It is shown once. Secret version {secretVersion ?? 'updated'} is active immediately.
          </p>
        </div>
        <button type="button" onClick={onDismiss} className="text-amber-800"><X size={16} /></button>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <SecretRow label="Source key" value={sourceKey} copied={copied === 'source'} onCopy={() => copy('source', sourceKey)} />
        <SecretRow label="Server secret" value={secret} copied={copied === 'secret'} onCopy={() => copy('secret', secret)} />
      </div>
    </div>
  );
}

function SecretRow({ label, value, copied, onCopy }: { label: string; value: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[.08em] text-slate-400">{label}</span>
        <button type="button" onClick={onCopy} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600">
          {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="mt-2 break-all font-mono text-xs text-slate-800">{value}</div>
    </div>
  );
}
