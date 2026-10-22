'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { AppShell } from '@/components/app-shell';
import { DesktopHoverSidebarV3 } from '@/components/desktop-hover-sidebar-v3';
import { MarketingWorkspaceFrame } from '@/components/marketing/marketing-workspace-frame';

function isShelllessPath(pathname: string) {
  return (
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password' ||
    pathname.startsWith('/auth/')
  );
}

function isMarketingPath(pathname: string) {
  return [
    '/marketing',
    '/campaigns',
    '/attribution',
    '/funnel',
    '/paid-media-leads',
    '/re-engaged',
    '/seo',
    '/analytics',
    '/revenue',
    '/tracking',
  ].some((href) => pathname === href || pathname.startsWith(`${href}/`));
}

export function RootShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (isShelllessPath(pathname)) {
    return <>{children}</>;
  }

  const content = isMarketingPath(pathname) ? (
    <MarketingWorkspaceFrame>{children}</MarketingWorkspaceFrame>
  ) : (
    children
  );

  return (
    <div className="salsys-meta-sidebar-shell">
      <DesktopHoverSidebarV3 />
      <div className="legacy-shell-host">
        <AppShell>{content}</AppShell>
      </div>
    </div>
  );
}
