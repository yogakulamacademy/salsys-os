'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';

import { AppShell } from '@/components/app-shell';
import { CanonicalRouteBridge } from '@/components/canonical-route-bridge';
import { DesktopHoverSidebarV3 } from '@/components/desktop-hover-sidebar-v3';
import { ProductCapabilityNavigationGate } from '@/components/product-capability-navigation-gate';

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
    pathname.startsWith('/onboarding/') ||
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
    '/seo',
    '/analytics',
    '/revenue',
    '/tracking',
  ].some((href) => pathname === href || pathname.startsWith(`${href}/`));
}

function hasInvestigationContext(pathname: string) {
  return (
    [
      '/admissions',
      '/marketing',
      '/revenue',
      '/leads',
      '/follow-ups',
      '/conversations',
      '/operations',
      '/performance',
    ].includes(pathname) || /^\/leads\/[^/]+$/.test(pathname)
  );
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
    <ProductCapabilityNavigationGate>
      <div className="salsys-meta-sidebar-shell">
        <CanonicalRouteBridge />
        <DesktopHoverSidebarV3 />
        <div className="legacy-shell-host">
          <AppShell>{content}</AppShell>
        </div>
      </div>
    </ProductCapabilityNavigationGate>
  );
}
