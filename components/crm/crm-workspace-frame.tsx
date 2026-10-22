import type { ReactNode } from 'react';

import { CrmLeadInspectorBridge } from '@/components/crm/crm-lead-inspector-bridge';
import { CrmNavigation } from '@/components/crm/crm-navigation';
import { CrmTopbar } from '@/components/crm/crm-topbar';
import styles from '@/components/crm/crm-studio.module.css';
import { LiveRefresh } from '@/components/live-refresh';
import { useMockData } from '@/lib/config';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

function initials(value: string) {
  const result = value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  return result || 'SO';
}

async function resolveShellIdentity() {
  if (useMockData) {
    return {
      workspaceName: 'SalsysOS Demo',
      profileName: 'CRM User',
      profileRole: 'Development access',
    };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        workspaceName: 'Workspace',
        profileName: 'CRM User',
        profileRole: 'Authenticated',
      };
    }

    const [workspace, profileResult] = await Promise.all([
      getCurrentWorkspaceContext(supabase),
      supabase
        .from('profiles')
        .select('full_name,role')
        .eq('id', user.id)
        .maybeSingle(),
    ]);

    return {
      workspaceName: workspace.activeWorkspace?.organizationName || 'Workspace',
      profileName: profileResult.data?.full_name?.trim() || user.email || 'CRM User',
      profileRole: profileResult.data?.role || workspace.activeWorkspace?.role || 'CRM operator',
    };
  } catch {
    return {
      workspaceName: 'Workspace',
      profileName: 'CRM User',
      profileRole: 'CRM operator',
    };
  }
}

export async function CrmWorkspaceFrame({ children }: { children: ReactNode }) {
  const identity = await resolveShellIdentity();

  return (
    <div className={styles.studio}>
      <LiveRefresh enabled={!useMockData} />
      <CrmNavigation
        workspaceName={identity.workspaceName}
        profileName={identity.profileName}
        profileRole={identity.profileRole}
      />

      <div className={styles.contentShell}>
        <CrmTopbar profileInitials={initials(identity.profileName)} />
        <CrmLeadInspectorBridge>
          <main className={styles.main}>{children}</main>
        </CrmLeadInspectorBridge>
      </div>
    </div>
  );
}
