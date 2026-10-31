import type { ReactNode } from 'react';

import { CrmLeadInspectorBridge } from '@/components/crm/crm-lead-inspector-bridge';
import { CrmNavigation } from '@/components/crm/crm-navigation';
import workspaceStyles from '@/components/marketing/marketing-workspace-frame.module.css';

export function CrmWorkspaceFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <div
        className={`crm-brand-scope ${workspaceStyles.studio} grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[238px_minmax(0,1fr)] xl:gap-6`}
      >
        <CrmNavigation />
        <div className="min-w-0 pb-8">
          <CrmLeadInspectorBridge>{children}</CrmLeadInspectorBridge>
        </div>
      </div>

      <style>{`
        /* Match Growth workspace behavior: sticky child navigation must not live
         * inside the transformed AppShell page-enter wrapper. */
        .page-transition:has(.crm-brand-scope) {
          animation: none !important;
          transform: none !important;
        }

        body:has(.crm-brand-scope) .legacy-shell-host > div {
          background: var(--app-bg) !important;
          color: var(--app-text) !important;
        }

        body:has(.crm-brand-scope) .legacy-shell-host header {
          border-color: var(--app-border) !important;
          background: color-mix(in srgb, var(--app-surface) 96%, transparent) !important;
        }

        body:has(.crm-brand-scope) .legacy-shell-host aside {
          border-color: var(--app-border) !important;
          background: var(--app-surface) !important;
        }

        body:has(.crm-brand-scope) .legacy-shell-host aside svg,
        body:has(.crm-brand-scope) .legacy-shell-host header svg {
          color: var(--app-text-subtle);
        }

        body:has(.crm-brand-scope) .legacy-shell-host aside button:hover,
        body:has(.crm-brand-scope) .legacy-shell-host aside a:hover {
          color: var(--app-brand-700) !important;
        }

        body:has(.crm-brand-scope) .legacy-shell-host aside button:hover svg,
        body:has(.crm-brand-scope) .legacy-shell-host aside a:hover svg {
          color: var(--app-brand-700) !important;
        }

        body:has(.crm-brand-scope) .legacy-shell-host aside button[aria-pressed='true'] {
          background: var(--app-brand-900) !important;
          color: #ffffff !important;
        }

        body:has(.crm-brand-scope) .legacy-shell-host aside button[aria-pressed='true'] svg {
          color: #ffffff !important;
        }

        body:has(.crm-brand-scope) .legacy-shell-host aside a[class*='bg-slate-100'] {
          background: var(--app-brand-50) !important;
          color: var(--app-brand-700) !important;
        }

        body:has(.crm-brand-scope) .legacy-shell-host aside a[class*='bg-slate-100'] svg {
          color: var(--app-brand-700) !important;
        }

        body:has(.crm-brand-scope) .legacy-shell-host header button[class*='border-slate-200'] {
          border-color: var(--app-border) !important;
          background: var(--app-surface) !important;
          color: var(--app-text-muted) !important;
        }

        body:has(.crm-brand-scope) .legacy-shell-host header button[class*='border-slate-200']:hover {
          border-color: var(--app-border-strong) !important;
          background: var(--app-brand-50) !important;
          color: var(--app-brand-700) !important;
        }

        body:has(.crm-brand-scope) .legacy-shell-host header button[class*='border-slate-200']:hover svg {
          color: var(--app-brand-700) !important;
        }

        body:has(.crm-brand-scope) .legacy-shell-host header .text-violet-500,
        body:has(.crm-brand-scope) .legacy-shell-host header .text-violet-600,
        body:has(.crm-brand-scope) .legacy-shell-host aside .text-violet-500,
        body:has(.crm-brand-scope) .legacy-shell-host aside .text-violet-600 {
          color: var(--app-brand-700) !important;
        }

        body:has(.crm-brand-scope) .legacy-shell-host .bg-violet-50,
        body:has(.crm-brand-scope) .legacy-shell-host .bg-violet-50\\/70 {
          background: var(--app-brand-50) !important;
        }

        body:has(.crm-brand-scope) .legacy-shell-host .border-violet-100,
        body:has(.crm-brand-scope) .legacy-shell-host .border-violet-200 {
          border-color: var(--app-border-strong) !important;
        }

        body:has(.crm-brand-scope) .legacy-shell-host main {
          background: var(--app-bg);
        }
      `}</style>
    </>
  );
}
