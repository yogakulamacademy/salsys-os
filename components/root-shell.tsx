'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { AppShell } from '@/components/app-shell';
import { DesktopHoverSidebarV3 } from '@/components/desktop-hover-sidebar-v3';

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

  // Do not mount the authenticated AppShell on public/auth pages. AppShell
  // resolves profile + tenant context in effects. If it mounts while the user is
  // still signed out, those effects settle to an empty workspace and React can
  // preserve that same AppShell instance across the post-login navigation.
  // Keeping auth pages shellless guarantees a fresh AppShell mount after a
  // successful sign-in, so navigation and workspace identity resolve immediately
  // without requiring a manual browser reload.
  if (isShelllessPath(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="salsys-meta-sidebar-shell">
      <DesktopHoverSidebarV3 />
      <div className="legacy-shell-host">
        <AppShell>{children}</AppShell>
      </div>
    </div>
  );
}
