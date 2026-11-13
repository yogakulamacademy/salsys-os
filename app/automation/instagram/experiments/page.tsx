import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';
import {
  INSTAGRAM_REPLY_EXPERIMENTS,
  detectExplicitInstagramIntent,
} from '@/lib/instagram/reply-experiments-v1';

export const dynamic = 'force-dynamic';

type TaggedSend = {
  id: string;
  lead_id: string;
  conversation_id: string;
  created_at: string;
  sent_at: string | null;
  metadata: Record<string, unknown> | null;
};
type Inbound = {
  id: string;
  conversation_id: string;
  created_at: string;
  received_at: string | null;
  body: string | null;
};
type Enrollment = {
  id: string;
  lead_id: string;
  status: string;
  enrolled_at: string | null;
  created_at: string;
};
type VariantMetrics = {
  sent: number;
  replies: number;
  qualifiedReplies: number;
  optOutReplies: number;
  attributedEnrollments: number;
};

function emptyMetrics(): VariantMetrics {
  return { sent: 0, replies: 0, qualifiedReplies: 0, optOutReplies: 0, attributedEnrollments: 0 };
}
function percent(numerator: number, denominator: number) {
  return denominator ? (100 * numerator / denominator).toFixed(1) + '%' : '—';
}
function displayVariant(value: unknown): 'A' | 'B' | null {
  return value === 'A' || value === 'B' ? value : null;
}
function millis(value: string | null | undefined) {
  const number = Date.parse(value || '');
  return Number.isFinite(number) ? number : 0;
}
function experimentTag(row: TaggedSend) {
  const metadata = row.metadata ?? {};
  const tag = metadata.instagram_ab_v1;
  return tag && typeof tag === 'object' && !Array.isArray(tag)
    ? tag as Record<string, unknown> : {};
}

/** Read-only, sample-bounded and explicitly non-causal performance. */
export default async function InstagramExperimentsPage() {
  if (process.env.IG_REPLY_VARIANTS_ENABLED !== 'true') {
    return <p className="p-6 text-sm text-slate-600">Instagram reply experiments are not enabled.</p>;
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <p className="p-6 text-sm text-slate-600">Sign in to review Instagram experiments.</p>;

  const organizationId = await requireCurrentOrganizationId(supabase, user.id);
  const { data: canManage, error: permissionError } = await supabase.rpc(
    'can_manage_organization', { p_organization_id: organizationId },
  );
  if (permissionError || canManage !== true) {
    return <p className="p-6 text-sm text-slate-600">Only workspace administrators can view experiment performance.</p>;
  }

  const admin = createAdminClient();
  const { data: sentData, error: sentError } = await admin
    .from('messages')
    .select('id,lead_id,conversation_id,created_at,sent_at,metadata')
    .eq('organization_id', organizationId)
    .eq('direction', 'outbound')
    .contains('metadata', { instagram_ab_v1: { source: 'verified_crm_human_reply' } })
    .order('created_at', { ascending: false })
    .limit(1001);

  if (sentError) {
    return <p className="p-6 text-sm text-red-700">Unable to load verified Instagram A/B send evidence.</p>;
  }

  const truncated = (sentData ?? []).length > 1000;
  const sends = ((sentData ?? []) as TaggedSend[]).slice(0, 1000);
  const leadIds = [...new Set(sends.map(row => row.lead_id))];
  const conversationIds = [...new Set(sends.map(row => row.conversation_id))];

  const earliest = sends.length ? Math.min(...sends.map(row => millis(row.sent_at || row.created_at))) : 0;
  const [inboundResult, enrollmentResult] = await Promise.all([
    conversationIds.length
      ? admin.from('messages')
        .select('id,conversation_id,created_at,received_at,body')
        .eq('organization_id', organizationId)
        .eq('direction', 'inbound')
        .in('conversation_id', conversationIds)
        .gte('created_at', new Date(earliest).toISOString())
        .order('created_at', { ascending: false })
        .limit(4001)
      : Promise.resolve({ data: [], error: null }),
    leadIds.length
      ? admin.from('enrollments')
        .select('id,lead_id,status,enrolled_at,created_at')
        .eq('organization_id', organizationId)
        .in('lead_id', leadIds)
        .in('status', ['confirmed', 'completed'])
        .order('created_at', { ascending: false })
        .limit(1001)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const incomplete = truncated || (inboundResult.data ?? []).length > 4000 || (enrollmentResult.data ?? []).length > 1000;
  const metrics = new Map<string, VariantMetrics>();
  const replySignals = new Map<string, number>();
  const inboundByConversation = new Map<string, Inbound[]>();

  if (!inboundResult.error) {
    for (const row of (inboundResult.data ?? []).slice(0, 4000) as Inbound[]) {
      const items = inboundByConversation.get(row.conversation_id) ?? [];
      items.push(row);
      inboundByConversation.set(row.conversation_id, items);
    }
  }
  for (const rows of inboundByConversation.values()) {
    rows.sort((a, b) => millis(a.received_at || a.created_at) - millis(b.received_at || b.created_at));
  }

  const latestTaggedSendByLead = new Map<string, Array<{ send: TaggedSend; ts: number }>>();
  const taggedSendTimesByConversation = new Map<string, number[]>();
  for (const send of sends) {
    const time = millis(send.sent_at || send.created_at);
    const times = taggedSendTimesByConversation.get(send.conversation_id) ?? [];
    times.push(time);
    taggedSendTimesByConversation.set(send.conversation_id, times);
  }
  for (const times of taggedSendTimesByConversation.values()) times.sort((a, b) => a - b);
  for (const send of sends) {
    const tag = experimentTag(send);
    const experiment = typeof tag.experiment_id === 'string' ? tag.experiment_id : '';
    const variant = displayVariant(tag.variant_id);
    if (!INSTAGRAM_REPLY_EXPERIMENTS.some(item => item.id === experiment) || !variant) continue;
    const key = experiment + ':' + variant;
    const bucket = metrics.get(key) ?? emptyMetrics();
    bucket.sent += 1;
    const sentTime = millis(send.sent_at || send.created_at);
    const nextTaggedSend = (taggedSendTimesByConversation.get(send.conversation_id) ?? [])
      .find(time => time > sentTime) ?? Number.POSITIVE_INFINITY;
    const responses = inboundByConversation.get(send.conversation_id) ?? [];
    const firstReply = responses.find(inbound => {
      const time = millis(inbound.received_at || inbound.created_at);
      return time > sentTime && time < nextTaggedSend && time <= sentTime + 72 * 60 * 60 * 1000;
    });

    if (firstReply) {
      bucket.replies += 1;
      const signals = detectExplicitInstagramIntent(firstReply.body ?? '');
      if (signals.includes('opt_out')) bucket.optOutReplies += 1;
      else if (signals.some(s => s !== 'general_question')) bucket.qualifiedReplies += 1;
      for (const signal of signals.filter(s => s !== 'general_question')) {
        replySignals.set(signal, (replySignals.get(signal) ?? 0) + 1);
      }
    }
    metrics.set(key, bucket);
    const tagged = latestTaggedSendByLead.get(send.lead_id) ?? [];
    tagged.push({ send, ts: sentTime });
    latestTaggedSendByLead.set(send.lead_id, tagged);
  }

  if (!enrollmentResult.error) {
    for (const enrollment of (enrollmentResult.data ?? []).slice(0, 1000) as Enrollment[]) {
      const enrollmentTime = millis(enrollment.enrolled_at || enrollment.created_at);
      if (!enrollmentTime) continue;
      const preceding = (latestTaggedSendByLead.get(enrollment.lead_id) ?? [])
        .filter(item => item.ts > 0 && item.ts <= enrollmentTime && enrollmentTime - item.ts <= 30 * 24 * 60 * 60 * 1000)
        .sort((a, b) => b.ts - a.ts)[0];
      if (!preceding) continue;
      const tag = experimentTag(preceding.send);
      const key = String(tag.experiment_id) + ':' + String(tag.variant_id);
      const bucket = metrics.get(key);
      if (bucket) bucket.attributedEnrollments += 1;
    }
  }

  const totalSent = [...metrics.values()].reduce((n, v) => n + v.sent, 0);
  const totalReplies = [...metrics.values()].reduce((n, v) => n + v.replies, 0);

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-5">
      <div>
        <Link href="/automation/instagram" className="text-xs text-slate-500 hover:text-slate-900">Instagram operations</Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-950">Instagram reply experiments</h1>
        <p className="mt-1 text-sm text-slate-600">
          Read-only A/B performance for human-approved messages recorded with verified CRM context.
          No Instagram send, scheduled follow-up or marketing broadcast is launched from this page.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric title="Tagged DM replies sent" value={String(totalSent)}/>
        <Metric title="Replies within 72 hours" value={String(totalReplies)}/>
        <Metric title="Observed reply rate" value={percent(totalReplies, totalSent)}/>
      </div>
      {incomplete || inboundResult.error || enrollmentResult.error ? (
        <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Reporting is incomplete: at most 1,000 tagged sends, 4,000 inbound messages and 1,000 enrollment records are examined.
          Do not use this sample to claim a winning variant.
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[730px] text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
            <tr><th className="p-3">Experiment</th><th className="p-3">Variant</th><th className="p-3">Sent</th>
              <th className="p-3">Replied (72h)</th><th className="p-3">Reply rate</th>
              <th className="p-3">Qualified replies</th><th className="p-3">Opt-outs</th>
              <th className="p-3">Enrollments (30d)</th></tr>
          </thead>
          <tbody>
            {INSTAGRAM_REPLY_EXPERIMENTS.flatMap(experiment =>
              (['A','B'] as const).map(variant => {
                const m = metrics.get(experiment.id + ':' + variant) ?? emptyMetrics();
                return (
                  <tr className="border-b border-slate-100" key={experiment.id + ':' + variant}>
                    <td className="p-3 font-medium text-slate-800">{experiment.title}</td>
                    <td className="p-3">{variant === 'A' ? 'Control A' : 'Challenger B'}</td>
                    <td className="p-3">{m.sent}</td>
                    <td className="p-3">{m.replies}</td>
                    <td className="p-3">{percent(m.replies,m.sent)}</td>
                    <td className="p-3">{m.qualifiedReplies}</td>
                    <td className="p-3">{m.optOutReplies}</td>
                    <td className="p-3">{m.attributedEnrollments}</td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Observed customer needs from first replies</h2>
        <p className="mt-1 text-xs text-slate-500">
          Explicit keyword signals only, not model-inferred intentions or confirmed lead attributes.
        </p>
        {replySignals.size ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {[...replySignals.entries()].sort((a,b)=>b[1]-a[1]).map(([signal,count])=>(
              <span key={signal} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs">
                {signal.replaceAll('_',' ')} · {count}
              </span>
            ))}
          </div>
        ) : <p className="mt-3 text-xs text-slate-500">No verified variant replies have been recorded yet.</p>}
      </section>
      <p className="text-xs leading-5 text-slate-500">
        This is operational association, not proof of uplift or causation. Replies are associated with
        tagged sends within 72 hours; a verified enrollment is associated with the latest preceding
        tagged send for the same lead within 30 days. Other touches can contribute.
        Enrollment and reply rates require adequate, comparable sample sizes before decisions.
      </p>
    </main>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4">
    <div className="text-xs font-semibold text-slate-500">{title}</div>
    <div className="mt-1 text-2xl font-semibold text-slate-950">{value}</div>
  </div>;
}
