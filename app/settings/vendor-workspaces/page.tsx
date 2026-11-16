import Link from "next/link";

import { checkVendorWorkspaceHealth } from "@/lib/integrations/vendor-workspace-health";
import {
  getVendorWorkspacePreview,
  type VendorWorkspace,
} from "@/lib/integrations/vendor-workspaces";
import { requireAdminWorkspaceAccess } from "@/lib/route-access";

export const dynamic = "force-dynamic";

const kinds: VendorWorkspace[] = ["open-seo", "deskcomm"];

export default async function VendorWorkspaceDiagnosticsPage() {
  await requireAdminWorkspaceAccess();
  const results = await Promise.all(kinds.map((kind) => checkVendorWorkspaceHealth(kind)));

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-10">
      <header>
        <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
          Integration diagnostics
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
          Open-source engine readiness
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Read-only health checks of independently hosted SEO and messaging tools.
          A reachable application is not a connected CRM, approved WhatsApp
          sender, authenticated data adapter, or safe production cutover.
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        {kinds.map((kind, index) => {
          const preview = getVendorWorkspacePreview(kind);
          const health = results[index];
          return (
            <section key={kind} className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-base font-bold text-slate-950">{health.name}</h2>
              <div className="mt-2 text-xs font-semibold text-slate-500">
                Transport status: {health.state.replaceAll("_", " ")}
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{health.message}</p>
              {health.checkedAt ? (
                <p className="mt-2 text-[11px] text-slate-500">
                  Observed {health.checkedAt}
                </p>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold">
                {preview.previewEnabled && preview.url ? (
                  <a
                    href={preview.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-violet-700 underline underline-offset-2"
                  >
                    Open separate application
                  </a>
                ) : null}
                <a
                  href={preview.repository}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-600 underline underline-offset-2"
                >
                  Upstream repository
                </a>
              </div>
            </section>
          );
        })}
      </div>
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
        No vendor credentials or customer records are sent with these probes.
        Do not enable outbound automation or delete legacy CRM features based on a health result.
      </div>
      <Link className="text-sm font-semibold text-violet-700 underline underline-offset-2" href="/settings">
        Return to settings
      </Link>
    </div>
  );
}
