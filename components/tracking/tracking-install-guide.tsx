import Link from "next/link";

import {
  AlertTriangle,
  Code2,
  Cookie,
  ExternalLink,
  Fingerprint,
  FormInput,
  Link2,
  MousePointerClick,
  Radio,
  ShieldCheck,
} from "lucide-react";

import { TrackerSnippet } from "@/components/tracker-snippet";

// Tracking check › Setup (owner-approved 26 Nov 2026): the tracker snippet and
// the other install code blocks, moved here from "Tracking details" so they stay
// one click away after that page became "Connections and data".
export function TrackingInstallGuide() {
  return (
    <div id="install-code">
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.08fr_.92fr]">
        <div className="tracking-install-card card-pad">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="eyebrow">Website installation</div>

              <div className="section-title mt-1">Tracker snippet</div>
            </div>

            <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand/10 text-brand">
              <Code2 size={18} />
            </span>
          </div>

          <p className="mt-2 text-sm leading-6 text-slate-500">
            Add this script to Yogakulam pages directly or through Google Tag
            Manager. The snippet automatically uses the CRM domain you are
            currently viewing.
          </p>

          <TrackerSnippet />

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <Mini
              icon={<Cookie size={16} />}
              title="First touch"
              text="Preserved locally instead of being overwritten by later visits."
            />

            <Mini
              icon={<MousePointerClick size={16} />}
              title="Click IDs"
              text="Captures GCLID, GBRAID, WBRAID and FBCLID when present."
            />

            <Mini
              icon={<ShieldCheck size={16} />}
              title="Consent gate"
              text="Tracking waits for analytics consent by default."
            />
          </div>
        </div>

        <div className="tracking-capture-card card-pad">
          <div className="eyebrow">Capture model</div>

          <div className="section-title mt-1">What gets recorded</div>

          <div className="mt-5 space-y-3">
            {[
              [
                "Acquisition",

                "UTM source / medium / campaign / content / term + utm_id",
              ],

              [
                "Google Ads",

                "gclid, gbraid, wbraid, campaignid, adgroupid, creative",
              ],

              [
                "Meta",

                "fbclid plus campaign/ad-set/ad IDs when passed in the URL",
              ],

              [
                "Journey",

                "Landing page, referrer, page views and tagged CTA clicks",
              ],

              [
                "Identity",

                "Anonymous visitor ID + session ID; no lead PII in anonymous tracking events",
              ],

              [
                "Linking",

                "When a lead is created, historical visitor touchpoints can be attached to that CRM lead",
              ],
            ].map(([title, text]) => (
              <div
                key={title}
                className="tracking-capture-item rounded-xl border border-slate-200 p-4 transition"
              >
                <div className="text-sm font-semibold text-slate-800">
                  {title}
                </div>

                <div className="mt-1 text-xs leading-5 text-slate-500">
                  {text}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <SnippetCard
          icon={<FormInput size={17} />}
          eyebrow="Automatic CRM lead creation"
          title="Website form → CRM"
          description={
            <>
              Mark enquiry forms with <InlineCode>data-salsys-lead-form</InlineCode>
              . The tracker adds visitor/session attribution as hidden fields.
              After the website saves the enquiry, its backend can send the same
              submission to the secure CRM capture endpoint.
            </>
          }
          code={`<form method="post" data-salsys-lead-form>
  ...your existing fields...
</form>`}
        />

        <div className="tracking-server-card card-pad">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="eyebrow">Server endpoint</div>

              <div className="section-title mt-1">
                Keep the secret off the browser
              </div>
            </div>

            <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
              <ShieldCheck size={18} />
            </span>
          </div>

          <p className="mt-2 text-sm leading-6 text-slate-500">
            This card describes the legacy lead-capture handoff to{" "}
            <InlineCode>/api/leads/capture</InlineCode>. For universal server-side
            tracking, create a Server Events API source and use{" "}
            <InlineCode>/api/events/v1</InlineCode> with a source key + backend-only secret.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/tracking/sources#server-tracking"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800"
            >
              Set up Server Tracking
              <ExternalLink size={15} />
            </Link>
          </div>

          <div className="tracking-server-note mt-4 rounded-xl bg-emerald-50 p-4 text-xs leading-5 text-emerald-800">
            Server Events API supports web.*, lead.*, booking.*, payment.* and
            enrollment.* events. Keep the secret on the backend only. Reuse the
            same event_id on retries so duplicate deliveries stay idempotent.
          </div>

          <div className="tracking-handoff-card mt-4 rounded-xl border border-slate-200 p-4">
            <div className="text-xs font-semibold uppercase tracking-[.08em] text-slate-400">
              Identity handoff
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-700">
              <Pill>Anonymous visitor</Pill>

              <span className="text-slate-300">→</span>

              <Pill>Session</Pill>

              <span className="text-slate-300">→</span>

              <Pill>Server event</Pill>

              <span className="text-slate-300">→</span>

              <Pill>CRM / revenue evidence</Pill>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <SnippetCard
          icon={<ExternalLink size={17} />}
          eyebrow="Tagged actions"
          title="Track important CTA clicks"
          description="Add data attributes to important links. The tracker records the click and keeps the destination/contact channel in metadata."
          code={`<a href="https://wa.me/..."
   data-salsys-track="whatsapp_click"
   data-salsys-prop-channel="whatsapp"
   aria-label="200H Course WhatsApp">
  Enquire on WhatsApp
</a>`}
        />

        <SnippetCard
          icon={<Cookie size={17} />}
          eyebrow="Consent"
          title="Grant analytics consent"
          description="When your cookie-consent system receives analytics consent, dispatch the tracker consent event. Keep the tracker in required-consent mode for production unless your legal/privacy setup intentionally uses another approach."
          code={`window.dispatchEvent(
  new CustomEvent('salsys:consent', {
    detail: { analytics: 'granted' }
  })
);`}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.05fr_.95fr]">
        <SnippetCard
          icon={<Radio size={17} />}
          eyebrow="Diagnostics"
          title="Browser debugging helpers"
          description="Use these in DevTools when checking whether the tracker is loaded once, consent is active, and the current visitor/session context exists."
          code={`// Tracker configuration
window.SalsysIntelligence?.config?.();

// Current visitor + attribution context
window.SalsysIntelligence?.identifiers?.();

// Current privacy state
window.SalsysIntelligence?.privacy?.();

// Confirm only the Salsys tracker entrypoint is installed
[...document.querySelectorAll(
  'script[src*="salsys-intelligence.js"]'
)].map((script) => ({
  src: script.src,
  site: script.dataset.site,
  consentMode: script.dataset.consentMode,
  debug: script.dataset.debug
}));`}
        />

        <div className="tracking-guardrails-card card-pad">
          <div className="eyebrow">Production guardrails</div>

          <div className="section-title mt-1">
            Keep the tracking layer trustworthy
          </div>

          <div className="mt-5 space-y-3">
            <Guardrail
              icon={<ShieldCheck size={16} />}
              title="No server secrets in GTM"
              text="Supabase secret keys, tracking ingest secrets and website capture secrets stay server-side only."
            />

            <Guardrail
              icon={<Fingerprint size={16} />}
              title="Anonymous before identification"
              text="Tracking events use anonymous visitor/session identifiers. Lead identity is attached only after the CRM identifies the person."
            />

            <Guardrail
              icon={<Link2 size={16} />}
              title="Preserve attribution"
              text="Later direct visits or WhatsApp conversations do not overwrite the original acquisition source."
            />

            <Guardrail
              icon={<AlertTriangle size={16} />}
              title="Watch for silent breaks"
              text="If events, form submits, click IDs or identification suddenly fall to zero, inspect GTM, consent, origin allowlists and form decoration first."
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SnippetCard({
  icon,

  eyebrow,

  title,

  description,

  code,
}: {
  icon: React.ReactNode;

  eyebrow: string;

  title: string;

  description: React.ReactNode;

  code: string;
}) {
  return (
    <div className="tracking-snippet-card card-pad overflow-hidden">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="eyebrow">{eyebrow}</div>

          <div className="section-title mt-1">{title}</div>
        </div>

        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
          {icon}
        </span>
      </div>

      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>

      <pre className="tracking-code-block mt-4 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950 p-4 text-xs leading-6 text-slate-100">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="tracking-inline-code rounded bg-slate-100 px-1.5 py-0.5 text-[.9em] font-semibold text-slate-700">
      {children}
    </code>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="tracking-pill rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
      {children}
    </span>
  );
}

function Guardrail({
  icon,

  title,

  text,
}: {
  icon: React.ReactNode;

  title: string;

  text: string;
}) {
  return (
    <div className="tracking-guardrail rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <span className="text-brand">{icon}</span>

        {title}
      </div>

      <p className="mt-1.5 text-xs leading-5 text-slate-500">{text}</p>
    </div>
  );
}

function Mini({
  icon,

  title,

  text,
}: {
  icon: React.ReactNode;

  title: string;

  text: string;
}) {
  return (
    <div className="tracking-mini rounded-xl bg-slate-50 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        {icon}

        {title}
      </div>

      <p className="mt-1.5 text-xs leading-5 text-slate-500">{text}</p>
    </div>
  );
}
