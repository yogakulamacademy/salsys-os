import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type PanelPayment = { id: string; amount: number; currency: string | null; status: string; kind: string; method: string | null; reference: string | null; paidAt: string | null; rejectReason: string | null };
export type PanelEnrollment = {
  id: string; courseName: string; batchLabel: string | null; status: string; total: number | null; currency: string | null;
  paidVerified: number; paidPending: number; balanceDueDate: string | null; expectedPaymentDate: string | null; payments: PanelPayment[];
};
export type EnrollmentPanel = {
  canRecord: boolean; isAdmin: boolean; ownerAssigned: boolean;
  courses: Array<{ id: string; name: string }>;
  batches: Array<{ id: string; courseId: string; label: string }>;
  defaults: { courseId: string | null; total: number | null; currency: string };
  enrollments: PanelEnrollment[];
};

const methodOf = (provider: string | null, metadata: Record<string, unknown> | null) =>
  (typeof metadata?.method === "string" ? metadata.method : null) ?? (provider?.startsWith("team_logged:") ? provider.slice(12) : provider);

export type EnrollmentCatalog = Pick<EnrollmentPanel, 'courses' | 'batches'>;
const labelForBatch = (b: { start_date: unknown; location?: string | null }) =>
  `${new Date(String(b.start_date)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}${b.location ? ` · ${b.location}` : ""}`;

/** Form choices are read only when an authorized operator opens the form. */
export async function getEnrollmentCatalog(client: SupabaseClient, leadId: string, userId: string): Promise<EnrollmentCatalog | null> {
  const { data: lead, error: leadError } = await client.from('leads').select('id,organization_id,owner_user_id').eq('id', leadId).maybeSingle();
  if (leadError) throw new Error('Unable to verify enrollment access.');
  if (!lead) return null;
  const org = String(lead.organization_id);
  const { data: isAdmin, error: roleError } = await client.rpc('can_manage_organization', { p_organization_id: org });
  if (roleError) throw new Error('Unable to verify enrollment access.');
  const ownsLead = lead.owner_user_id != null && String(lead.owner_user_id) === userId;
  if (isAdmin !== true && !ownsLead) return null;
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
  const [courses, batches] = await Promise.all([
    client.from('courses').select('id,name').eq('organization_id', org).eq('active', true).order('name'),
    client.from('course_batches').select('id,course_id,start_date,location,mode').eq('organization_id', org).gte('start_date', since).order('start_date').limit(300),
  ]);
  if (courses.error || batches.error) throw new Error('Enrollment choices could not be loaded. Please try again.');
  return {
    courses: (courses.data ?? []).map(c => ({ id: String(c.id), name: String(c.name) })),
    batches: (batches.data ?? []).map(b => ({ id: String(b.id), courseId: String(b.course_id), label: labelForBatch(b) })),
  };
}

/** Enrollment/payment summary; fetch only labels referenced by existing records. */
export async function getEnrollmentPanel(client: SupabaseClient, leadId: string, userId: string): Promise<EnrollmentPanel | null> {
  const { data: lead } = await client.from("leads")
    .select("id, organization_id, owner_user_id, interested_course_id, potential_value, potential_currency").eq("id", leadId).maybeSingle();
  if (!lead) return null;
  const org = String(lead.organization_id);
  const [{ data: isAdmin }, { data: enrollments }, { data: payments }] = await Promise.all([
    client.rpc("can_manage_organization", { p_organization_id: org }),
    client.from("enrollments").select("id, course_id, batch_id, status, total_value, currency, metadata, enrolled_at").eq("lead_id", leadId).order("enrolled_at", { ascending: false }),
    client.from("payments").select("id, enrollment_id, amount, currency, status, payment_kind, provider, external_payment_id, paid_at, metadata").eq("lead_id", leadId).order("paid_at", { ascending: true }),
  ]);
  const courseIds = [...new Set((enrollments ?? []).flatMap(e => e.course_id ? [String(e.course_id)] : []))];
  const batchIds = [...new Set((enrollments ?? []).flatMap(e => e.batch_id ? [String(e.batch_id)] : []))];
  const [{ data: courses }, { data: batches }] = await Promise.all([
    courseIds.length ? client.from('courses').select('id,name').eq('organization_id', org).in('id', courseIds) : Promise.resolve({ data: [] }),
    batchIds.length ? client.from('course_batches').select('id,start_date,location').eq('organization_id', org).in('id', batchIds) : Promise.resolve({ data: [] }),
  ]);
  const courseName = new Map((courses ?? []).map((c) => [String(c.id), String(c.name)]));
  const batchLabel = new Map((batches ?? []).map((b) => [String(b.id),
    labelForBatch(b)]));
  const panelEnrollments: PanelEnrollment[] = (enrollments ?? []).map((e) => {
    const md = (e.metadata ?? {}) as Record<string, unknown>;
    const pays = (payments ?? []).filter((p) => p.enrollment_id === e.id).map((p) => {
      const pmd = (p.metadata ?? {}) as Record<string, unknown>;
      return { id: String(p.id), amount: Number(p.amount ?? 0), currency: p.currency ?? null, status: String(p.status), kind: String(p.payment_kind),
        method: methodOf(p.provider ?? null, pmd), reference: p.external_payment_id ?? null, paidAt: p.paid_at ?? null,
        rejectReason: typeof pmd.reject_reason === "string" ? pmd.reject_reason : null };
    });
    return {
      id: String(e.id), courseName: courseName.get(String(e.course_id)) ?? "Course", batchLabel: e.batch_id ? batchLabel.get(String(e.batch_id)) ?? null : null,
      status: String(e.status), total: e.total_value == null ? null : Number(e.total_value), currency: e.currency ?? null,
      paidVerified: pays.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0),
      paidPending: pays.filter((p) => p.status === "pending").reduce((s, p) => s + p.amount, 0),
      balanceDueDate: typeof md.balance_due_date === "string" ? md.balance_due_date : null,
      expectedPaymentDate: typeof md.expected_payment_date === "string" ? md.expected_payment_date : null,
      payments: pays,
    };
  });
  const admin = isAdmin === true;
  return {
    canRecord: admin || (lead.owner_user_id != null && String(lead.owner_user_id) === userId),
    isAdmin: admin,
    ownerAssigned: lead.owner_user_id != null,
    courses: [],
    batches: [],
    defaults: { courseId: lead.interested_course_id ? String(lead.interested_course_id) : null, total: lead.potential_value == null ? null : Number(lead.potential_value), currency: lead.potential_currency ?? "INR" },
    enrollments: panelEnrollments,
  };
}

export type PaymentToVerify = {
  id: string; leadId: string; leadName: string; courseName: string | null; amount: number; currency: string | null; kind: string;
  method: string | null; reference: string | null; paidAt: string | null; loggedAt: string;
};

/** Team-logged payments waiting for an admin (user client, RLS applies). */
export async function getPaymentsToVerify(client: SupabaseClient, organizationId: string): Promise<PaymentToVerify[]> {
  const { data: rows } = await client.from("payments")
    .select("id, lead_id, enrollment_id, amount, currency, payment_kind, provider, external_payment_id, paid_at, created_at, metadata")
    .eq("organization_id", organizationId).eq("status", "pending").like("provider", "team_logged:%").order("created_at", { ascending: true }).limit(100);
  if (!rows?.length) return [];
  const leadIds = [...new Set(rows.map((r) => String(r.lead_id)))];
  const enrIds = [...new Set(rows.map((r) => r.enrollment_id).filter(Boolean).map(String))];
  const [{ data: leads }, { data: enrs }] = await Promise.all([
    client.from("leads").select("id, display_name").in("id", leadIds),
    enrIds.length ? client.from("enrollments").select("id, courses(name)").in("id", enrIds) : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ]);
  const leadName = new Map((leads ?? []).map((l) => [String(l.id), String(l.display_name ?? "Lead")]));
  const courseOf = new Map((enrs ?? []).map((e) => {
    const c = Array.isArray(e.courses) ? e.courses[0] : e.courses;
    return [String(e.id), (c as { name?: string } | null)?.name ?? null];
  }));
  return rows.map((r) => ({
    id: String(r.id), leadId: String(r.lead_id), leadName: leadName.get(String(r.lead_id)) ?? "Lead",
    courseName: r.enrollment_id ? courseOf.get(String(r.enrollment_id)) ?? null : null,
    amount: Number(r.amount ?? 0), currency: r.currency ?? null, kind: String(r.payment_kind),
    method: methodOf(r.provider ?? null, (r.metadata ?? {}) as Record<string, unknown>), reference: r.external_payment_id ?? null,
    paidAt: r.paid_at ?? null, loggedAt: String(r.created_at),
  }));
}
