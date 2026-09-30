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
