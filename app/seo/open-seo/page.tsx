import Link from "next/link";

import { getOpenSeoProjectInventory } from "@/lib/integrations/openseo-mcp-projects";
import { requireAdminWorkspaceAccess } from "@/lib/route-access";

export const dynamic = "force-dynamic";

export default async function OpenSeoProjectsPage() {
  const workspace = await requireAdminWorkspaceAccess();
  const inventory = await getOpenSeoProjectInventory(workspace.organizationId);

  return (
    <main className="mx-auto max-w-5xl space-y-5 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
            SEO integration · read-only
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
            OpenSEO projects
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Verified project inventory from OpenSEO’s zero-credit MCP tool.
            This does not change existing Search Console, SEO, attribution
            or revenue records in SalsysOS.
          </p>
        </div>
        <Link href="/seo" className="text-sm font-semibold text-violet-700 underline underline-offset-2">
          Back to SalsysOS SEO
        </Link>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Connection: {inventory.status.replaceAll("_", " ")}
        </div>
        <p role="status" className="mt-2 text-sm text-slate-700">{inventory.message}</p>
        {inventory.checkedAt ? (
          <p className="mt-2 text-xs text-slate-500">
            Last observed {inventory.checkedAt}
          </p>
        ) : null}
        {inventory.status === "connected" && inventory.projects.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                  <th className="px-3 py-3">Project</th>
                  <th className="px-3 py-3">Domain</th>
                  <th className="px-3 py-3">Market</th>
                  <th className="px-3 py-3">Rank tracking</th>
                </tr>
              </thead>
              <tbody>
                {inventory.projects.map((project) => (
                  <tr key={project.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-3 font-semibold text-slate-900">{project.name}</td>
                    <td className="px-3 py-3 text-slate-600">{project.domain || "—"}</td>
                    <td className="px-3 py-3 text-slate-600">
                      {project.locationCode} / {project.languageCode || "Unknown"}
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/seo/open-seo/rank-trackers?projectId=${encodeURIComponent(project.id)}`}
                        className="font-semibold text-violet-700 underline underline-offset-2"
                      >
                        View saved trackers
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
      <p className="text-xs leading-5 text-slate-500">
        External tool results are read-only. A successful listing is not proof
        that a site audit, paid SEO research, Google Search Console authorization,
        or a scheduled synchronization is configured.
      </p>
    </main>
  );
}
