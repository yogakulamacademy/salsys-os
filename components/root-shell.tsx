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

  // Public/auth pages render without the authenticated application shell.
  // CRM Operations also owns its complete shell so the Studio navigation,
  // spacing and top bar are never nested inside the legacy two-rail AppShell.
  if (isShelllessPath(pathname) || isCrmStudioPath(pathname)) {
    return <>{children}</>;
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
