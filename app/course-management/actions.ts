'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';


function textValue(
  formData: FormData,
  key: string
) {
  const value =
    String(
      formData.get(key) ?? ''
    ).trim();

  return value || null;
}


function nullableInteger(
  formData: FormData,
  key: string
) {
  const raw =
    textValue(
      formData,
      key
    );

  if (!raw) {
    return null;
  }

  const value =
    Number(raw);

  if (
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new Error(
      `${key} must be a whole number of 0 or more`
    );
  }

  return value;
}


function nullableNumber(
  formData: FormData,
  key: string
) {
  const raw =
    textValue(
      formData,
      key
    );

  if (!raw) {
    return null;
  }

  const value =
    Number(raw);

  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new Error(
      `${key} must be a number of 0 or more`
    );
  }

  return value;
}


function booleanValue(
  formData: FormData,
  key: string
) {
  const raw =
    String(
      formData.get(key) ?? ''
    ).trim()
      .toLowerCase();

  return (
    raw === 'true' ||
    raw === '1' ||
    raw === 'yes' ||
    raw === 'on'
  );
}


function safeReturnPath(
  value?: string | null
) {
  if (
    !value ||
    !value.startsWith(
      '/course-management'
    ) ||
    value.startsWith('//')
  ) {
    return '/course-management';
  }

  return value;
}


function withMessage(
  path: string,
  key: 'notice' | 'error',
  value: string
) {
  const separator =
    path.includes('?')
      ? '&'
      : '?';

  return `${path}${separator}${key}=${encodeURIComponent(
    value
  )}`;
}


function revalidateBatchPages() {
  revalidatePath(
    '/course-management'
  );
  revalidatePath(
    '/admissions'
  );
  revalidatePath(
    '/dashboard'
  );
  revalidatePath(
    '/leads'
  );
  revalidatePath(
    '/leads/new'
  );
  revalidatePath(
    '/pipeline'
  );
  revalidatePath(
    '/revenue'
  );
}


export async function updateCourseBatchAdminAction(
  formData: FormData
) {
  const batchId =
    textValue(
      formData,
      'batch_id'
    );

  const returnTo =
    safeReturnPath(
      textValue(
        formData,
        'return_to'
      )
    );

  if (!batchId) {
    redirect(
      withMessage(
        returnTo,
        'error',
        'Batch is missing'
      )
    );
  }

  let capacity:
    | number
    | null;

  let publishedSeats:
    | number
    | null;

  let accommodationCapacity:
    | number
    | null;

  let accommodationRemaining:
    | number
    | null;

  let expectedValue:
    | number
    | null;

  try {
    capacity =
      nullableInteger(
        formData,
        'capacity'
      );

    publishedSeats =
      nullableInteger(
        formData,
        'published_seats_remaining'
      );

    accommodationCapacity =
      nullableInteger(
        formData,
        'accommodation_capacity'
      );

    accommodationRemaining =
      nullableInteger(
        formData,
        'accommodation_remaining'
      );

    expectedValue =
      nullableNumber(
        formData,
        'expected_value'
      );
  } catch (error) {
    redirect(
      withMessage(
        returnTo,
        'error',
        error instanceof Error
          ? error.message
          : 'Invalid batch value'
      )
    );
  }

  const currency =
    textValue(
      formData,
      'currency'
    );

  const accommodationNote =
    textValue(
      formData,
      'accommodation_note'
    );

  const enrollmentNote =
    textValue(
      formData,
      'enrollment_note'
    );

  const supabase =
    await createClient();

  const {
    error,
  } = await supabase.rpc(
    'update_course_batch_admin',
    {
      p_batch_id:
        batchId,
      p_capacity:
        capacity,
      p_published_seats_remaining:
        publishedSeats,
      p_accommodation_capacity:
        accommodationCapacity,
      p_accommodation_remaining:
        accommodationRemaining,
      p_accommodation_note:
        accommodationNote,
      p_expected_value:
        expectedValue,
      p_currency:
        currency,
      p_enrollment_note:
        enrollmentNote,
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

  revalidateBatchPages();

  redirect(
    withMessage(
      returnTo,
      'notice',
      'batch-updated'
    )
  );
}


export async function setCourseBatchEnrollmentStateAction(
  formData: FormData
) {
  const batchId =
    textValue(
      formData,
      'batch_id'
    );

  const returnTo =
    safeReturnPath(
      textValue(
        formData,
        'return_to'
      )
    );

  if (!batchId) {
    redirect(
      withMessage(
        returnTo,
        'error',
        'Batch is missing'
      )
    );
  }

  const open =
    booleanValue(
      formData,
      'open'
    );

  const note =
    textValue(
      formData,
      'note'
    );

  const supabase =
    await createClient();

  const {
    error,
  } = await supabase.rpc(
    'set_course_batch_enrollment_state',
    {
      p_batch_id:
        batchId,
      p_open:
        open,
      p_note:
        note,
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

  revalidateBatchPages();

  redirect(
    withMessage(
      returnTo,
      'notice',
      open
        ? 'enrollment-reopened'
        : 'enrollment-closed'
    )
  );
}


export async function setCourseBatchActiveStateAction(
  formData: FormData
) {
  const batchId =
    textValue(
      formData,
      'batch_id'
    );

  const returnTo =
    safeReturnPath(
      textValue(
        formData,
        'return_to'
      )
    );

  if (!batchId) {
    redirect(
      withMessage(
        returnTo,
        'error',
        'Batch is missing'
      )
    );
  }

  const active =
    booleanValue(
      formData,
      'active'
    );

  const supabase =
    await createClient();

  const {
    error,
  } = await supabase.rpc(
    'set_course_batch_active_state',
    {
      p_batch_id:
        batchId,
      p_active:
        active,
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

  revalidateBatchPages();

  redirect(
    withMessage(
      returnTo,
      'notice',
      active
        ? 'batch-activated'
        : 'batch-deactivated'
    )
  );
}
