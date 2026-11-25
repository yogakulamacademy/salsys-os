import 'server-only';

import { saysTheyPaid } from '@/lib/home-story';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceContextForUser, requireCurrentOrganizationId } from '@/lib/workspace';
import { batchLabel, orderBatches, type CheckoutAttempt, type PaymentCheckPerson } from '@/lib/payment-check';

export type PaymentCheckData = {
  people: PaymentCheckPerson[];
  checkoutOnly: PaymentCheckPerson[];
  courses: Array<{ id: string; name: string; batches: Array<{ id: string; label: string }> }>;
  /** Names the business goes by (header name and record name), to spot its own number. */
  businessNames: string[];
  isAdmin: boolean;
  canMerge: boolean;
};

const DAY = 86_400_000;

/**
 * Everyone at Payment pending plus anyone with an unconfirmed website
 * checkout, for the signed-in user's business. Reads with the admin client
 * after resolving the business from the user's own workspace.
 */
export async function getPaymentCheckData(): Promise<PaymentCheckData | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const org = await requireCurrentOrganizationId(supabase, user.id);
    const admin = createAdminClient();
    const workspace = await getWorkspaceContextForUser(supabase, user.id).catch(() => null);

    const [{ data: canManage }, { data: canAdminister }, orgRow, pendingLeads, checkouts, courses, batches] = await Promise.all([
      supabase.rpc('can_manage_organization', { p_organization_id: org }),
      supabase.rpc('can_administer_organization_crm', { p_organization_id: org }),
      admin.from('organizations').select('name').eq('id', org).maybeSingle(),
      admin.from('leads').select('id, display_name, current_stage, interested_course_id, potential_value, potential_currency, updated_at, metadata')
        .eq('organization_id', org).eq('current_stage', 'payment_pending').limit(200),
      admin.from('payments').select('id, lead_id, amount, currency, provider, payment_kind, created_at')
        .eq('organization_id', org).eq('status', 'pending').not('provider', 'like', 'team_%').limit(500),
      admin.from('courses').select('id, name').eq('organization_id', org).order('name').limit(200),
      // Every batch, past ones too: people often pay for a batch that has already started (owner request, 25 Nov 2026).
      admin.from('course_batches').select('id, course_id, start_date, location').eq('organization_id', org)
        .order('start_date', { ascending: false }).limit(1000),
    ]);

    const attemptsByLead = new Map<string, CheckoutAttempt[]>();
    for (const p of checkouts.data ?? []) {
      const list = attemptsByLead.get(String(p.lead_id)) ?? [];
      list.push({ id: String(p.id), amount: Number(p.amount ?? 0), currency: String(p.currency ?? 'INR'), provider: String(p.provider ?? ''), kind: String(p.payment_kind ?? ''), createdAt: String(p.created_at) });
      attemptsByLead.set(String(p.lead_id), list);
    }
    const isTest = (l: Record<string, unknown>) => (l.metadata as Record<string, unknown> | null)?.test_lead === true;
    const realPending = (pendingLeads.data ?? []).filter((l) => !isTest(l));
    const pendingIds = new Set((pendingLeads.data ?? []).map((l) => String(l.id)));
    const checkoutLeadIds = [...attemptsByLead.keys()].filter((id) => !pendingIds.has(id));
    const { data: checkoutLeads } = checkoutLeadIds.length
      ? await admin.from('leads').select('id, display_name, current_stage, interested_course_id, potential_value, potential_currency, updated_at, metadata')
        .eq('organization_id', org).in('id', checkoutLeadIds).not('current_stage', 'in', '(closed_won,enrolled)')
      : { data: [] as never[] };
    // Test leads (metadata.test_lead) never show here.
    const realCheckoutLeads = (checkoutLeads ?? []).filter((l) => !isTest(l));
    const allLeads = [...realPending, ...realCheckoutLeads];
    const ids = allLeads.map((l) => String(l.id));

    const [persons, stageRows, inbound, convs] = ids.length ? await Promise.all([
      admin.from('person_leads').select('lead_id, person_id').eq('organization_id', org).in('lead_id', ids),
      admin.from('lead_stage_history').select('lead_id, changed_at').in('lead_id', ids).eq('to_stage', 'payment_pending').order('changed_at', { ascending: false }),
      admin.from('messages').select('lead_id, body, created_at').eq('organization_id', org).in('lead_id', ids).eq('direction', 'inbound').order('created_at', { ascending: false }).limit(1000),
      admin.from('conversations').select('lead_id, channel, created_at').eq('organization_id', org).in('lead_id', ids).order('created_at'),
    ]) : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];

    const personBy = new Map((persons.data ?? []).map((r: { lead_id: string; person_id: string }) => [String(r.lead_id), String(r.person_id)]));
    const enteredBy = new Map<string, string>();
    for (const r of (stageRows.data ?? []) as Array<{ lead_id: string; changed_at: string }>) if (!enteredBy.has(r.lead_id)) enteredBy.set(r.lead_id, r.changed_at);
    const lastIn = new Map<string, string>();
    for (const r of (inbound.data ?? []) as Array<{ lead_id: string; body: string | null }>) if (!lastIn.has(r.lead_id) && r.body) lastIn.set(r.lead_id, r.body);
    const channelBy = new Map<string, string>();
    for (const r of (convs.data ?? []) as Array<{ lead_id: string; channel: string }>) if (!channelBy.has(r.lead_id)) channelBy.set(r.lead_id, String(r.channel));
    const courseName = new Map((courses.data ?? []).map((c) => [String(c.id), String(c.name)]));

    const toPerson = (l: Record<string, unknown>): PaymentCheckPerson => {
      const id = String(l.id);
      const entered = enteredBy.get(id) ?? String(l.updated_at ?? '');
      const last = lastIn.get(id) ?? null;
      return {
        leadId: id, personId: personBy.get(id) ?? null, name: String(l.display_name ?? 'Unknown'),
        stage: String(l.current_stage), courseId: (l.interested_course_id as string | null) ?? null,
        courseName: l.interested_course_id ? courseName.get(String(l.interested_course_id)) ?? null : null,
        value: l.potential_value == null ? null : Number(l.potential_value), currency: (l.potential_currency as string | null) ?? null,
        channel: channelBy.get(id) ?? null,
        daysWaiting: entered ? Math.max(0, Math.round((Date.now() - Date.parse(entered)) / DAY)) : null,
        lastInbound: last ? last.replace(/\s+/g, ' ').slice(0, 140) : null,
        saysPaid: saysTheyPaid(last),
        attempts: (attemptsByLead.get(id) ?? []).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      };
    };

    const batchByCourse = new Map<string, Array<{ id: string; label: string }>>();
    for (const b of orderBatches(batches.data ?? [], new Date().toISOString().slice(0, 10))) {
      const list = batchByCourse.get(String(b.course_id)) ?? [];
      list.push({ id: String(b.id), label: batchLabel(b) });
      batchByCourse.set(String(b.course_id), list);
    }

    return {
      people: realPending.map(toPerson),
      checkoutOnly: realCheckoutLeads.map(toPerson),
      courses: (courses.data ?? []).map((c) => ({ id: String(c.id), name: String(c.name), batches: batchByCourse.get(String(c.id)) ?? [] })),
      businessNames: [workspace?.activeWorkspace?.organizationName, orgRow.data?.name as string | undefined].filter((x): x is string => Boolean(x && x.trim())),
      isAdmin: canManage === true,
      canMerge: canAdminister === true,
    };
  } catch {
    return null;
  }
}
