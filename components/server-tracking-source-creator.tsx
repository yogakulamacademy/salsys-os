'use client';

import { Check, Copy, KeyRound, Server, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';

import { ServerTrackingSourceManager } from '@/components/server-tracking-source-manager';

type CreatedServerSource = {
  source: {
    id: string;
    name: string;
    source_key: string;
    source_type: string;
    source_system: string;
  };
  credentials: {
    source_key: string;
    secret: string | null;
    publishable?: boolean;
    shown_once?: boolean;
  };
};

const SERVER_EVENT_PREFIXES = ['web.', 'lead.', 'booking.', 'payment.', 'enrollment.'];

function serverExamples(sourceKey: string, secret: string) {
  const endpoint = 'https://salsysos.com/api/events/v1';
  const body = `{
  "event_id": "lead_YGK-2026-0001",
  "event_name": "lead.submitted",
  "schema_version": 1,
  "occurred_at": "${new Date().toISOString()}",
  "external_message_id": "YGK-2026-0001",
  "site": "www.example.com",
  "properties": {
    "name": "Customer name",
    "email": "customer@example.com",
    "phone": "+91XXXXXXXXXX",
    "course": "200 Hour YTT",
    "source": "website_server"
  },
  "metadata": {
    "integration": "website_backend"
  }
}`;

  const curl = `curl -X POST '${endpoint}' \\
  -H 'Content-Type: application/json' \\
  -H 'X-Salsys-Source-Key: ${sourceKey}' \\
  -H 'Authorization: Bearer ${secret}' \\
  --data '${body.replace(/'/g, "'\\''")}'`;

  const php = `<?php
$endpoint = '${endpoint}';
$sourceKey = '${sourceKey}';
$secret = getenv('SALSYS_SERVER_SECRET'); // store outside public code

$event = [
    'event_id' => 'lead_' . $bookingReference,
    'event_name' => 'lead.submitted',
    'schema_version' => 1,
    'occurred_at' => gmdate('c'),
    'external_message_id' => $bookingReference,
    'site' => $_SERVER['HTTP_HOST'] ?? null,
    'anonymous_visitor_id' => $_POST['salsys_visitor_id'] ?? null,
    'session_key' => $_POST['salsys_session_id'] ?? null,
    'properties' => [
        'name' => $name,
        'email' => $email,
        'phone' => $phone,
        'course' => $course,
        'source' => 'website_server',
    ],
    'metadata' => [
        'integration' => 'php_backend',
    ],
];

$ch = curl_init($endpoint);
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'X-Salsys-Source-Key: ' . $sourceKey,
        'Authorization: Bearer ' . $secret,
    ],
    CURLOPT_POSTFIELDS => json_encode($event),
    CURLOPT_TIMEOUT => 5,
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

// Log/retry 429 and 5xx responses. Reuse the same event_id on retry.
?>`;

  const node = `const response = await fetch('${endpoint}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Salsys-Source-Key': '${sourceKey}',
    'Authorization': 'Bearer ' + process.env.SALSYS_SERVER_SECRET,
  },
  body: JSON.stringify({
    event_id: 'payment_' + payment.id,
    event_name: 'payment.completed',
    schema_version: 1,
    occurred_at: new Date().toISOString(),
    external_message_id: payment.id,
    site: 'www.example.com',
    anonymous_visitor_id: request.body.salsys_visitor_id || null,
    session_key: request.body.salsys_session_id || null,
    properties: {
      booking_reference: payment.bookingReference,
      amount: payment.amount,
      currency: payment.currency,
      payment_method: payment.method,
    },
    metadata: { integration: 'node_backend' },
  }),
});

if (!response.ok) {
  // Retry transient failures with the SAME event_id.
  throw new Error('Salsys server tracking failed: ' + response.status);
}`;

  return { curl, php, node };
}

export function ServerTrackingSourceCreator() {
  const [name, setName] = useState('Website backend');
  const [sourceSystem, setSourceSystem] = useState('website_backend');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedServerSource | null>(null);
  const [tab, setTab] = useState<'php' | 'node' | 'curl'>('php');
  const [copied, setCopied] = useState<string | null>(null);

  const sourceKey = created?.credentials.source_key ?? '';
  const secret = created?.credentials.secret ?? '';
  const examples = useMemo(
    () => (sourceKey && secret ? serverExamples(sourceKey, secret) : null),
    [sourceKey, secret],
  );

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setCreated(null);

    try {
      const response = await fetch('/api/tracking/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || 'Website backend',
          sourceType: 'api',
          sourceSystem: sourceSystem.trim() || 'website_backend',
          allowedEventPrefixes: SERVER_EVENT_PREFIXES,
          rateLimitPerMinute: 1200,
          maxPayloadBytes: 65536,
        }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof body.error === 'string'
            ? body.error
            : 'Unable to create server tracking source.',
        );
      }

      setCreated(body as CreatedServerSource);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to create server tracking source.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  }

  const activeExample = examples ? examples[tab] : '';

  return (
    <>
      <section id="server-tracking" className="scroll-mt-24 rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="eyebrow">Server tracking</div>
            <h2 className="section-title mt-1">Events API fallback + business truth</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Send important events directly from your PHP, Node, checkout, booking or payment backend. Server events do not depend on browser JavaScript, cookies or ad-blocker execution.
            </p>
          </div>
          <div className="flex max-w-md gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-800">
            <ShieldCheck size={16} className="mt-0.5 shrink-0" />
            Keep the server secret only on your backend. Never place it in HTML, JavaScript, GTM, mobile code or a public repository.
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ['web.*', 'Server-observed requests'],
            ['lead.*', 'Form / CRM leads'],
            ['booking.*', 'Booking lifecycle'],
            ['payment.*', 'Payment truth'],
            ['enrollment.*', 'Enrollment truth'],
          ].map(([eventPrefix, description]) => (
            <div key={eventPrefix} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="font-mono text-xs font-semibold text-slate-800">{eventPrefix}</div>
              <div className="mt-1 text-[11px] text-slate-500">{description}</div>
            </div>
          ))}
        </div>

        <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-800">
          Server-observed <code>web.*</code> events can cover requests when JavaScript is blocked, but they should be marked as backend-observed and will not contain every client-only signal such as viewport interactions or blocked CTA clicks.
        </div>

        <form onSubmit={submit} className="mt-5 grid gap-4 lg:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Server source name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Website backend"
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900"
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Source system key
            <input
              value={sourceSystem}
              onChange={(event) => setSourceSystem(event.target.value)}
              placeholder="website_backend"
              pattern="[A-Za-z0-9_.-]+"
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-sm text-slate-900"
            />
            <span className="mt-1 block text-xs font-normal text-slate-400">
              Use a stable identifier per backend, for example website_backend, icici_gateway or enrollment_service.
            </span>
          </label>

          <div className="lg:col-span-2 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Server size={16} />
              {submitting ? 'Creating…' : 'Create server tracking source'}
            </button>
            {error ? <span className="text-sm text-rose-600">{error}</span> : null}
          </div>
        </form>

        {created && sourceKey && secret ? (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-amber-700">
                <KeyRound size={17} />
              </span>
              <div>
                <div className="text-sm font-semibold text-amber-950">Save this secret now — it is shown once</div>
                <p className="mt-1 text-xs leading-5 text-amber-800">
                  Salsys stores only a hash of the secret. Put it in your server environment/config outside the public web root.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <CredentialRow
                label="Source key"
                value={sourceKey}
                copied={copied === 'source'}
                onCopy={() => copy('source', sourceKey)}
              />
              <CredentialRow
                label="Server secret"
                value={secret}
                copied={copied === 'secret'}
                onCopy={() => copy('secret', secret)}
              />
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {(['php', 'node', 'curl'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setTab(item)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase tracking-[.06em] ${
                    tab === item
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  {item}
                </button>
              ))}
              <button
                type="button"
                onClick={() => copy('example', activeExample)}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600"
              >
                {copied === 'example' ? <Check size={13} /> : <Copy size={13} />}
                {copied === 'example' ? 'Copied' : 'Copy example'}
              </button>
            </div>

            <pre className="mt-3 max-h-[520px] overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-4 text-xs leading-5 text-slate-100">
              {activeExample}
            </pre>

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <Rule title="Stable event_id" text="Generate it from the business action. Reuse the same ID on retries so duplicate deliveries stay idempotent." />
              <Rule title="Link browser + server" text="When available, forward salsys_visitor_id and salsys_session_id from the form into the server event for journey attribution." />
              <Rule title="Blocked-browser fallback" text="For server-observed web requests, generate/retain first-party visitor and session IDs on the website backend before sending web.* events." />
              <Rule title="Commercial authority" text="Payment and enrollment completion should come from backend confirmation/webhooks, not from a browser success page." />
            </div>
          </div>
        ) : null}
      </section>

      <ServerTrackingSourceManager />
    </>
  );
}

function CredentialRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-xl border border-amber-200 bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[.06em] text-slate-400">{label}</div>
        <button type="button" onClick={onCopy} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600">
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="mt-2 break-all font-mono text-xs text-slate-800">{value}</div>
    </div>
  );
}

function Rule({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-amber-200/80 bg-white/80 p-3">
      <div className="text-xs font-semibold text-slate-900">{title}</div>
      <p className="mt-1 text-[11px] leading-5 text-slate-500">{text}</p>
    </div>
  );
}
