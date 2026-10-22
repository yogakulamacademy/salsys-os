'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { AppShell } from '@/components/app-shell';
import { DesktopHoverSidebar } from '@/components/desktop-hover-sidebar';

function isShelllessPath(pathname: string) {
  return (
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password' ||
    pathname.startsWith('/auth/')
  );
}

export function RootShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (isShelllessPath(pathname)) {
    return <>{children}</>;
  }

  // Every authenticated workspace, including CRM, uses the same product shell.
  // Module-specific navigation (CRM, Automation, etc.) lives inside page content
  // rather than replacing or bypassing the SalsysOS header/rail.
  return (
    <div className="salsys-meta-sidebar-shell">
      <DesktopHoverSidebar />
      <div className="legacy-shell-host">
        <AppShell>{children}</AppShell>
      </div>
    </div>
  );
}
