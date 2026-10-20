import Link from 'next/link';
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Clock3,
  MessageCircleMore,
  PauseCircle,
  PlayCircle,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  UsersRound,
  XCircle,
} from 'lucide-react';

import { PageHeader } from '@/components/ui';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';
import {
  approveWhatsAppBroadcastCampaignAction,
  archiveWhatsAppQuickReplyAction,
  cancelWhatsAppBroadcastCampaignAction,
  createWhatsAppAudienceSegmentAction,
  createWhatsAppBroadcastCampaignAction,
  createWhatsAppQuickReplyAction,
  pauseWhatsAppBroadcastCampaignAction,
  snapshotWhatsAppBroadcastAudienceAction,
} from '@/app/automation/whatsapp/actions';

type SegmentRow = {
  id: string;
  name: string;
  description: string | null;
  filters: Record<string, unknown>;
  active: boolean;
  updated_at: string;
};

type TemplateRow = {
  id: string;
  template_name: string;
  language_code: string;
  category: string | null;
};

type CampaignRow = {
  campaign_id: string;
  name: string;
  status: string;
  whatsapp_template_id: string;
  audience_segment_id: string | null;
  scheduled_at: string | null;
  approved_at: string | null;
  audience_count: number;
  eligible_count: number;
  excluded_count: number;
  queued_count: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  replied_count: number;
  failed_count: number;
  delivery_rate_pct: number | string;
  read_rate_pct: number | string;
  reply_rate_pct: number | string;
  created_at: string;
  updated_at: string;
};

type QuickReplyRow = {
  id: string;
  title: string;
  shortcut: string;
  body: string;
  category: string | null;
  active: boolean;
};

type MessagingPolicyRow = {
  policy_enabled: boolean;
  autonomous_send_enabled: boolean;
  requires_human_approval: boolean;
  max_messages_24h: number;
  max_messages_7d: number;
  min_gap_minutes: number;
};

type ProviderSettingsRow = {
  provider_send_enabled: boolean;
  pilot_mode_enabled: boolean;
  pilot_max_messages: number;
};

function statusClass(status: string) {
  if (['completed', 'approved', 'read', 'delivered'].includes(status)) {
    return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  }
  if (['ready', 'scheduled', 'running'].includes(status)) {
    return 'bg-sky-50 text-sky-700 ring-sky-200';
  }
  if (['paused', 'draft'].includes(status)) {
    return 'bg-amber-50 text-amber-700 ring-amber-200';
  }
  if (['failed', 'cancelled'].includes(status)) {
    return 'bg-rose-50 text-rose-700 ring-rose-200';
  }
  return 'bg-slate-100 text-slate-600 ring-slate-200';
}

function arrayLabel(filters: Record<string, unknown>, key: string, fallback: string) {
  const value = filters[key];
  return Array.isArray(value) && value.length
    ? value.map((item) => String(item)).join(', ')
    : fallback;
}

export default async function WhatsAppOperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const query = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <div className="card-pad text-sm text-slate-600">Sign in to manage WhatsApp operations.</div>;
  }

  let organizationName = 'Current organization';
  let role: string | null = null;
  let segments: SegmentRow[] = [];
  let templates: TemplateRow[] = [];
  let campaigns: CampaignRow[] = [];
  let quickReplies: QuickReplyRow[] = [];
  let policy: MessagingPolicyRow | null = null;
  let provider: ProviderSettingsRow | null = null;
  let loadError: string | null = null;

  try {
    const workspace = await getCurrentWorkspaceContext(supabase);
    const organizationId = workspace.activeOrganizationId;
    organizationName = workspace.activeWorkspace?.organizationName || organizationName;
    role = workspace.activeWorkspace?.role || null;

    if (organizationId) {
      const admin = createAdminClient();
      const [segmentResult, templateResult, campaignResult, replyResult, policyResult, providerResult] =
        await Promise.all([
          admin
            .from('whatsapp_audience_segments')
            .select('id,name,description,filters,active,updated_at')
            .eq('organization_id', organizationId)
            .order('active', { ascending: false })
            .order('updated_at', { ascending: false }),
          admin
            .from('automation_whatsapp_templates')
            .select('id,template_name,language_code,category')
            .eq('organization_id', organizationId)
            .eq('approval_status', 'approved')
            .eq('active', true)
            .order('template_name', { ascending: true }),
          admin
            .from('v_whatsapp_campaign_performance_v1')
            .select('*')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false })
            .limit(100),
          admin
            .from('whatsapp_quick_replies')
            .select('id,title,shortcut,body,category,active')
            .eq('organization_id', organizationId)
            .order('active', { ascending: false })
            .order('category', { ascending: true, nullsFirst: false })
            .order('title', { ascending: true }),
          admin
            .from('automation_messaging_policies')
            .select('policy_enabled,autonomous_send_enabled,requires_human_approval,max_messages_24h,max_messages_7d,min_gap_minutes')
            .eq('organization_id', organizationId)
            .eq('channel', 'whatsapp')
            .maybeSingle(),
          admin
            .from('automation_provider_send_settings')
            .select('provider_send_enabled,pilot_mode_enabled,pilot_max_messages')
            .eq('organization_id', organizationId)
            .eq('channel', 'whatsapp')
            .eq('provider', 'meta_cloud_api')
            .maybeSingle(),
        ]);

      const firstError =
        segmentResult.error ||
        templateResult.error ||
        campaignResult.error ||
        replyResult.error ||
        policyResult.error ||
        providerResult.error;
      if (firstError) throw firstError;

      segments = (segmentResult.data ?? []) as SegmentRow[];
      templates = (templateResult.data ?? []) as TemplateRow[];
      campaigns = (campaignResult.data ?? []) as CampaignRow[];
      quickReplies = (replyResult.data ?? []) as QuickReplyRow[];
      policy = (policyResult.data ?? null) as MessagingPolicyRow | null;
      provider = (providerResult.data ?? null) as ProviderSettingsRow | null;
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Unable to load WhatsApp operations.';
  }

  const canManage = role ? ['owner', 'admin'].includes(role) : false;
  const activeSegments = segments.filter((segment) => segment.active);
  const activeReplies = quickReplies.filter((reply) => reply.active);
  const totalSent = campaigns.reduce((sum, row) => sum + Number(row.sent_count || 0), 0);
  const totalRead = campaigns.reduce((sum, row) => sum + Number(row.read_count || 0), 0);
  const totalReplies = campaigns.reduce((sum, row) => sum + Number(row.replied_count || 0), 0);
  const policyClosed = !policy?.policy_enabled || !provider?.provider_send_enabled;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="WhatsApp operations"
        title="Inbox, broadcasts & audiences"
        description={`WATI/AiSensy-style WhatsApp operations for ${organizationName}, connected directly to Salsys CRM, lead intent, suppression and revenue context.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/conversations" className="btn-secondary">Open inbox</Link>
            <Link href="/automation/templates" className="btn-secondary">Templates</Link>
            <Link href="/automation/flow-builder" className="btn-primary">Flow Builder</Link>
          </div>
        }
      />

      {query.error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          {query.error}
        </div>
      ) : null}
      {query.notice ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {query.notice}
        </div>
      ) : null}
      {loadError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          {loadError}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Audience segments" value={activeSegments.length} note="Reusable CRM audiences" icon={<UsersRound size={18} />} />
        <MetricCard label="Broadcast campaigns" value={campaigns.length} note="Draft through completed" icon={<Target size={18} />} />
        <MetricCard label="Messages sent" value={totalSent} note={`${totalRead} read`} icon={<Send size={18} />} />
        <MetricCard label="Replies" value={totalReplies} note="Campaign reply outcomes" icon={<MessageCircleMore size={18} />} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
        <div className="card-pad">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className={policyClosed ? 'text-amber-600' : 'text-emerald-600'} />
            <h2 className="text-base font-bold text-slate-950">Messaging safety posture</h2>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <SafetyItem label="Messaging policy" enabled={policy?.policy_enabled === true} />
            <SafetyItem label="Human approval" enabled={policy?.requires_human_approval === true} positiveWhenEnabled />
            <SafetyItem label="Provider execution" enabled={provider?.provider_send_enabled === true} />
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">
            Broadcast creation, audience snapshots and campaign approval do not bypass STOP suppression, frequency caps, approved-template rules or provider execution gates. Current production remains fail-closed unless those existing controls are explicitly opened.
          </p>
        </div>
        <div className="card-pad">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Per-lead frequency policy</div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-slate-50 px-2 py-3"><div className="text-xl font-bold text-slate-950">{policy?.max_messages_24h ?? '—'}</div><div className="text-[10px] text-slate-500">24 hours</div></div>
            <div className="rounded-xl bg-slate-50 px-2 py-3"><div className="text-xl font-bold text-slate-950">{policy?.max_messages_7d ?? '—'}</div><div className="text-[10px] text-slate-500">7 days</div></div>
            <div className="rounded-xl bg-slate-50 px-2 py-3"><div className="text-xl font-bold text-slate-950">{policy?.min_gap_minutes ?? '—'}</div><div className="text-[10px] text-slate-500">min gap</div></div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[.85fr_1.15fr]">
        <div className="card-pad">
          <div className="flex items-center gap-2">
            <UsersRound size={18} className="text-violet-600" />
            <h2 className="text-base font-bold text-slate-950">Create audience segment</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Build reusable CRM audiences. Empty stages use the safe active-lead default and exclude enrolled/lost/unqualified/duplicate leads.
          </p>

          <form action={createWhatsAppAudienceSegmentAction} className="mt-5 space-y-3">
            <input className="input" name="name" required placeholder="e.g. High-intent 200H Mysore leads" disabled={!canManage} />
            <textarea className="input min-h-20" name="description" placeholder="Optional description" disabled={!canManage} />
            <input className="input" name="stages" placeholder="Stages: qualified,high_intent,payment_pending" disabled={!canManage} />
            <input className="input" name="intents" placeholder="Intents: high,very_high" disabled={!canManage} />
            <input className="input" name="countries" placeholder="Countries: India,United States" disabled={!canManage} />
            <input className="input" name="preferred_locations" placeholder="Locations: Mysore,Kerala" disabled={!canManage} />
            <input className="input" name="source_channels" placeholder="Sources: website,instagram,whatsapp" disabled={!canManage} />
            <input type="hidden" name="require_verified_primary_whatsapp" value="true" />
            <button className="btn-primary w-full" type="submit" disabled={!canManage}>Save audience segment</button>
          </form>

          <div className="mt-5 space-y-2">
            {activeSegments.length ? activeSegments.slice(0, 12).map((segment) => (
              <div key={segment.id} className="rounded-xl border border-slate-200 px-3 py-3">
                <div className="font-semibold text-slate-900">{segment.name}</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">
                  Stages: {arrayLabel(segment.filters, 'stages', 'safe active default')} · Intent: {arrayLabel(segment.filters, 'intents', 'any')}
                </div>
              </div>
            )) : <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No saved audiences yet.</div>}
          </div>
        </div>

        <div className="card-pad">
          <div className="flex items-center gap-2">
            <Target size={18} className="text-violet-600" />
            <h2 className="text-base font-bold text-slate-950">Create broadcast campaign</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Campaigns require a saved audience and a Meta-approved template. Audience membership is snapshotted before human approval so the recipient set is auditable.
          </p>

          <form action={createWhatsAppBroadcastCampaignAction} className="mt-5 grid gap-3 md:grid-cols-2">
            <input className="input md:col-span-2" name="name" required placeholder="Campaign name" disabled={!canManage} />
            <select className="input" name="audience_segment_id" required disabled={!canManage || !activeSegments.length} defaultValue="">
              <option value="" disabled>Select audience</option>
              {activeSegments.map((segment) => <option key={segment.id} value={segment.id}>{segment.name}</option>)}
            </select>
            <select className="input" name="whatsapp_template_id" required disabled={!canManage || !templates.length} defaultValue="">
              <option value="" disabled>Select approved template</option>
              {templates.map((template) => <option key={template.id} value={template.id}>{template.template_name} · {template.language_code}</option>)}
            </select>
            <input className="input" type="datetime-local" name="scheduled_at" disabled={!canManage} />
            <input className="input" name="description" placeholder="Campaign purpose / operator note" disabled={!canManage} />
            <button className="btn-primary md:col-span-2" type="submit" disabled={!canManage || !activeSegments.length || !templates.length}>Create draft campaign</button>
          </form>

          {!templates.length ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-800">
              No approved active WhatsApp templates are available. Synchronize templates before creating a broadcast.
            </div>
          ) : null}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-950">Broadcast campaign control</h2>
            <p className="mt-1 text-sm text-slate-500">Draft → audience snapshot → human approval → guarded execution.</p>
          </div>
          <Link href="/automation/audits" className="btn-secondary">Provider audits</Link>
        </div>

        {campaigns.length === 0 ? (
          <div className="card-pad text-sm text-slate-500">No WhatsApp broadcast campaigns yet.</div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-[1120px] w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Campaign</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Audience</th>
                    <th className="px-4 py-3">Sent</th>
                    <th className="px-4 py-3">Delivery</th>
                    <th className="px-4 py-3">Read</th>
                    <th className="px-4 py-3">Replies</th>
                    <th className="px-4 py-3">Controls</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {campaigns.map((campaign) => (
                    <tr key={campaign.campaign_id}>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{campaign.name}</div>
                        <div className="mt-1 text-[11px] text-slate-500">Created {new Date(campaign.created_at).toLocaleString('en-IN')}</div>
                      </td>
                      <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${statusClass(campaign.status)}`}>{campaign.status}</span></td>
                      <td className="px-4 py-3"><div className="font-semibold text-slate-900">{campaign.eligible_count} eligible</div><div className="text-[11px] text-slate-500">{campaign.excluded_count} excluded</div></td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{campaign.sent_count}</td>
                      <td className="px-4 py-3"><div className="font-semibold text-slate-800">{campaign.delivered_count}</div><div className="text-[11px] text-slate-500">{Number(campaign.delivery_rate_pct || 0).toFixed(1)}%</div></td>
                      <td className="px-4 py-3"><div className="font-semibold text-slate-800">{campaign.read_count}</div><div className="text-[11px] text-slate-500">{Number(campaign.read_rate_pct || 0).toFixed(1)}%</div></td>
                      <td className="px-4 py-3"><div className="font-semibold text-slate-800">{campaign.replied_count}</div><div className="text-[11px] text-slate-500">{Number(campaign.reply_rate_pct || 0).toFixed(1)}%</div></td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {['draft', 'ready'].includes(campaign.status) ? (
                            <form action={snapshotWhatsAppBroadcastAudienceAction}>
                              <input type="hidden" name="campaign_id" value={campaign.campaign_id} />
                              <button className="btn-secondary !px-3 !py-2" type="submit" disabled={!canManage}><UsersRound size={13} /> Snapshot</button>
                            </form>
                          ) : null}
                          {campaign.status === 'ready' ? (
                            <form action={approveWhatsAppBroadcastCampaignAction}>
                              <input type="hidden" name="campaign_id" value={campaign.campaign_id} />
                              <button className="btn-primary !px-3 !py-2" type="submit" disabled={!canManage}><CheckCircle2 size={13} /> Approve</button>
                            </form>
                          ) : null}
                          {['approved', 'scheduled', 'running'].includes(campaign.status) ? (
                            <form action={pauseWhatsAppBroadcastCampaignAction}>
                              <input type="hidden" name="campaign_id" value={campaign.campaign_id} />
                              <button className="btn-secondary !px-3 !py-2" type="submit" disabled={!canManage}><PauseCircle size={13} /> Pause</button>
                            </form>
                          ) : null}
                          {!['completed', 'cancelled'].includes(campaign.status) ? (
                            <form action={cancelWhatsAppBroadcastCampaignAction}>
                              <input type="hidden" name="campaign_id" value={campaign.campaign_id} />
                              <button className="btn-secondary !px-3 !py-2 text-rose-700" type="submit" disabled={!canManage}><XCircle size={13} /> Cancel</button>
                            </form>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
        <div className="card-pad">
          <div className="flex items-center gap-2"><Sparkles size={18} className="text-violet-600" /><h2 className="text-base font-bold text-slate-950">Quick replies</h2></div>
          <p className="mt-2 text-sm leading-6 text-slate-500">Reusable human-agent replies for the shared WhatsApp inbox.</p>
          <form action={createWhatsAppQuickReplyAction} className="mt-5 space-y-3">
            <input className="input" name="title" required placeholder="Reply title" disabled={!canManage} />
            <input className="input" name="shortcut" required placeholder="/fees" disabled={!canManage} />
            <input className="input" name="category" placeholder="Category, e.g. Admissions" disabled={!canManage} />
            <textarea className="input min-h-28" name="body" required maxLength={4096} placeholder="Message text" disabled={!canManage} />
            <button className="btn-primary w-full" type="submit" disabled={!canManage}>Save quick reply</button>
          </form>
        </div>

        <div className="card-pad">
          <div className="flex items-center gap-2"><MessageCircleMore size={18} className="text-violet-600" /><h2 className="text-base font-bold text-slate-950">Inbox reply library</h2></div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {activeReplies.length ? activeReplies.map((reply) => (
              <div key={reply.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900">{reply.title}</div>
                    <div className="mt-1 text-xs font-semibold text-violet-600">{reply.shortcut}</div>
                  </div>
                  <form action={archiveWhatsAppQuickReplyAction}>
                    <input type="hidden" name="quick_reply_id" value={reply.id} />
                    <button className="text-xs font-semibold text-slate-400 hover:text-rose-600" type="submit" disabled={!canManage}>Archive</button>
                  </form>
                </div>
                <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-xs leading-5 text-slate-600">{reply.body}</p>
              </div>
            )) : <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500 md:col-span-2">No quick replies yet.</div>}
          </div>
        </div>
      </section>

      <section className="card-pad">
        <div className="flex items-center gap-2"><BarChart3 size={18} className="text-violet-600" /><h2 className="text-base font-bold text-slate-950">What this adds to Salsys</h2></div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Capability icon={<UsersRound size={16} />} title="Audience segmentation" body="Build reusable CRM audiences from stage, intent, geography, source and location while requiring a verified primary WhatsApp contact by default." />
          <Capability icon={<Activity size={16} />} title="Campaign analytics" body="Track eligible, excluded, queued, sent, delivered, read, replied and failed outcomes without losing tenant or lead lineage." />
          <Capability icon={<ShieldCheck size={16} />} title="Fail-closed broadcasts" body="Campaign approval is separate from provider execution. Existing suppression, template, frequency, provider and policy controls remain authoritative." />
        </div>
      </section>
    </div>
  );
}

function MetricCard({ label, value, note, icon }: { label: string; value: number; note: string; icon: React.ReactNode }) {
  return <div className="card-pad"><div className="flex items-center justify-between"><div className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</div><div className="text-violet-600">{icon}</div></div><div className="mt-2 text-2xl font-bold text-slate-950">{value.toLocaleString('en-IN')}</div><div className="mt-1 text-xs text-slate-500">{note}</div></div>;
}

function SafetyItem({ label, enabled, positiveWhenEnabled = false }: { label: string; enabled: boolean; positiveWhenEnabled?: boolean }) {
  const positive = positiveWhenEnabled ? enabled : !enabled;
  return <div className={`rounded-xl border px-3 py-3 ${positive ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}><div className="text-xs font-bold text-slate-700">{label}</div><div className={`mt-1 text-sm font-bold ${positive ? 'text-emerald-700' : 'text-amber-700'}`}>{enabled ? 'Enabled' : 'Disabled'}</div></div>;
}

function Capability({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return <div className="rounded-xl border border-slate-200 p-4"><div className="flex items-center gap-2 font-semibold text-slate-900"><span className="text-violet-600">{icon}</span>{title}</div><p className="mt-2 text-xs leading-5 text-slate-500">{body}</p></div>;
}
