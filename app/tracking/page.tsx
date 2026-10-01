import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Code2,
  Cookie,
  ExternalLink,
  Fingerprint,
  FormInput,
  Link2,
  MousePointerClick,
  Radio,
  ShieldCheck,
  Tags,
  UserPlus,
} from "lucide-react";

import { PageHeader, StatCard } from "@/components/ui";

import { TrackerSnippet } from "@/components/tracker-snippet";

import { isMockMode } from "@/lib/data";

import { getTrackingWorkspace } from "@/lib/tracking-data";

export default async function TrackingPage() {
  const workspace = await getTrackingWorkspace();

  const { health, capture, funnel } = workspace;

  const mock = isMockMode();

  const identifiedShare = health.events24h
    ? Math.round((health.identifiedEvents24h / health.events24h) * 100)
    : 0;

  const clickIdEvents7d = health.gclidEvents7d + health.fbclidEvents7d;

  const pageViewsPerVisitor = funnel.visitors
    ? funnel.pageViews / funnel.visitors
    : 0;

  const formCompletionRate = funnel.formStarts
    ? (funnel.browserFormSubmits / funnel.formStarts) * 100
    : 0;

  return (
    <div className="tracking-polish">
      <PageHeader
        eyebrow="First-party measurement"
        title="Tracking"
        description="Monitor the first-party tracking layer, verify anonymous visitor → CRM lead linking, and keep the installation, consent and CTA snippets in one operational reference."
      />

      <section className="tracking-status-card mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="eyebrow">Tracking status</div>

            <div className="section-title mt-1">
              Is the measurement layer receiving data?
            </div>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              This page is the technical health and implementation hub for
              website tracking. Funnel, Analytics, Attribution and Campaigns use
              the resulting data downstream.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:min-w-[560px]">
            <HealthBadge
              ok={health.events24h > 0}
              title="Collector"
              value={
                health.events24h > 0
                  ? `${health.events24h.toLocaleString()} events · 24h`
                  : "No events · 24h"
              }
            />

            <HealthBadge
              ok={health.visitors24h > 0}
              title="Visitor identity"
              value={
                health.visitors24h > 0
                  ? `${health.visitors24h.toLocaleString()} visitors · 24h`
                  : "No visitors · 24h"
              }
            />

            <HealthBadge
              ok={capture.submissions24h > 0}
              title="Lead capture"
              value={`${capture.submissions24h.toLocaleString()} enquiries · 24h`}
              neutral={capture.submissions24h === 0}
            />

            <HealthBadge
              ok={clickIdEvents7d > 0}
              title="Paid click IDs"
              value={`${clickIdEvents7d.toLocaleString()} captured · 7d`}
              neutral={clickIdEvents7d === 0}
            />
          </div>
        </div>
      </section>

      <div className="tracking-stat-grid grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Events · 24h"
          value={health.events24h.toLocaleString()}
          note={mock ? "Mock tracking data" : "Website touchpoints received"}
          icon={<Activity size={18} />}
        />

        <StatCard
          label="Visitors · 24h"
          value={health.visitors24h.toLocaleString()}
          note="Anonymous first-party visitor IDs"
          icon={<Fingerprint size={18} />}
        />

        <StatCard
          label="Identified events"
          value={`${identifiedShare}%`}
          note={`${health.identifiedEvents24h.toLocaleString()} events already attached to CRM leads`}
          icon={<CheckCircle2 size={18} />}
        />

        <StatCard
          label="Ad click IDs · 7d"
          value={clickIdEvents7d.toLocaleString()}
          note={`${health.gclidEvents7d.toLocaleString()} Google · ${health.fbclidEvents7d.toLocaleString()} Meta`}
          icon={<Tags size={18} />}
        />
      </div>

      <div className="tracking-stat-grid mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Website enquiries · 24h"
          value={capture.submissions24h.toLocaleString()}
          note={`${capture.newLeads24h} new · ${capture.matchedExisting24h} matched existing`}
          icon={<UserPlus size={18} />}
        />

        <StatCard
          label="Form starts · 7d"
          value={funnel.formStarts.toLocaleString()}
          note={`${funnel.browserFormSubmits} tracked browser submits`}
          icon={<MousePointerClick size={18} />}
        />

        <StatCard
          label="Contact CTA clicks · 7d"
          value={funnel.contactCtaClicks.toLocaleString()}
          note="WhatsApp, Instagram, email, phone and booking CTAs"
          icon={<ExternalLink size={18} />}
        />

        <StatCard
          label="Website visitors · 7d"
          value={funnel.visitors.toLocaleString()}
          note={`${funnel.pageViews.toLocaleString()} page views · ${pageViewsPerVisitor.toFixed(
            1,
          )} views / visitor`}
          icon={<Fingerprint size={18} />}
        />
      </div>

      <section className="tracking-journey-card card-pad mt-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="eyebrow">7-day browser journey</div>

            <div className="section-title mt-1">
              Tracking flow before CRM identification
            </div>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              These are browser-side first-party tracking signals. They show
              whether visitors are progressing from browsing into measurable
              intent before the CRM lead is created.
            </p>
          </div>

          <div className="tracking-completion-card rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-[.08em] text-slate-400">
              Form completion
            </div>

            <div className="mt-1 text-xl font-semibold text-slate-900">
              {formCompletionRate.toFixed(1)}%
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <JourneyMetric
            label="Visitors"
            value={funnel.visitors}
            note="anonymous visitors"
          />

          <JourneyMetric
            label="Page views"
            value={funnel.pageViews}
            note="tracked page views"
          />

          <JourneyMetric
            label="CTA clicks"
            value={funnel.contactCtaClicks}
            note="contact / booking intent"
          />

          <JourneyMetric
            label="Form starts"
            value={funnel.formStarts}
            note="tracked form starts"
          />

          <JourneyMetric
            label="Browser submits"
            value={funnel.browserFormSubmits}
            note="tracked form submissions"
          />
        </div>
      </section>

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
              Mark enquiry forms with <InlineCode>data-yk-lead-form</InlineCode>
              . The tracker adds visitor/session attribution as hidden fields.
              After the website saves the enquiry, its backend can send the same
              submission to the secure CRM capture endpoint.
            </>
          }
          code={`<form method="post" data-yk-lead-form>
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
            Your website backend should POST JSON to{" "}
            <InlineCode>/api/leads/capture</InlineCode> with the{" "}
            <InlineCode>X-Website-Secret</InlineCode> header. Never place that
            secret in JavaScript, GTM or HTML.
          </p>

          <div className="tracking-server-note mt-4 rounded-xl bg-emerald-50 p-4 text-xs leading-5 text-emerald-800">
            Duplicate submissions are idempotent, and repeat enquiries with the
            same email/phone are matched to the existing CRM lead instead of
            creating another lead.
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

              <Pill>CRM lead</Pill>

              <span className="text-slate-300">→</span>

              <Pill>Historical touchpoints linked</Pill>
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
   data-yk-event="whatsapp_click"
   data-yk-channel="whatsapp"
   data-yk-label="200H Course WhatsApp">
  Enquire on WhatsApp
</a>`}
        />

        <SnippetCard
          icon={<Cookie size={17} />}
          eyebrow="Consent"
          title="Grant analytics consent"
          description="When your cookie-consent system receives analytics consent, dispatch the tracker consent event. Keep the tracker in required-consent mode for production unless your legal/privacy setup intentionally uses another approach."
          code={`window.dispatchEvent(
  new CustomEvent('yk:consent', {
    detail: { analytics: true }
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
          code={`// Tracker status
window.YKTracking?.status?.();

// Current visitor + attribution context
window.YKTracking?.context?.();

// Confirm only one tracker script is installed
[...document.querySelectorAll(
  'script[src*="yogakulam-tracker.js"]'
)].map((script) => ({
  src: script.src,
  endpoint: script.dataset.endpoint,
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

function HealthBadge({
  ok,

  neutral = false,

  title,

  value,
}: {
  ok: boolean;

  neutral?: boolean;

  title: string;

  value: string;
}) {
  const stateClass = ok
    ? "border-emerald-100 bg-emerald-50 text-emerald-800"
    : neutral
      ? "border-slate-200 bg-slate-50 text-slate-700"
      : "border-amber-100 bg-amber-50 text-amber-800";

  return (
    <div
      className={`tracking-health-badge rounded-xl border px-3 py-2.5 ${stateClass}`}
    >
      <div className="flex items-center gap-2">
        {ok ? (
          <CheckCircle2 size={14} />
        ) : neutral ? (
          <Activity size={14} />
        ) : (
          <AlertTriangle size={14} />
        )}

        <span className="text-[10px] font-semibold uppercase tracking-[.08em]">
          {title}
        </span>
      </div>

      <div className="mt-1 text-xs font-semibold">{value}</div>
    </div>
  );
}

function JourneyMetric({
  label,

  value,

  note,
}: {
  label: string;

  value: number;

  note: string;
}) {
  return (
    <div className="tracking-journey-metric rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[.08em] text-slate-400">
        {label}
      </div>

      <div className="mt-2 text-2xl font-semibold text-slate-900">
        {value.toLocaleString("en-IN")}
      </div>

      <div className="mt-1 text-[10px] text-slate-400">{note}</div>
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
