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


function requiredInteger(
  formData: FormData,
  key: string,
  minimum = 0
) {
  const raw =
    textValue(
      formData,
      key
    );

  if (!raw) {
    throw new Error(
      `${key} is required`
    );
  }

  const value =
    Number(raw);

  if (
    !Number.isInteger(value) ||
    value < minimum
  ) {
    throw new Error(
      `${key} must be a whole number of ${minimum} or more`
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

export async function upsertBatchAccommodationTypeAction(
  formData: FormData
) {
  const id =
    textValue(
      formData,
      'id'
    );

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

  const name =
    textValue(
      formData,
      'name'
    );

  const inventoryUnit =
    textValue(
      formData,
      'inventory_unit'
    ) ||
    'room';

  if (!name) {
    redirect(
      withMessage(
        returnTo,
        'error',
        'Accommodation type name is required'
      )
    );
  }

  if (
    ![
      'room',
      'bed',
      'space',
    ].includes(
      inventoryUnit
    )
  ) {
    redirect(
      withMessage(
        returnTo,
        'error',
        'Invalid accommodation inventory unit'
      )
    );
  }

  let totalUnits:
    number;

  let availableUnits:
    number;

  let occupantsPerUnit:
    number;

  let sortOrder:
    number;

  try {
    totalUnits =
      requiredInteger(
        formData,
        'total_units'
      );

    availableUnits =
      requiredInteger(
        formData,
        'available_units'
      );

    occupantsPerUnit =
      requiredInteger(
        formData,
        'occupants_per_unit',
        1
      );

    sortOrder =
      nullableInteger(
        formData,
        'sort_order'
      ) ?? 0;
  } catch (error) {
    redirect(
      withMessage(
        returnTo,
        'error',
        error instanceof Error
          ? error.message
          : 'Invalid accommodation value'
      )
    );
  }

  if (
    availableUnits >
    totalUnits
  ) {
    redirect(
      withMessage(
        returnTo,
        'error',
        'Available units cannot exceed total units'
      )
    );
  }

  const notes =
    textValue(
      formData,
      'notes'
    );

  const active =
    id
      ? booleanValue(
          formData,
          'active'
        )
      : true;

  const supabase =
    await createClient();

  const {
    error,
  } = await supabase.rpc(
    'upsert_batch_accommodation_type',
    {
      p_id:
        id,
      p_batch_id:
        batchId,
      p_name:
        name,
      p_inventory_unit:
        inventoryUnit,
      p_total_units:
        totalUnits,
      p_available_units:
        availableUnits,
      p_occupants_per_unit:
        occupantsPerUnit,
      p_notes:
        notes,
      p_sort_order:
        sortOrder,
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
      id
        ? 'accommodation-updated'
        : 'accommodation-created'
    )
  );
}


export async function setBatchAccommodationAvailabilityAction(
  formData: FormData
) {
  const id =
    textValue(
      formData,
      'id'
    );

  const returnTo =
    safeReturnPath(
      textValue(
        formData,
        'return_to'
      )
    );

  if (!id) {
    redirect(
      withMessage(
        returnTo,
        'error',
        'Accommodation type is missing'
      )
    );
  }

  let availableUnits:
    number;

  try {
    availableUnits =
      requiredInteger(
        formData,
        'available_units'
      );
  } catch (error) {
    redirect(
      withMessage(
        returnTo,
        'error',
        error instanceof Error
          ? error.message
          : 'Invalid availability'
      )
    );
  }

  const supabase =
    await createClient();

  const {
    error,
  } = await supabase.rpc(
    'set_batch_accommodation_availability',
    {
      p_id:
        id,
      p_available_units:
        availableUnits,
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
      'accommodation-availability-updated'
    )
  );
}


export async function setBatchAccommodationActiveStateAction(
  formData: FormData
) {
  const id =
    textValue(
      formData,
      'id'
    );

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

  if (
    !id ||
    !batchId
  ) {
    redirect(
      withMessage(
        returnTo,
        'error',
        'Accommodation type is missing'
      )
    );
  }

  const name =
    textValue(
      formData,
      'name'
    );

  const inventoryUnit =
    textValue(
      formData,
      'inventory_unit'
    );

  if (
    !name ||
    !inventoryUnit
  ) {
    redirect(
      withMessage(
        returnTo,
        'error',
        'Accommodation details are incomplete'
      )
    );
  }

  let totalUnits:
    number;

  let availableUnits:
    number;

  let occupantsPerUnit:
    number;

  let sortOrder:
    number;

  try {
    totalUnits =
      requiredInteger(
        formData,
        'total_units'
      );

    availableUnits =
      requiredInteger(
        formData,
        'available_units'
      );

    occupantsPerUnit =
      requiredInteger(
        formData,
        'occupants_per_unit',
        1
      );

    sortOrder =
      nullableInteger(
        formData,
        'sort_order'
      ) ?? 0;
  } catch (error) {
    redirect(
      withMessage(
        returnTo,
        'error',
        error instanceof Error
          ? error.message
          : 'Invalid accommodation value'
      )
    );
  }

  const active =
    booleanValue(
      formData,
      'active'
    );

  const notes =
    textValue(
      formData,
      'notes'
    );

  const supabase =
    await createClient();

  const {
    error,
  } = await supabase.rpc(
    'upsert_batch_accommodation_type',
    {
      p_id:
        id,
      p_batch_id:
        batchId,
      p_name:
        name,
      p_inventory_unit:
        inventoryUnit,
      p_total_units:
        totalUnits,
      p_available_units:
        availableUnits,
      p_occupants_per_unit:
        occupantsPerUnit,
      p_notes:
        notes,
      p_sort_order:
        sortOrder,
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
        ? 'accommodation-activated'
        : 'accommodation-deactivated'
    )
  );
}


export async function assignEnrollmentAccommodationAction(
  formData: FormData
) {
  const enrollmentId =
    textValue(
      formData,
      'enrollment_id'
    );

  const accommodationTypeId =
    textValue(
      formData,
      'accommodation_type_id'
    );

  const returnTo =
    safeReturnPath(
      textValue(
        formData,
        'return_to'
      )
    );

  if (!enrollmentId) {
    redirect(
      withMessage(
        returnTo,
        'error',
        'Enrollment is missing'
      )
    );
  }

  if (!accommodationTypeId) {
    redirect(
      withMessage(
        returnTo,
        'error',
        'Select an accommodation type'
      )
    );
  }

  let occupantSpaces:
    number;

  try {
    occupantSpaces =
      requiredInteger(
        formData,
        'occupant_spaces',
        1
      );
  } catch (error) {
    redirect(
      withMessage(
        returnTo,
        'error',
        error instanceof Error
          ? error.message
          : 'Invalid accommodation spaces'
      )
    );
  }

  const assignmentStatus =
    textValue(
      formData,
      'assignment_status'
    ) ||
    'reserved';

  if (
    ![
      'reserved',
      'confirmed',
    ].includes(
      assignmentStatus
    )
  ) {
    redirect(
      withMessage(
        returnTo,
        'error',
        'Invalid accommodation assignment status'
      )
    );
  }

  const notes =
    textValue(
      formData,
      'notes'
    );

  const supabase =
    await createClient();

  const {
    error,
  } = await supabase.rpc(
    'assign_enrollment_accommodation',
    {
      p_enrollment_id:
        enrollmentId,
      p_accommodation_type_id:
        accommodationTypeId,
      p_occupant_spaces:
        occupantSpaces,
      p_status:
        assignmentStatus,
      p_notes:
        notes,
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
      'student-accommodation-assigned'
    )
  );
}


export async function releaseEnrollmentAccommodationAction(
  formData: FormData
) {
  const enrollmentId =
    textValue(
      formData,
      'enrollment_id'
    );

  const returnTo =
    safeReturnPath(
      textValue(
        formData,
        'return_to'
      )
    );

  if (!enrollmentId) {
    redirect(
      withMessage(
        returnTo,
        'error',
        'Enrollment is missing'
      )
    );
  }

  const releaseStatus =
    textValue(
      formData,
      'release_status'
    ) ||
    'released';

  if (
    ![
      'released',
      'cancelled',
    ].includes(
      releaseStatus
    )
  ) {
    redirect(
      withMessage(
        returnTo,
        'error',
        'Invalid accommodation release status'
      )
    );
  }

  const notes =
    textValue(
      formData,
      'notes'
    );

  const supabase =
    await createClient();

  const {
    error,
  } = await supabase.rpc(
    'release_enrollment_accommodation',
    {
      p_enrollment_id:
        enrollmentId,
      p_status:
        releaseStatus,
      p_notes:
        notes,
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
      'student-accommodation-released'
    )
  );
}
