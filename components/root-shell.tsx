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

  // Public/auth routes stay shellless.
  if (isShelllessPath(pathname)) {
    return <>{children}</>;
  }

  // CRM Studio is a workspace inside SalsysOS, not a replacement for the
  // product-level navigation. Keep the global SalsysOS rail/drawer mounted and
  // let CRM own only its inner workspace shell.
  if (isCrmStudioPath(pathname)) {
    return (
      <div className="salsys-meta-sidebar-shell crm-studio-global-shell">
        <DesktopHoverSidebar />
        <div className="crm-studio-global-host">{children}</div>

        <style jsx global>{`
          @media (min-width: 1024px) {
            .crm-studio-global-host > div > aside[aria-label='CRM Operations navigation'] {
              left: 4rem !important;
            }

            .crm-studio-global-host > div > aside[aria-label='CRM Operations navigation'] + div {
              margin-left: calc(238px + 4rem) !important;
              width: calc(100% - 238px - 4rem) !important;
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
