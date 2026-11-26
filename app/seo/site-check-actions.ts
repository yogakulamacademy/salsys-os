"use server";

import { revalidatePath } from "next/cache";

import { managedOrganization } from "@/lib/marketing-pages-data";
import { createClient } from "@/lib/supabase/server";

// "Check all pages now" on Site health (owner-approved 26 Nov 2026). Runs the
// existing seo-crawler function on the signed-in user's session; the function
// re-checks membership and only fetches the saved site (and its www twin).

export type SiteCheckStep = { ok: boolean; message: string; runId?: string; done?: boolean; fetched?: number; discovered?: number; failed?: number };

const bare = (h: string) => h.toLowerCase().replace(/^www\./, "");

export async function siteCheckStepAction(input: { host?: string; runId?: string }): Promise<SiteCheckStep> {
  try {
    const org = await managedOrganization();
    if (!org) return { ok: false, message: "Only managers and admins can run a site check." };
    const supabase = await createClient();
    // Small batches: each page takes a few seconds and the function has a time limit.
    let body: Record<string, unknown>;
    if (input.runId) {
      body = { action: "resume", runId: String(input.runId), pageBudget: 5 };
    } else {
      const host = bare(String(input.host ?? ""));
      const { data: sites } = await supabase.from("organization_sites").select("id,hostname,status").eq("organization_id", org).eq("status", "active");
      const site = (sites ?? []).find((s) => bare(String(s.hostname)) === host);
      if (!site) return { ok: false, message: "Your website isn’t saved for this workspace yet." };
      // Carry on with an unfinished check from the last day instead of starting over.
      const { data: open } = await supabase.from("seo_crawl_runs").select("id").eq("organization_id", org).eq("site_id", site.id).eq("status", "running")
        .gte("started_at", new Date(Date.now() - 86_400_000).toISOString()).order("started_at", { ascending: false }).limit(1).maybeSingle();
      body = open?.id ? { action: "resume", runId: String(open.id), pageBudget: 5 } : { action: "start", siteId: site.id, crawlMode: "full", maxPages: 400, pageBudget: 5 };
    }
    const { data, error } = await supabase.functions.invoke("seo-crawler", { body });
    if (error || !data?.runId) return { ok: false, message: input.runId ? "The check paused. Click the button to carry on." : "The site check didn’t start. Please try again." };
    const done = data.status !== "running";
    if (done) revalidatePath("/seo/technical");
    return { ok: true, message: done ? "Site check finished." : "Checking pages…", runId: String(data.runId), done, fetched: Number(data.pagesFetched ?? 0), discovered: Number(data.pagesDiscovered ?? 0), failed: Number(data.pagesFailed ?? 0) };
  } catch {
    return { ok: false, message: "That did not go through. Please try again." };
  }
}
