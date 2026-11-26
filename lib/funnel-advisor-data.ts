import "server-only";

import { buildAdvisor, compareChange, isMeasureData, measureFunnel, normalise, type Advisor, type FunnelDef, type MeasureData, type MeasuredFunnel, type StepKey } from "@/lib/funnel-advisor";
import { managedOrganization } from "@/lib/marketing-pages-data";
import { createAdminClient } from "@/lib/supabase/admin";

export type SavedFunnel = FunnelDef & { id: string; updatedAt: string; measured: MeasuredFunnel; changes: FunnelChange[] };
export type FunnelChange = {
  id: string; step: StepKey; title: string; details: string | null; startedAt: string; endedAt: string | null;
  before: number | null; after: number | null; daysRunning: number;
};
export type FunnelAdvisorPage = {
  advisor: Advisor; funnels: SavedFunnel[]; today: string; data: MeasureData;
};

const DAY = 86_400_000;

async function measure(org: string, from: Date, to: Date): Promise<MeasureData | null> {
  const { data, error } = await createAdminClient().rpc("marketing_funnel_measure_v1", { p_organization_id: org, p_from: from.toISOString(), p_to: to.toISOString() });
  return error || !isMeasureData(data) ? null : normalise(data);
}

/** Funnel advisor for managers and admins (owner-approved, 26 Nov 2026); null when it can't be read. */
export async function getFunnelAdvisor(): Promise<FunnelAdvisorPage | null> {
  try {
    const org = await managedOrganization();
    if (!org) return null;
    const now = new Date();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
    const current = await measure(org, new Date(now.getTime() - 90 * DAY), now);
    if (!current) return null;
    const admin = createAdminClient();
    const [{ data: rows }, { data: changeRows }] = await Promise.all([
      admin.from("marketing_funnels").select("id, kind, name, course_id, goal, steps, pages, terms, status, updated_at")
        .eq("organization_id", org).neq("status", "archived").order("updated_at", { ascending: false }).limit(50),
      admin.from("marketing_funnel_changes").select("id, funnel_id, step, title, details, started_at, ended_at")
        .eq("organization_id", org).order("started_at", { ascending: false }).limit(100),
    ]);
    const funnels: SavedFunnel[] = [];
    let compared = 0;
    for (const r of (rows ?? []) as any[]) {
      const def: FunnelDef = {
        id: r.id, kind: r.kind === "seo" ? "seo" : "general", name: r.name, courseId: r.course_id, goal: r.goal,
        steps: Array.isArray(r.steps) ? r.steps : [], pages: Array.isArray(r.pages) ? r.pages : [], terms: Array.isArray(r.terms) ? r.terms : [],
        status: r.status,
      };
      const changes: FunnelChange[] = [];
      for (const c of ((changeRows ?? []) as any[]).filter((x) => x.funnel_id === r.id).slice(0, 5)) {
        const start = new Date(c.started_at);
        const end = c.ended_at ? new Date(c.ended_at) : now;
        const span = Math.max(end.getTime() - start.getTime(), 7 * DAY);
        let before: number | null = null, after: number | null = null;
        if (compared < 6 && end.getTime() - start.getTime() >= DAY) {
          compared += 1;
          const [b, a] = await Promise.all([measure(org, new Date(start.getTime() - span), start), measure(org, start, end)]);
          if (b && a) ({ before, after } = compareChange(def, c.step, b, a));
        }
        changes.push({ id: c.id, step: c.step, title: c.title, details: c.details, startedAt: c.started_at, endedAt: c.ended_at, before, after, daysRunning: Math.max(0, Math.round((end.getTime() - start.getTime()) / DAY)) });
      }
      funnels.push({ ...def, id: r.id, updatedAt: r.updated_at, measured: measureFunnel(def, current), changes });
    }
    return {
      advisor: buildAdvisor(current, today), funnels, today,
      // Sent to the page so the funnel builder can preview numbers as steps are added.
      data: { ...current, pages: current.pages.filter((p) => p.visits >= 2).slice(0, 200), searchTerms: current.searchTerms.slice(0, 300) },
    };
  } catch {
    return null;
  }
}
