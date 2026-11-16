import { getVendorWorkspacePreview, type VendorWorkspace } from "@/lib/integrations/vendor-workspaces";

export function VendorWorkspaceNotice({ kind }: { kind: VendorWorkspace }) {
  const preview = getVendorWorkspacePreview(kind);

  if (!preview.previewEnabled) return null;

  return (
    <aside
      aria-label={`${preview.name} pilot`}
      className="mb-5 rounded-2xl border border-slate-300 bg-slate-50 p-4 text-sm text-slate-800"
    >
      <p className="font-semibold">Open-source workspace pilot: {preview.name}</p>
      <p className="mt-1 text-xs leading-5 text-slate-600">
        This opens an independently hosted tool. It is not yet connected to
        SalsysOS contacts, tenant permissions, automations or message delivery.
        The existing SalsysOS functions remain the system of record.
      </p>
      {preview.warning ? (
        <p role="status" className="mt-2 text-xs font-semibold text-amber-700">
          {preview.warning}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold">
        <a
          className="text-violet-700 underline underline-offset-2"
          href="/settings/vendor-workspaces"
        >
          Check engine health (read-only)
        </a>
        {preview.url ? (
          <a
            className="text-violet-700 underline underline-offset-2"
            href={preview.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open {preview.name} in a new tab
          </a>
        ) : null}
        <a
          className="text-slate-600 underline underline-offset-2"
          href={preview.repository}
          target="_blank"
          rel="noopener noreferrer"
        >
          Upstream source
        </a>
      </div>
    </aside>
  );
}
