import 'server-only';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Building2, CreditCard, UsersRound, Layers3, Plug, BarChart3 } from 'lucide-react';
import { PlatformAdminFrame } from '@/components/platform-admin-frame';
import { loadPlatformOrganizationProfile, validOrganizationId } from '@/lib/platform-organization-profile';

export const dynamic='force-dynamic';
export const metadata={title:'Organization profile',robots:{index:false,follow:false,nocache:true}};

function date(value: string|null|undefined) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Not recorded';
  return new Date(value).toISOString().replace('T',' ').slice(0,16)+' UTC';
}
function human(value:string|null|undefined) { return value?.replaceAll('_',' ') ?? 'Not recorded'; }

export default async function OrganizationProfilePage({searchParams}:{searchParams:Promise<{org?:string|string[]}>}) {
  if(process.env.SALSYS_PLATFORM_ADMIN_ENABLED!=='true') notFound();
  const {org}=await searchParams;
  if(!validOrganizationId(org)) notFound();
  // Do not swallow authorization redirects from the shared server loader.
  const profile=await loadPlatformOrganizationProfile(org.toLowerCase());
  if(!profile) notFound();
  const {organization,onboarding,subscription,events}=profile;
  return <PlatformAdminFrame section="customers"><main className="min-w-0 space-y-6">
    <Link href="/settings/organizations" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700"><ArrowLeft size={16} aria-hidden="true"/> Organizations</Link>
    <header className="flex flex-wrap items-center gap-4"><span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-50 text-brand-700"><Building2 size={23} aria-hidden="true"/></span><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wider text-brand-700">{profile.internal?'Internal platform workspace':'Registered organization'}</p><h1 className="break-words text-[28px] font-bold">{organization.name}</h1><p className="break-all text-sm text-copy-muted">{organization.slug} · {human(organization.status)} · Created {date(organization.created_at)}</p></div></header>
    <div className="grid gap-3 sm:grid-cols-2">
      <article className="rounded-xl border border-line bg-surface p-5 shadow-sm"><UsersRound size={20} className="text-brand-700" aria-hidden="true"/><h2 className="mt-3 text-sm text-copy-muted">Active membership records</h2><p className="mt-1 text-2xl font-bold">{profile.activeMemberships??'Unavailable'}</p><p className="mt-2 text-xs text-copy-muted">Not active sessions or verified named-user quota utilization.</p></article>
      <article className="rounded-xl border border-line bg-surface p-5 shadow-sm"><Layers3 size={20} className="text-brand-700" aria-hidden="true"/><h2 className="mt-3 text-sm text-copy-muted">Configured enabled workspaces</h2><p className="mt-1 text-2xl font-bold">{profile.configuredWorkspaces?.length??'Unavailable'}</p><p className="mt-2 break-words text-sm capitalize">{profile.configuredWorkspaces===null?'Inventory unavailable':profile.configuredWorkspaces.join(', ')||'None recorded'}</p><p className="mt-2 text-xs text-copy-muted">Configuration, not effective user permissions or adoption.</p></article>
    </div>
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-xl border border-line bg-surface p-5 shadow-sm"><h2 className="font-semibold">Onboarding</h2>{!onboarding.available?<p className="mt-3 text-sm">Onboarding unavailable.</p>:!onboarding.record?<p className="mt-3 text-sm">No onboarding record.</p>:<dl className="mt-3 space-y-2 text-sm"><dt className="text-copy-muted">Recorded status</dt><dd className="font-semibold capitalize">{human(onboarding.record.status)}</dd><dt className="text-copy-muted">Current step</dt><dd>{human(onboarding.record.current_step)}</dd><dt className="text-copy-muted">Enforced on sign-in</dt><dd>{onboarding.record.enforce_on_sign_in?'Yes':'No'}</dd><dt className="text-copy-muted">Completed at</dt><dd>{date(onboarding.record.completed_at)}</dd></dl>}</section>
      <section className="rounded-xl border border-line bg-surface p-5 shadow-sm"><h2 className="flex items-center gap-2 font-semibold"><CreditCard size={18} className="text-brand-700" aria-hidden="true"/> Subscription record</h2>{!subscription.available?<p className="mt-3 text-sm">Subscription unavailable.</p>:!subscription.record?<p className="mt-3 text-sm">No subscription record. This does not establish a Free plan or lack of access.</p>:<dl className="mt-3 space-y-2 text-sm"><dt className="text-copy-muted">Referenced catalog plan</dt><dd className="font-semibold">{subscription.plan?subscription.plan.display_name+' · catalog v'+subscription.plan.version:'Unavailable'}</dd><dt className="text-copy-muted">Recorded status and source</dt><dd className="capitalize">{human(subscription.record.status)} · {human(subscription.record.source)}</dd><dt className="text-copy-muted">Trial end</dt><dd>{date(subscription.record.trial_ends_at)}</dd><dt className="text-copy-muted">Period end</dt><dd>{date(subscription.record.current_period_ends_at)}</dd><dt className="text-copy-muted">Cancellation date</dt><dd>{date(subscription.record.canceled_at)}</dd></dl>}<p className="mt-3 text-xs text-copy-muted">Referenced catalog version is the current catalog record, not a historical contract version. Recorded status is not effective entitlement or payment evidence.</p></section>
    </div>
    <section className="rounded-xl border border-line bg-surface p-5 shadow-sm">
      <h2 className="flex items-center gap-2 font-semibold"><BarChart3 size={18} className="text-brand-700" aria-hidden="true"/> Registry counts and catalog reference</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <article className="rounded-lg border border-line p-4"><h3 className="text-sm text-copy-muted">Active membership records</h3><p className="mt-1 text-2xl font-bold tabular-nums">{profile.activeMemberships??'Unavailable'}</p><p className="mt-2 text-xs text-copy-muted">Referenced catalog named-user limit: {subscription.available?subscription.plan?.limits?.namedUsers??'Unavailable':'Unavailable'}</p></article>
        <article className="rounded-lg border border-line p-4"><h3 className="text-sm text-copy-muted">Retained lead records</h3><p className="mt-1 text-2xl font-bold tabular-nums">{profile.leadRecords??'Unavailable'}</p><p className="mt-2 text-xs text-copy-muted">Referenced catalog lead-record limit: {subscription.available?subscription.plan?.limits?.leadRecords??'Unavailable':'Unavailable'}</p></article>
      </div>
      <p className="mt-3 text-xs text-copy-muted">Exact table counts and current referenced catalog limits are separate observations. They are not verified quota counters, effective contract allowances, product activity or enforcement decisions. No customer lead content is fetched.</p>
    </section>
    <section className="rounded-xl border border-line bg-surface p-5 shadow-sm">
      <h2 className="flex items-center gap-2 font-semibold"><Plug size={18} className="text-brand-700" aria-hidden="true"/> Integration inventory</h2>
      {profile.integrationInventory===null?<p role="status" className="mt-3 text-sm">Integration inventory unavailable.</p>:<div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{profile.integrationInventory.map(({provider,states})=><article key={provider} className="rounded-lg border border-line p-4"><h3 className="font-semibold capitalize">{provider}</h3><div className="mt-2 flex flex-wrap gap-1">{states.length?states.map((state,index)=><span key={index} className="rounded-md bg-surface-soft px-2 py-1 text-xs capitalize">{human(state)}</span>):<span className="text-xs text-copy-muted">No connection record</span>}</div></article>)}</div>}
      <p className="mt-3 text-xs text-copy-muted">Stored connection statuses only; not live connectivity, provider asset verification or effective integration entitlement. No credentials, account identifiers or provider calls.</p>
    </section>
    <section className="rounded-xl border border-line bg-surface p-5 shadow-sm"><h2 className="font-semibold">Recent subscription events</h2><p className="mt-1 text-xs text-copy-muted">Up to 20 recorded events, newest first. Not a complete customer activity timeline or payment history.</p>{events===null?<p className="mt-3 text-sm">Event history unavailable.</p>:events.length===0?<p className="mt-3 text-sm">No subscription events recorded.</p>:<div className="mt-3 divide-y divide-line">{events.map((event,index)=><article key={index} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><div><p className="font-semibold capitalize">{human(event.event_type)}</p><p className="text-xs capitalize text-copy-muted">{human(event.previous_status)} → {human(event.new_status)} · {event.source}</p></div><p className="text-xs text-copy-muted">{date(event.occurred_at)}</p></article>)}</div>}</section>
    <p className="text-xs text-copy-muted">Read-only platform registry view. No tenant impersonation, CRM content, contact details, provider credentials or lifecycle mutations. Separate reads can change concurrently.</p>
  </main></PlatformAdminFrame>;
}
