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

type PlatformKey =
  | 'php'
  | 'wordpress'
  | 'shopify'
  | 'node'
  | 'laravel'
  | 'python'
  | 'supabase'
  | 'firebase'
  | 'aws'
  | 'vercel'
  | 'n8n'
  | 'make'
  | 'zapier'
  | 'custom';

const SERVER_EVENT_PREFIXES = ['web.', 'lead.', 'booking.', 'payment.', 'enrollment.'];

const PLATFORM_GUIDES: Array<{
  key: PlatformKey;
  label: string;
  short: string;
  where: string;
  action: string;
}> = [
  { key: 'php', label: 'PHP / Hostinger', short: 'Plain PHP websites and shared hosting', where: 'Create one private PHP helper outside public_html if possible, then call it from your existing form/payment handlers after the action succeeds.', action: 'Use the PHP example below.' },
  { key: 'wordpress', label: 'WordPress / WooCommerce', short: 'WordPress sites and WooCommerce stores', where: 'Put the secret in wp-config.php or server environment. Send events from a small plugin/theme helper using WordPress/WooCommerce hooks.', action: 'Use PHP, then trigger it from hooks such as form success or order paid.' },
  { key: 'shopify', label: 'Shopify', short: 'Orders, checkout and payment events', where: 'Do not put the secret in theme code. Receive Shopify webhooks in a server/app function and forward verified events to Salsys.', action: 'Use Node or another backend runtime for the webhook handler.' },
  { key: 'node', label: 'Node / Next.js / Express', short: 'Node APIs and server routes', where: 'Store the secret in environment variables. Call Salsys from an API route, server action, Express handler or backend service after the business action succeeds.', action: 'Use the Node example below.' },
  { key: 'laravel', label: 'Laravel', short: 'Laravel / PHP applications', where: 'Store credentials in .env and call Salsys from a service class, job or event listener after the model/payment action succeeds.', action: 'Use the PHP HTTP pattern with Laravel Http::.' },
  { key: 'python', label: 'Python', short: 'Django, Flask and FastAPI', where: 'Store the secret in environment variables and POST from the backend route/service after the business action succeeds.', action: 'Use the Python example below.' },
  { key: 'supabase', label: 'Supabase', short: 'Edge Functions, database workflows and webhooks', where: 'Store the secret as an Edge Function secret. Send events from an Edge Function, webhook handler or trusted backend—not from browser code.', action: 'Use fetch() from the Edge Function.' },
  { key: 'firebase', label: 'Firebase', short: 'Cloud Functions and backend triggers', where: 'Store the secret in Firebase/Google secret storage. Send from Cloud Functions after Firestore/Auth/payment events.', action: 'Use the Node example from a Cloud Function.' },
  { key: 'aws', label: 'AWS', short: 'Lambda and backend services', where: 'Store the secret in Secrets Manager or environment configuration. Send from Lambda/API/backend services after verified events.', action: 'Use Node/Python depending on your Lambda runtime.' },
  { key: 'vercel', label: 'Vercel', short: 'Functions, Route Handlers and Server Actions', where: 'Store the secret as a Vercel environment variable. Send from a Route Handler, Server Action or Function after the action succeeds.', action: 'Use the Node example below.' },
  { key: 'n8n', label: 'n8n', short: 'Automation workflows', where: 'Add an HTTP Request node after the workflow step that confirms the lead/payment/booking. Put credentials in n8n credentials or environment storage.', action: 'POST to the endpoint with the two authentication headers.' },
  { key: 'make', label: 'Make', short: 'Make.com scenarios', where: 'Add an HTTP module after the successful business step. Store the secret in a secure connection/variable rather than exposing it publicly.', action: 'Use a JSON POST with the Salsys headers.' },
  { key: 'zapier', label: 'Zapier', short: 'Zap workflows', where: 'Use Webhooks by Zapier → Custom Request after the step that confirms the event.', action: 'POST JSON with the Salsys source key and bearer secret.' },
  { key: 'custom', label: 'Custom / Other', short: 'Any backend that can make HTTPS requests', where: 'Keep the secret on the server and make an HTTPS POST after the business action has been verified.', action: 'Use cURL as the universal reference.' },
];

function serverExamples(sourceKey: string, secret: string) {
  const endpoint = 'https://salsysos.com/api/events/v1';
  const body = `{
  "event_id": "lead_12345",
  "event_name": "lead.submitted",
  "schema_version": 1,
  "occurred_at": "${new Date().toISOString()}",
  "external_message_id": "12345",
  "site": "www.example.com",
  "properties": {
    "email": "customer@example.com",
    "source": "website_server"
  },
  "metadata": { "integration": "backend" }
}`;

  const curl = `curl -X POST '${endpoint}' \\
  -H 'Content-Type: application/json' \\
  -H 'X-Salsys-Source-Key: ${sourceKey}' \\
  -H 'Authorization: Bearer ${secret}' \\
  --data '${body.replace(/'/g, "'\\''")}'`;

  const php = `<?php
$endpoint = '${endpoint}';
$sourceKey = '${sourceKey}';
$secret = getenv('SALSYS_SERVER_SECRET'); // server-only

$event = [
    'event_id' => 'lead_' . $websiteEnquiryId,
    'event_name' => 'lead.submitted',
    'schema_version' => 1,
    'occurred_at' => gmdate('c'),
    'external_message_id' => (string) $websiteEnquiryId,
    'site' => $_SERVER['HTTP_HOST'] ?? null,
    'anonymous_visitor_id' => $_POST['salsys_visitor_id'] ?? null,
    'session_key' => $_POST['salsys_session_id'] ?? null,
    'properties' => [
        'email' => $email,
        'phone' => $phone,
        'course' => $course,
        'source' => 'website_server',
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
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
// Retry 429/5xx with the SAME event_id.
?>`;

  const node = `const response = await fetch('${endpoint}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Salsys-Source-Key': '${sourceKey}',
    'Authorization': 'Bearer ' + process.env.SALSYS_SERVER_SECRET,
  },
  body: JSON.stringify({
    event_id: 'lead_' + lead.id,
    event_name: 'lead.submitted',
    schema_version: 1,
    occurred_at: new Date().toISOString(),
    external_message_id: String(lead.id),
    site: 'www.example.com',
    anonymous_visitor_id: body.salsys_visitor_id || null,
    session_key: body.salsys_session_id || null,
    properties: { email: lead.email, source: 'website_server' },
  }),
});

if (!response.ok) throw new Error('Salsys tracking failed: ' + response.status);`;

  const python = `import os, requests
from datetime import datetime, timezone

response = requests.post(
    '${endpoint}',
    headers={
        'Content-Type': 'application/json',
        'X-Salsys-Source-Key': '${sourceKey}',
        'Authorization': 'Bearer ' + os.environ['SALSYS_SERVER_SECRET'],
    },
    json={
        'event_id': 'lead_' + str(lead.id),
        'event_name': 'lead.submitted',
        'schema_version': 1,
        'occurred_at': datetime.now(timezone.utc).isoformat(),
        'external_message_id': str(lead.id),
        'site': 'www.example.com',
        'properties': {'email': lead.email, 'source': 'website_server'},
    },
    timeout=5,
)
response.raise_for_status()`;

  return { curl, php, node, python };
}

export function ServerTrackingSourceCreator() {
  const [name, setName] = useState('Website backend');
  const [sourceSystem, setSourceSystem] = useState('website_backend');
  const [platform, setPlatform] = useState<PlatformKey>('php');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedServerSource | null>(null);
  const [tab, setTab] = useState<'php' | 'node' | 'python' | 'curl'>('php');
  const [copied, setCopied] = useState<string | null>(null);

  const selectedGuide = PLATFORM_GUIDES.find((item) => item.key === platform) ?? PLATFORM_GUIDES[0];
  const sourceKey = created?.credentials.source_key ?? '';
  const secret = created?.credentials.secret ?? '';
  const examples = useMemo(() => (sourceKey && secret ? serverExamples(sourceKey, secret) : null), [sourceKey, secret]);

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
      if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Unable to create server tracking source.');
      setCreated(body as CreatedServerSource);
      if (platform === 'python' || platform === 'aws') setTab('python');
      else if (['node', 'shopify', 'firebase', 'supabase', 'vercel'].includes(platform)) setTab('node');
      else if (['n8n', 'make', 'zapier', 'custom'].includes(platform)) setTab('curl');
      else setTab('php');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create server tracking source.');
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
            <h2 className="section-title mt-1">Connect your backend in 3 steps</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Choose the platform you use. Salsys will tell you where the code belongs and give you the right integration example. No SDK knowledge required.</p>
          </div>
          <div className="flex max-w-md gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-800">
            <ShieldCheck size={16} className="mt-0.5 shrink-0" />
            Server secrets are private. Never paste them into HTML, browser JavaScript, GTM or public mobile code.
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="text-xs font-semibold uppercase tracking-[.08em] text-slate-400">Step 1 · What are you using?</div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {PLATFORM_GUIDES.map((item) => (
              <button key={item.key} type="button" onClick={() => setPlatform(item.key)} className={`rounded-xl border p-3 text-left transition ${platform === item.key ? 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-100' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                <div className="text-sm font-semibold text-slate-900">{item.label}</div>
                <div className="mt-1 text-[11px] leading-4 text-slate-500">{item.short}</div>
              </button>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-emerald-200 bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-[.06em] text-emerald-700">Where to install</div>
            <p className="mt-2 text-sm leading-6 text-slate-700">{selectedGuide.where}</p>
            <p className="mt-2 text-xs font-medium text-slate-500">{selectedGuide.action}</p>
          </div>
        </div>

        <form onSubmit={submit} className="mt-5 rounded-2xl border border-slate-200 p-4">
          <div className="text-xs font-semibold uppercase tracking-[.08em] text-slate-400">Step 2 · Create secure credentials</div>
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">Connection name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Website backend" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900" /></label>
            <label className="text-sm font-medium text-slate-700">System key<input value={sourceSystem} onChange={(event) => setSourceSystem(event.target.value)} placeholder="website_backend" pattern="[A-Za-z0-9_.-]+" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-sm text-slate-900" /><span className="mt-1 block text-xs font-normal text-slate-400">A stable internal name, e.g. website_backend, shopify_webhook or payment_service.</span></label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3"><button type="submit" disabled={submitting} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Server size={16} />{submitting ? 'Creating…' : 'Create connection'}</button>{error ? <span className="text-sm text-rose-600">{error}</span> : null}</div>
        </form>

        {created && sourceKey && secret ? (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
            <div className="text-xs font-semibold uppercase tracking-[.08em] text-amber-700">Step 3 · Install and test</div>
            <div className="mt-3 flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-amber-700"><KeyRound size={17} /></span><div><div className="text-sm font-semibold text-amber-950">Save the secret now — it is shown once</div><p className="mt-1 text-xs leading-5 text-amber-800">Store it in your server environment/config. Salsys keeps only a hash.</p></div></div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <CredentialRow label="Source key" value={sourceKey} copied={copied === 'source'} onCopy={() => copy('source', sourceKey)} />
              <CredentialRow label="Server secret" value={secret} copied={copied === 'secret'} onCopy={() => copy('secret', secret)} />
            </div>

            <div className="mt-4 rounded-xl border border-amber-200 bg-white/80 p-4">
              <div className="text-sm font-semibold text-slate-900">Install on {selectedGuide.label}</div>
              <p className="mt-1 text-xs leading-5 text-slate-600">{selectedGuide.where}</p>
              <p className="mt-2 text-xs font-semibold text-emerald-700">{selectedGuide.action}</p>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="mr-1 text-[11px] font-semibold uppercase tracking-[.06em] text-slate-400">Advanced examples</span>
              {(['php', 'node', 'python', 'curl'] as const).map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase tracking-[.06em] ${tab === item ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>{item}</button>)}
              <button type="button" onClick={() => copy('example', activeExample)} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">{copied === 'example' ? <Check size={13} /> : <Copy size={13} />}{copied === 'example' ? 'Copied' : 'Copy example'}</button>
            </div>
            <pre className="mt-3 max-h-[520px] overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-4 text-xs leading-5 text-slate-100">{activeExample}</pre>

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <Rule title="1. Trigger after success" text="Send the event only after the lead, booking, payment or enrollment is actually saved/confirmed." />
              <Rule title="2. Keep event_id stable" text="Use the business record ID and reuse it on retries so duplicate delivery stays safe." />
              <Rule title="3. Link the journey" text="Forward salsys_visitor_id and salsys_session_id when available so browser and server evidence connect." />
              <Rule title="4. Check Source Health" text="After your first event, return here. The source should move from Not live to Healthy when Salsys accepts it." />
            </div>
          </div>
        ) : null}
      </section>
      <ServerTrackingSourceManager />
    </>
  );
}

function CredentialRow({ label, value, copied, onCopy }: { label: string; value: string; copied: boolean; onCopy: () => void }) {
  return <div className="rounded-xl border border-amber-200 bg-white p-3"><div className="flex items-center justify-between gap-3"><div className="text-[11px] font-semibold uppercase tracking-[.06em] text-slate-400">{label}</div><button type="button" onClick={onCopy} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600">{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copied' : 'Copy'}</button></div><div className="mt-2 break-all font-mono text-xs text-slate-800">{value}</div></div>;
}

function Rule({ title, text }: { title: string; text: string }) {
  return <div className="rounded-xl border border-amber-200/80 bg-white/80 p-3"><div className="text-xs font-semibold text-slate-900">{title}</div><p className="mt-1 text-[11px] leading-5 text-slate-500">{text}</p></div>;
}
