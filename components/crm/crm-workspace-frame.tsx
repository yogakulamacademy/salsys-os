import type { ReactNode } from 'react';

import automationStyles from '@/app/automation/automation-studio.module.css';
import { CrmLeadInspectorBridge } from '@/components/crm/crm-lead-inspector-bridge';
import { CrmNavigation } from '@/components/crm/crm-navigation';
import { LiveRefresh } from '@/components/live-refresh';
import { useMockData } from '@/lib/config';

export function CrmWorkspaceFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <div
        className={`crm-brand-scope ${automationStyles.studio} grid gap-5 min-[768px]:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[238px_minmax(0,1fr)] xl:gap-6`}
      >
        <LiveRefresh enabled={!useMockData} />
        <CrmNavigation />
        <CrmLeadInspectorBridge>
          <main className="min-w-0 pb-8">{children}</main>
        </CrmLeadInspectorBridge>
      </div>

      <style>{`
        body:has(.crm-brand-scope) .legacy-shell-host > div {
          background: #f6f8f7 !important;
          color: #192e29 !important;
        }

        body:has(.crm-brand-scope) .legacy-shell-host header {
          border-color: #e4eae6 !important;
          background: rgba(255, 255, 255, 0.96) !important;
        }

        body:has(.crm-brand-scope) .legacy-shell-host aside {
          border-color: #e4eae6 !important;
          background: #ffffff !important;
        }

        body:has(.crm-brand-scope) .legacy-shell-host aside svg,
        body:has(.crm-brand-scope) .legacy-shell-host header svg {
          color: #91a096;
        }

        body:has(.crm-brand-scope) .legacy-shell-host aside button:hover,
        body:has(.crm-brand-scope) .legacy-shell-host aside a:hover {
          color: #216551 !important;
        }

        body:has(.crm-brand-scope) .legacy-shell-host aside button:hover svg,
        body:has(.crm-brand-scope) .legacy-shell-host aside a:hover svg {
          color: #216551 !important;
        }

        body:has(.crm-brand-scope) .legacy-shell-host aside button[aria-pressed='true'] {
          background: #153e33 !important;
          color: #ffffff !important;
        }

        body:has(.crm-brand-scope) .legacy-shell-host aside button[aria-pressed='true'] svg {
          color: #ffffff !important;
        }

        body:has(.crm-brand-scope) .legacy-shell-host aside a[class*='bg-slate-100'] {
          background: #eaf4ed !important;
          color: #216551 !important;
        }

        body:has(.crm-brand-scope) .legacy-shell-host aside a[class*='bg-slate-100'] svg {
          color: #216551 !important;
        }

        body:has(.crm-brand-scope) .legacy-shell-host header button[class*='border-slate-200'] {
          border-color: #e4eae6 !important;
          background: #ffffff !important;
          color: #6d7c76 !important;
        }

        body:has(.crm-brand-scope) .legacy-shell-host header button[class*='border-slate-200']:hover {
          border-color: #cfdad2 !important;
          background: #f0f7f3 !important;
          color: #216551 !important;
        }

        body:has(.crm-brand-scope) .legacy-shell-host header button[class*='border-slate-200']:hover svg {
          color: #216551 !important;
        }

        body:has(.crm-brand-scope) .legacy-shell-host header .text-violet-500,
        body:has(.crm-brand-scope) .legacy-shell-host header .text-violet-600,
        body:has(.crm-brand-scope) .legacy-shell-host aside .text-violet-500,
        body:has(.crm-brand-scope) .legacy-shell-host aside .text-violet-600 {
          color: #216551 !important;
        }

        body:has(.crm-brand-scope) .legacy-shell-host .bg-violet-50,
        body:has(.crm-brand-scope) .legacy-shell-host .bg-violet-50\\/70 {
          background: #f0f7f3 !important;
        }

        body:has(.crm-brand-scope) .legacy-shell-host .border-violet-100,
        body:has(.crm-brand-scope) .legacy-shell-host .border-violet-200 {
          border-color: #cfe0d4 !important;
        }

        body:has(.crm-brand-scope) .legacy-shell-host main {
          background: #f6f8f7;
        }
      `}</style>
    </>
  );
}
