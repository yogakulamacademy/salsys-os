'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { AppShell } from '@/components/app-shell';
import { DesktopHoverSidebar } from '@/components/desktop-hover-sidebar';

const CRM_STUDIO_PREFIXES = [
  '/crm',
  '/leads',
  '/admissions',
  '/follow-ups',
  '/pipeline',
  '/customer-360',
  '/contact-intelligence',
  '/data-quality',
] as const;

function isShelllessPath(pathname: string) {
  return (
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password' ||
    pathname.startsWith('/auth/')
  );
}

function isCrmStudioPath(pathname: string) {
  return CRM_STUDIO_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function RootShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (isShelllessPath(pathname)) {
    return <>{children}</>;
  }

  if (isCrmStudioPath(pathname)) {
    return (
      <div className="salsys-meta-sidebar-shell crm-studio-global-shell">
        <DesktopHoverSidebar />
        <div className="crm-studio-global-host">{children}</div>

        <style jsx global>{`
          .crm-studio-global-host {
            min-height: 100vh;
            padding: 20px 20px 0;
            background: #ffffff;
          }

          @media (min-width: 1024px) {
            .crm-studio-global-host {
              margin-left: 4rem;
              width: calc(100% - 4rem);
              padding: 20px 24px 0;
            }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="salsys-meta-sidebar-shell">
      <DesktopHoverSidebar />
      <div className="legacy-shell-host">
        <AppShell>{children}</AppShell>
      </div>
    </div>
  );
}
