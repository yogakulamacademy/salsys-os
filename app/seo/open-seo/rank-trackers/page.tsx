import Link from "next/link";

import { getOpenSeoRankTrackerInventory } from "@/lib/integrations/openseo-mcp-projects";
import { requireAdminWorkspaceAccess } from "@/lib/route-access";

export const dynamic = "force-dynamic";

export default async function OpenSeoRankTrackersPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const workspace = await requireAdminWorkspaceAccess();
  const query = await searchParams;
  const projectId = typeof query.projectId === "string" && query.projectId.length <= 256
    ? query.projectId
    : "";
  const inventory = await getOpenSeoRankTrackerInventory(workspace.organizationId, projectId);

  return (
    <main className="mx-auto max-w-5xl space-y-5 pb-10">
      <header>
        <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
          SEO integration · read-only
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
          Saved OpenSEO rank trackers
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Existing tracker configurations from OpenSEO. Viewing this page uses
          zero credits and does not schedule rank checks or change SalsysOS data.
        </p>
        <Link className="mt-3 inline-block text-sm font-semibold text-violet-700 underline underline-offset-2" href="/seo/open-seo">
          Back to OpenSEO projects
        </Link>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Connection: {inventory.status.replaceAll("_", " ")}
        </div>
        <p role="status" className="mt-2 text-sm text-slate-700">{inventory.message}</p>
        {inventory.project ? (
          <p className="mt-2 text-sm font-semibold text-slate-800">
            {inventory.project.name} · {inventory.project.domain || "No domain specified"}
          </p>
        ) : null}
        {inventory.checkedAt ? (
          <p className="mt-2 text-xs text-slate-500">Last observed {inventory.checkedAt}</p>
        ) : null}
        {inventory.status === "connected" && inventory.trackers.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                  <th className="px-3 py-3">Domain</th>
                  <th className="px-3 py-3">Market</th>
                  <th className="px-3 py-3">Schedule</th>
                  <th className="px-3 py-3">Last checked</th>
                </tr>
              </thead>
              <tbody>
                {inventory.trackers.map((tracker) => (
                  <tr key={tracker.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-3 font-semibold text-slate-900">{tracker.domain}</td>
                    <td className="px-3 py-3 text-slate-600">
                      {tracker.locationName || tracker.locationCode || "Unknown"} · {tracker.languageCode || "Unknown"}
                    </td>
                    <td className="px-3 py-3 text-slate-600">{tracker.scheduleInterval || "Not recorded"}</td>
                    <td className="px-3 py-3 text-slate-600">{tracker.lastCheckedAt || "Never verified"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
      <p className="text-xs leading-5 text-slate-500">
        No current keyword position or freshness guarantees are inferred from
        a tracker configuration. Paid rank checks remain controlled inside OpenSEO.
      </p>
    </main>
  );
}
