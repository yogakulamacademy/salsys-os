import "server-only";

import { fetchCompleteDashboardPeriodRows } from "@/lib/dashboard-period-pagination";
import {
  buildLocationBreakdown,
  type LocationBreakdown,
} from "@/lib/home-command-center";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";

/**
 * Current-state facts for the Home Command Center that the period analytics do
 * not carry: ownership, pending payment links, course interest, locations and
 * data freshness. Every query is actor-authenticated and tenant-filtered.
 * Any failure returns null for that block, never a guessed zero.
 */
export type PendingPaymentTotal = {
  currency: string;
  amount: number;
  count: number;
};

export type CourseDemandRow = {
  name: string;
  leads: number;
};

export type HomeCommandCenterSnapshot = {
  ownership: { openLeads: number; unassignedOpen: number } | null;
  payments: { pending: PendingPaymentTotal[]; paidCount: number } | null;
  courses: { totalLeads: number; tagged: number; rows: CourseDemandRow[] } | null;
  locations: LocationBreakdown | null;
  freshness: {
    adsLastSuccessAt: string | null;
    adsLatestFailed: boolean;
    instagramAppRepliesCaptured: boolean;
  };
};

type LeadRow = {
  status: string | null;
  current_stage: string | null;
  owner_user_id: string | null;
  interested_course_id: string | null;
  country: string | null;
  geo_country: string | null;
};

type PaymentRow = {
  status: string | null;
  amount: number | string | null;
  currency: string | null;
};

const CLOSED_STAGES = new Set(["enrolled", "closed_won", "lost", "duplicate", "unqualified"]);

export async function getHomeCommandCenterSnapshot(): Promise<HomeCommandCenterSnapshot> {
  const supabase = await createClient();
  const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data.user) {
    throw new Error("Unable to authenticate Home Command Center data.");
  }
  const organizationId = await requireCurrentOrganizationId(supabase, auth.data.user.id);

  const [leadResult, paymentResult, courseResult, googleSync, metaSync] = await Promise.all([
    fetchCompleteDashboardPeriodRows<LeadRow>(async (from, to) => {
      const { data, error } = await supabase
        .from("leads")
        .select("status,current_stage,owner_user_id,interested_course_id,country,geo_country")
        .eq("organization_id", organizationId)
        .neq("status", "archived")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);
      return { data: data as LeadRow[] | null, error };
    }),
    supabase
      .from("payments")
      .select("status,amount,currency")
      .eq("organization_id", organizationId)
      .in("status", ["pending", "paid"])
      .limit(1000),
    supabase
      .from("courses")
      .select("id,name")
      .eq("organization_id", organizationId)
      .limit(500),
    supabase
      .from("google_ads_sync_runs")
      .select("status,completed_at")
      .eq("organization_id", organizationId)
      .order("completed_at", { ascending: false, nullsFirst: false })
      .limit(20),
    supabase
      .from("meta_ads_sync_runs")
      .select("status,completed_at")
      .eq("organization_id", organizationId)
      .order("completed_at", { ascending: false, nullsFirst: false })
      .limit(20),
  ]);

  const leads = leadResult.error ? null : leadResult.data;

  let ownership: HomeCommandCenterSnapshot["ownership"] = null;
  if (leads) {
    const open = leads.filter(
      (lead) => lead.status === "open" && !CLOSED_STAGES.has(String(lead.current_stage ?? "")),
    );
    ownership = {
      openLeads: open.length,
      unassignedOpen: open.filter((lead) => !lead.owner_user_id).length,
    };
  }

  let payments: HomeCommandCenterSnapshot["payments"] = null;
  if (!paymentResult.error && Array.isArray(paymentResult.data)) {
    const rows = paymentResult.data as PaymentRow[];
    const pending = new Map<string, PendingPaymentTotal>();
    let paidCount = 0;
    let malformed = false;
    for (const row of rows) {
      if (row.status === "paid") {
        paidCount += 1;
        continue;
      }
      const amount = Number(row.amount);
      const currency = String(row.currency ?? "").trim().toUpperCase();
      if (!Number.isFinite(amount) || amount < 0 || !currency) {
        malformed = true;
        continue;
      }
      const total = pending.get(currency) ?? { currency, amount: 0, count: 0 };
      total.amount += amount;
      total.count += 1;
      pending.set(currency, total);
    }
    // Never merge currencies; never show a partial total as complete.
    payments = malformed
      ? null
      : { pending: [...pending.values()].sort((a, b) => b.count - a.count), paidCount };
  }

  let courses: HomeCommandCenterSnapshot["courses"] = null;
  if (leads && !courseResult.error && Array.isArray(courseResult.data)) {
    const names = new Map(
      (courseResult.data as { id: string; name: string | null }[]).map((course) => [course.id, course.name ?? "Unnamed course"]),
    );
    const counts = new Map<string, number>();
    let tagged = 0;
    for (const lead of leads) {
      if (!lead.interested_course_id) continue;
      tagged += 1;
      const name = names.get(lead.interested_course_id) ?? "Unlisted course";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    courses = {
      totalLeads: leads.length,
      tagged,
      rows: [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([name, count]) => ({ name, leads: count })),
    };
  }

  const locations = leads
    ? buildLocationBreakdown(leads.map((lead) => lead.geo_country || lead.country))
    : null;

  // Report the STALER of the two ad providers: one fresh feed must not hide
  // the other one being weeks old.
  type SyncRow = { status: string | null; completed_at: string | null };
  const providers = [googleSync, metaSync]
    .filter((result) => !result.error && Array.isArray(result.data) && result.data.length > 0)
    .map((result) => result.data as SyncRow[]);
  const lastSuccessPerProvider = providers.map((rows) =>
    rows
      .filter((row) => row.status === "success" && row.completed_at)
      .map((row) => row.completed_at as string)
      .sort()
      .pop() ?? null,
  );
  const adsLastSuccessAt = lastSuccessPerProvider.length && lastSuccessPerProvider.every(Boolean)
    ? (lastSuccessPerProvider as string[]).sort()[0]
    : null;
  const adsLatestFailed = providers.some((rows) => rows.find((row) => row.completed_at)?.status === "failed");

  return {
    ownership,
    payments,
    courses,
    locations,
    freshness: {
      adsLastSuccessAt,
      adsLatestFailed,
      instagramAppRepliesCaptured: process.env.INSTAGRAM_OUTBOUND_ECHO_ENABLED === "true",
    },
  };
}
