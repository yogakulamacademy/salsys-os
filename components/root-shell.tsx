'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';

import { AppShell } from '@/components/app-shell';
import { DesktopHoverSidebarV3 } from '@/components/desktop-hover-sidebar-v3';

const MarketingWorkspaceFrame = dynamic(() =>
  import('@/components/marketing/marketing-workspace-frame').then(
    (module) => module.MarketingWorkspaceFrame,
  ),
);

const InvestigationContextBar = dynamic(() =>
  import('@/components/investigation-context-bar').then(
    (module) => module.InvestigationContextBar,
  ),
);

function isShelllessPath(pathname: string) {
  return (
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password' ||
    pathname === '/onboarding' ||
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

function hasInvestigationContext(pathname: string) {
  return pathname === '/revenue' || /^\/leads\/[^/]+$/.test(pathname);
}

export function RootShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (isShelllessPath(pathname)) {
    return <>{children}</>;
  }

  const routeContent = (
    <>
      {hasInvestigationContext(pathname) ? (
        <Suspense fallback={null}>
          <InvestigationContextBar />
        </Suspense>
      ) : null}
      {children}
    </>
  );

  const content = isMarketingPath(pathname) ? (
    <MarketingWorkspaceFrame>{routeContent}</MarketingWorkspaceFrame>
  ) : (
    routeContent
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
