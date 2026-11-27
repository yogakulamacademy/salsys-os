'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { createWorkspaceRequest } from '@/lib/workspace-request';

const WorkspaceRequestContext = createContext<ReturnType<typeof createWorkspaceRequest> | null>(null);

export function WorkspaceRequestProvider({ children }: { children: ReactNode }) {
  // Scope in-flight reads to this mounted authenticated shell, never the server
  // or another account tree. The shell unmounts on login/logout routes.
  const [request] = useState(() => createWorkspaceRequest());
  return <WorkspaceRequestContext.Provider value={request}>{children}</WorkspaceRequestContext.Provider>;
}

export function useWorkspaceRequest() {
  const scoped = useContext(WorkspaceRequestContext);
  const [fallback] = useState(() => createWorkspaceRequest());
  return scoped ?? fallback;
}
