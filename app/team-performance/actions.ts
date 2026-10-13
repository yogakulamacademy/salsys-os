'use server';

import {
  revalidatePath,
} from 'next/cache';

import {
  redirect,
} from 'next/navigation';

import {
  createClient,
} from '@/lib/supabase/server';

import {
  getWorkspaceContextForUser,
} from '@/lib/workspace';

function textValue(
  formData: FormData,
  key: string
) {
  const value =
    String(
      formData.get(
        key
      ) ?? ''
    ).trim();

  return value || null;
}

function safeReturnPath(
  value: string | null
) {
  if (
    value &&
    value.startsWith(
      '/team-performance'
    ) &&
    !value.startsWith(
      '//'
    )
  ) {
    return value;
  }

  return '/team-performance';
}

function withMessage(
  path: string,
  key:
    | 'notice'
    | 'error',
  value: string
) {
  const url =
    new URL(
      path,
      'https://crm.local'
    );

  url.searchParams.set(
    key,
    value
  );

  return `${url.pathname}${url.search}`;
}

function revalidateAssignment(
  leadId: string
) {
  revalidatePath(
    '/team-performance'
  );

  revalidatePath(
    '/dashboard'
  );

  revalidatePath(
    '/admissions'
  );

  revalidatePath(
    '/leads'
  );

  revalidatePath(
    '/pipeline'
  );

  revalidatePath(
    '/conversations'
  );

  revalidatePath(
    '/follow-ups'
  );

  revalidatePath(
    `/leads/${leadId}`
  );
}

export async function assignTeamPerformanceLeadAction(
  formData: FormData
) {
  const leadId =
    textValue(
      formData,
      'lead_id'
    );

  const ownerUserId =
    textValue(
      formData,
      'owner_user_id'
    );

  const returnTo =
    safeReturnPath(
      textValue(
        formData,
        'return_to'
      )
    );

  if (
    !leadId ||
    !ownerUserId
  ) {
    redirect(
      withMessage(
        returnTo,
        'error',
        'Lead and employee are required.'
      )
    );
  }

  const supabase =
    await createClient();

  const {
    data: {
      user,
    },
    error: authError,
  } = await supabase.auth.getUser();

  if (
    authError ||
    !user
  ) {
    redirect('/login');
  }

  const {
    data: profile,
    error: profileError,
  } = await supabase
    .from('profiles')
    .select('id,active')
    .eq('id', user.id)
    .maybeSingle();

  if (
    profileError ||
    !profile ||
    profile.active !== true
  ) {
    redirect('/login?error=access-disabled');
  }

  const workspaceContext =
    await getWorkspaceContextForUser(
      supabase,
      user.id
    );

  const organization =
    workspaceContext.activeWorkspace;

  if (!organization) {
    redirect(
      `/workspace?next=${encodeURIComponent(returnTo)}`
    );
  }

  if (
    organization.role !== 'owner' &&
    organization.role !== 'admin'
  ) {
    redirect(
      withMessage(
        returnTo,
        'error',
        'Only organization owners and admins can assign leads.'
      )
    );
  }

  const organizationId =
    organization.organizationId;

  const [
    leadResult,
    ownerMembershipResult,
    ownerProfileResult,
    salesWorkspaceResult,
  ] = await Promise.all([
    supabase
      .from('leads')
      .select('id,organization_id')
      .eq('id', leadId)
      .eq('organization_id', organizationId)
      .maybeSingle(),

    supabase
      .from('organization_members')
      .select('user_id,role,active')
      .eq('organization_id', organizationId)
      .eq('user_id', ownerUserId)
      .maybeSingle(),

    supabase
      .from('profiles')
      .select('id,role,active')
      .eq('id', ownerUserId)
      .maybeSingle(),

    supabase
      .from('organization_workspaces')
      .select('workspace_code,enabled')
      .eq('organization_id', organizationId)
      .eq('workspace_code', 'sales')
      .maybeSingle(),
  ]);

  if (
    leadResult.error ||
    !leadResult.data
  ) {
    redirect(
      withMessage(
        returnTo,
        'error',
        'Lead was not found in the active organization.'
      )
    );
  }

  if (
    ownerMembershipResult.error ||
    !ownerMembershipResult.data ||
    ownerMembershipResult.data.active !== true
  ) {
    redirect(
      withMessage(
        returnTo,
        'error',
        'Selected employee is not active in the current organization.'
      )
    );
  }

  if (
    ownerProfileResult.error ||
    !ownerProfileResult.data ||
    ownerProfileResult.data.active !== true
  ) {
    redirect(
      withMessage(
        returnTo,
        'error',
        'Selected employee account is not active.'
      )
    );
  }

  if (
    salesWorkspaceResult.error ||
    !salesWorkspaceResult.data ||
    salesWorkspaceResult.data.enabled !== true
  ) {
    redirect(
      withMessage(
        returnTo,
        'error',
        'The Sales workspace is not enabled for this organization.'
      )
    );
  }

  const organizationRole =
    String(
      ownerMembershipResult.data.role ?? ''
    )
      .trim()
      .toLowerCase();

  const hasImplicitSalesAccess =
    organizationRole === 'owner' ||
    organizationRole === 'admin';

  let hasExplicitSalesAccess =
    false;

  if (!hasImplicitSalesAccess) {
    const {
      data: salesMembership,
      error: salesMembershipError,
    } = await supabase
      .from('workspace_memberships')
      .select('role,active')
      .eq('organization_id', organizationId)
      .eq('workspace_code', 'sales')
      .eq('user_id', ownerUserId)
      .maybeSingle();

    if (salesMembershipError) {
      redirect(
        withMessage(
          returnTo,
          'error',
          `Unable to validate Sales access: ${salesMembershipError.message}`
        )
      );
    }

    const workspaceRole =
      String(
        salesMembership?.role ?? ''
      )
        .trim()
        .toLowerCase();

    hasExplicitSalesAccess =
      salesMembership?.active === true &&
      (
        workspaceRole === 'member' ||
        workspaceRole === 'manager'
      );
  }

  if (
    !hasImplicitSalesAccess &&
    !hasExplicitSalesAccess
  ) {
    redirect(
      withMessage(
        returnTo,
        'error',
        'Selected employee does not have active Sales workspace access.'
      )
    );
  }

  const legacyProfileRole =
    String(
      ownerProfileResult.data.role ?? ''
    )
      .trim()
      .toLowerCase();

  if (
    ![
      'admin',
      'manager',
      'admissions',
    ].includes(
      legacyProfileRole
    )
  ) {
    redirect(
      withMessage(
        returnTo,
        'error',
        'Selected employee is not an assignable CRM user.'
      )
    );
  }

  const {
    error,
  } =
    await supabase.rpc(
      'assign_lead_owner',
      {
        p_lead_id:
          leadId,

        p_owner_user_id:
          ownerUserId,

        p_sync_open_work:
          true,
      }
    );

  if (error) {
    redirect(
      withMessage(
        returnTo,
        'error',
        error.message
      )
    );
  }

  revalidateAssignment(
    leadId
  );

  redirect(
    withMessage(
      returnTo,
      'notice',
      'lead-assigned'
    )
  );
}
