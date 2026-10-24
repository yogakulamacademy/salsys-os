'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * Route-aware hook for the global motion system.
 * `display: contents` keeps this marker out of layout calculations while
 * allowing CSS to scope motion to complex product surfaces without coupling
 * those components to an animation library.
 */
export function MotionRouteSurface({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '';

  return (
    <div data-motion-route={pathname} style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
