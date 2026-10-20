import Link from 'next/link';
import {
  ArrowLeft,
  BarChart3,
  Beaker,
  CheckCircle2,
  Coins,
  GitBranch,
  Route,
  Send,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';

import { PageHeader } from '@/components/ui';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';
import {
  approveWhatsAppGrowthCampaignAction,
  createWhatsAppGrowthCampaignAction,
  snapshotWhatsAppGrowthAudienceAction,
} from '@/app/automation/whatsapp/growth/actions';

type SegmentRow = {
  id: string;
  name: string;
  active: boolean;
};

type TemplateRow = {
  id: string;
  template_name: string;
  language_code: string;
  parameter_schema: Record<string, unknown> | null;
};

type TeamMember = {
  userId: string;
  name: string;
  role: string;
};

type CampaignRow = {
  campaign_id: string;
  name: string;
  status: string;
  scheduled_at: string | null;
  audience_count: number;
  eligible_count: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  replied_count: number;
  failed_count: number;
  delivery_rate_pct: number | string;
  read_rate_pct: number | string;
  reply_rate_pct: number | string;
  active_variant_count: number;
  reply_routing_mode: string;
  conversion_window_days: number;
  attributed_conversion_count: number;
  attributed_payment_count: number;
  attributed_enrollment_count: number;
  attributed_refund_count: number;
  revenue_by_currency: Record<string, number | string> | null;
  attribution_method: string | null;
  created_at: string;
};

type VariantRow = {
  campaign_id: string;
  variant_id: string;
  label: string;
  allocation_weight: number;
  sent_count: number;
  read_count: number;
  replied_count: number;
  read_rate_pct: number | string;
  reply_rate_pct: number | string;
  attributed_conversion_count: number;
  attributed_enrollment_count: number;
  revenue_by_currency: Record<string, number | string> | null;
};

function variableCount(template: TemplateRow, key: 'header_variable_count' | 'body_variable_count') {
  const raw = template.parameter_schema?.[key];
  return typeof raw === 'number' ? raw : Number(raw ?? 0) || 0;
}

function moneyLabel(value: Record<string, number | string> | null | undefined) {
  if (!value) return '—';
  const entries = Object.entries(value).filter(([, amount]) => Number(amount) !== 0);
  if (!entries.length) return '—';
  return entries.map(([currency, amount]) => `${currency} ${Number(amount).toLocaleString()}`).join(' · ');
}

function statusClass(status: string) {
  if (['completed', 'approved'].includes(status)) return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  if (['ready', 'scheduled', 'running'].includes(status)) return 'bg-sky-50 text-sky-700 ring-sky-200';
  if (['draft', 'paused'].includes(status)) return 'bg-amber-50 text-amber-700 ring-amber-200';
  if (['failed', 'cancelled'].includes(status)) return 'bg-rose-50 text-rose-700 ring-rose-200';
  return 'bg-slate-100 text-slate-600 ring-slate-200';
}

function routingLabel(mode: string) {
  if (mode === 'campaign_creator_if_unassigned') return 'Campaign creator if unassigned';
  if (mode === 'round_robin_if_unassigned') return 'Round robin if unassigned';
  return 'Preserve current owner';
}

export default async function WhatsAppGrowthPage({
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
    return <div className="card-pad text-sm text-slate-600">Sign in to manage WhatsApp campaigns.</div>;
  }

  const workspace = await getCurrentWorkspaceContext(supabase);
  const organizationId = workspace.activeOrganizationId;
  const organizationName = workspace.activeWorkspace?.organizationName || 'Current organization';
  const role = workspace.activeWorkspace?.role || null;
  const canManage = Boolean(role && ['owner', 'admin'].includes(role));

  let segments: SegmentRow[] = [];
  let templates: TemplateRow[] = [];
  let team: TeamMember[] = [];
  let campaigns: CampaignRow[] = [];
  let variants: VariantRow[] = [];
  let loadError: string | null = null;

  try {
    if (organizationId) {
      const admin = createAdminClient();
      const [segmentResult, templateResult, memberResult, campaignResult, variantResult] = await Promise.all([
        admin
          .from('whatsapp_audience_segments')
          .select('id,name,active')
          .eq('organization_id', organizationId)
          .eq('active', true)
          .order('name'),
        admin
          .from('automation_whatsapp_templates')
          .select('id,template_name,language_code,parameter_schema')
          .eq('organization_id', organizationId)
          .eq('approval_status', 'approved')
          .eq('active', true)
          .order('template_name'),
        admin
          .from('organization_members')
          .select('user_id,role,active')
          .eq('organization_id', organizationId)
          .eq('active', true)
          .in('role', ['owner', 'admin', 'admissions']),
        admin
          .from('v_whatsapp_campaign_performance_v2')
          .select('*')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false })
          .limit(100),
        admin
          .from('v_whatsapp_campaign_variant_performance_v1')
          .select('*')
          .eq('organization_id', organizationId),
      ]);

      const firstError =
        segmentResult.error ||
        templateResult.error ||
        memberResult.error ||
        campaignResult.error ||
        variantResult.error;
      if (firstError) throw firstError;

      segments = (segmentResult.data ?? []) as SegmentRow[];
      templates = (templateResult.data ?? []) as TemplateRow[];
      campaigns = (campaignResult.data ?? []) as CampaignRow[];
      variants = (variantResult.data ?? []) as VariantRow[];

      const memberRows = memberResult.data ?? [];
      const userIds = memberRows.map((row) => String(row.user_id));
      const { data: profiles, error: profileError } = userIds.length
        ? await admin.from('profiles').select('id,full_name,active').in('id', userIds).eq('active', true)
        : { data: [], error: null };
      if (profileError) throw profileError;
      const names = new Map((profiles ?? []).map((profile) => [String(profile.id), String(profile.full_name || 'CRM user')]));
      team = memberRows
        .filter((row) => names.has(String(row.user_id)))
        .map((row) => ({
          userId: String(row.user_id),
          name: names.get(String(row.user_id)) || 'CRM user',
          role: String(row.role),
        }))
        .sort((left, right) => left.name.localeCompare(right.name));
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Unable to load WhatsApp growth operations.';
  }

  const totalSent = campaigns.reduce((sum, row) => sum + Number(row.sent_count || 0), 0);
  const totalEnrollments = campaigns.reduce((sum, row) => sum + Number(row.attributed_enrollment_count || 0), 0);
  const totalPayments = campaigns.reduce((sum, row) => sum + Number(row.attributed_payment_count || 0), 0);
  const variantsByCampaign = new Map<string, VariantRow[]>();
  for (const variant of variants) {
    const list = variantsByCampaign.get(variant.campaign_id) ?? [];
    list.push(variant);
    variantsByCampaign.set(variant.campaign_id, list);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="WhatsApp growth operations"
        title="Personalization, experiments & revenue"
        description={`Advanced WhatsApp campaign operations for ${organizationName}: explicit template variables, deterministic A/B allocation, safe reply routing and operational conversion attribution.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/automation/whatsapp" className="btn-secondary"><ArrowLeft size={15} /> WhatsApp Ops</Link>
            <Link href="/automation/templates" className="btn-secondary">Templates</Link>
          </div>
        }
      />

      {query.error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{query.error}</div> : null}
      {query.notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{query.notice}</div> : null}
      {loadError ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{loadError}</div> : null}

      <section className="grid gap-4 md:grid-cols-4">
        <MetricCard icon={<Send size={18} />} label="Messages sent" value={totalSent} note="Campaign provider sends" />
        <MetricCard icon={<CheckCircle2 size={18} />} label="Attributed enrollments" value={totalEnrollments} note="Operational attribution" />
        <MetricCard icon={<Coins size={18} />} label="Attributed payments" value={totalPayments} note="Within campaign window" />
        <MetricCard icon={<Beaker size={18} />} label="Experiment variants" value={variants.length} note="Deterministic recipient split" />
      </section>

      <section className="card-pad">
        <div className="flex items-start gap-3">
          <ShieldCheck size={20} className="mt-0.5 text-emerald-600" />
          <div>
            <h2 className="font-bold text-slate-950">Approval still controls the customer-facing configuration</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Variable bindings are explicit and allowlisted; A/B assignment is deterministic; missing personalization values exclude that recipient; reply routing only fills an unassigned owner. Campaign approval does not open the messaging-policy or Meta provider-send gates.
            </p>
          </div>
        </div>
      </section>

      <section className="card-pad">
        <div className="flex items-center gap-2">
          <GitBranch size={18} className="text-violet-600" />
          <h2 className="text-base font-bold text-slate-950">Create advanced campaign</h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Configure the exact customer-facing template inputs before the audience snapshot and human approval. Nothing sends from this form.
        </p>

        <form action={createWhatsAppGrowthCampaignAction} className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Campaign & audience</div>
            <input className="input" name="name" required placeholder="Campaign name" disabled={!canManage} />
            <textarea className="input min-h-20" name="description" placeholder="Optional internal description" disabled={!canManage} />
            <select className="input" name="audience_segment_id" required defaultValue="" disabled={!canManage || !segments.length}>
              <option value="" disabled>Select saved audience</option>
              {segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.name}</option>)}
            </select>
            <input className="input" type="datetime-local" name="scheduled_at" disabled={!canManage} />
            <label className="block text-xs font-semibold text-slate-600">
              Conversion attribution window (days)
              <input className="input mt-1" type="number" name="conversion_window_days" min={1} max={90} defaultValue={30} disabled={!canManage} />
            </label>
          </div>

          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Control template & variables</div>
            <select className="input" name="whatsapp_template_id" required defaultValue="" disabled={!canManage || !templates.length}>
              <option value="" disabled>Select Meta-approved template</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.template_name} · {template.language_code} · H{variableCount(template, 'header_variable_count')} B{variableCount(template, 'body_variable_count')}
                </option>
              ))}
            </select>
            <textarea
              className="input min-h-36 font-mono text-xs"
              name="base_template_bindings"
              placeholder={'One binding per line, only when the template has variables:\nbody.1=lead.first_name\nbody.2=course.name\nbody.3=constant:November 2026'}
              disabled={!canManage}
            />
            <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">
              Allowed sources: lead.first_name, lead.last_name, lead.display_name, lead.lead_code, lead.country, lead.preferred_location, lead.preferred_mode, lead.preferred_month, course.name, campaign.name, or constant:&lt;value&gt;.
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-violet-100 bg-violet-50/40 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-violet-950"><Beaker size={17} /> Optional A/B experiment</div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input type="checkbox" name="experiment_enabled" value="true" disabled={!canManage} /> Enable control vs challenger
            </label>
            <select className="input" name="challenger_template_id" defaultValue="" disabled={!canManage || !templates.length}>
              <option value="">Select challenger template</option>
              {templates.map((template) => <option key={template.id} value={template.id}>{template.template_name} · {template.language_code}</option>)}
            </select>
            <label className="block text-xs font-semibold text-slate-600">
              Challenger allocation %
              <input className="input mt-1" type="number" name="challenger_weight" min={10} max={90} defaultValue={50} disabled={!canManage} />
            </label>
            <textarea className="input min-h-28 font-mono text-xs" name="challenger_template_bindings" placeholder="Challenger bindings, using the same syntax" disabled={!canManage} />
          </div>

          <div className="space-y-3 rounded-2xl border border-sky-100 bg-sky-50/40 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-sky-950"><Route size={17} /> Reply routing</div>
            <select className="input" name="reply_routing_mode" defaultValue="preserve_owner" disabled={!canManage}>
              <option value="preserve_owner">Preserve current lead owner</option>
              <option value="campaign_creator_if_unassigned">Campaign creator if lead is unassigned</option>
              <option value="round_robin_if_unassigned">Round robin if lead is unassigned</option>
            </select>
            <label className="block text-xs font-semibold text-slate-600">
              Round-robin team members
              <select className="input mt-1 min-h-32" name="reply_routing_user_ids" multiple disabled={!canManage || !team.length}>
                {team.map((member) => <option key={member.userId} value={member.userId}>{member.name} · {member.role}</option>)}
              </select>
            </label>
            <p className="text-xs leading-5 text-slate-500">Routing never replaces an existing owner. It only assigns replies for leads that are still unassigned.</p>
          </div>

          <button className="btn-primary lg:col-span-2" type="submit" disabled={!canManage || !segments.length || !templates.length}>
            Create campaign draft
          </button>
        </form>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <BarChart3 size={18} className="text-violet-600" />
          <h2 className="text-base font-bold text-slate-950">Campaign performance & revenue context</h2>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
          Revenue and conversion figures use the most recent successfully sent WhatsApp campaign within the configured attribution window. They are operational attribution for campaign analysis, not proof that WhatsApp caused the conversion.
        </div>

        {campaigns.length ? campaigns.map((campaign) => {
          const experimentRows = variantsByCampaign.get(campaign.campaign_id) ?? [];
          return (
            <article key={campaign.campaign_id} className="card-pad">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold text-slate-950">{campaign.name}</h3>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${statusClass(campaign.status)}`}>{campaign.status}</span>
                    {Number(campaign.active_variant_count || 0) > 1 ? <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-700 ring-1 ring-violet-200">A/B</span> : null}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {routingLabel(campaign.reply_routing_mode)} · {campaign.conversion_window_days}d attribution window
                  </div>
                </div>
                <div className="flex gap-2">
                  {['draft', 'ready'].includes(campaign.status) ? (
                    <form action={snapshotWhatsAppGrowthAudienceAction}>
                      <input type="hidden" name="campaign_id" value={campaign.campaign_id} />
                      <button className="btn-secondary" type="submit" disabled={!canManage}><UsersRound size={14} /> Snapshot</button>
                    </form>
                  ) : null}
                  {campaign.status === 'ready' ? (
                    <form action={approveWhatsAppGrowthCampaignAction}>
                      <input type="hidden" name="campaign_id" value={campaign.campaign_id} />
                      <button className="btn-primary" type="submit" disabled={!canManage}><CheckCircle2 size={14} /> Approve</button>
                    </form>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-4 lg:grid-cols-8">
                <SmallMetric label="Audience" value={campaign.audience_count} />
                <SmallMetric label="Eligible" value={campaign.eligible_count} />
                <SmallMetric label="Sent" value={campaign.sent_count} />
                <SmallMetric label="Read" value={campaign.read_count} />
                <SmallMetric label="Replies" value={campaign.replied_count} />
                <SmallMetric label="Enrollments" value={campaign.attributed_enrollment_count} />
                <SmallMetric label="Payments" value={campaign.attributed_payment_count} />
                <SmallMetric label="Revenue" value={moneyLabel(campaign.revenue_by_currency)} />
              </div>

              <div className="mt-3 text-xs text-slate-500">
                Delivery {Number(campaign.delivery_rate_pct || 0).toFixed(1)}% · Read {Number(campaign.read_rate_pct || 0).toFixed(1)}% · Reply {Number(campaign.reply_rate_pct || 0).toFixed(1)}%
              </div>

              {experimentRows.length ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {experimentRows
                    .sort((left, right) => left.label.localeCompare(right.label))
                    .map((variant) => (
                      <div key={variant.variant_id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-semibold text-slate-900">{variant.label}</div>
                          <div className="text-xs font-bold text-violet-700">{variant.allocation_weight}%</div>
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-600">
                          <div>Sent <strong>{variant.sent_count}</strong></div>
                          <div>Read <strong>{variant.read_count}</strong></div>
                          <div>Reply <strong>{variant.replied_count}</strong></div>
                          <div>Conv. <strong>{variant.attributed_conversion_count}</strong></div>
                          <div>Enroll <strong>{variant.attributed_enrollment_count}</strong></div>
                          <div>{moneyLabel(variant.revenue_by_currency)}</div>
                        </div>
                      </div>
                    ))}
                </div>
              ) : null}
            </article>
          );
        }) : <div className="card-pad text-sm text-slate-500">No WhatsApp campaigns yet.</div>}
      </section>
    </div>
  );
}

function MetricCard({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: number | string; note: string }) {
  return (
    <div className="card-pad">
      <div className="flex items-center gap-2 text-slate-500">{icon}<span className="text-xs font-bold uppercase tracking-wide">{label}</span></div>
      <div className="mt-3 text-2xl font-bold text-slate-950">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{note}</div>
    </div>
  );
}

function SmallMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 truncate text-sm font-bold text-slate-900" title={String(value)}>{value}</div>
    </div>
  );
}
