'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { AppShell } from '@/components/app-shell';

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

  // Keep auth/public routes outside the authenticated shell. This guarantees
  // AppShell mounts fresh after login so tenant/profile/navigation state loads
  // immediately without a manual browser reload.
  if (isShelllessPath(pathname)) {
    return <>{children}</>;
  }

  return <AppShell>{children}</AppShell>;
}
