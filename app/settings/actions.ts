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
  useMockData,
} from '@/lib/config';


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


function numberValue(
  formData: FormData,
  key: string
) {
  const raw =
    textValue(
      formData,
      key
    );

  if (
    raw ===
    null
  ) {
    return null;
  }

  const value =
    Number(raw);

  return Number.isFinite(
    value
  )
    ? value
    : null;
}


function settingsRedirect(
  type:
    | 'notice'
    | 'error',
  message: string
): never {
  redirect(
    `/settings?${type}=${encodeURIComponent(
      message
    )}`
  );
}


export async function updateForecastProbabilityAction(
  formData: FormData
) {
  if (
    useMockData
  ) {
    settingsRedirect(
      'error',
      'Mock mode is active. Settings were not changed.'
    );
  }

  const stage =
    textValue(
      formData,
      'stage'
    );

  const probabilityPercent =
    numberValue(
      formData,
      'probability_percent'
    );

  if (
    !stage
  ) {
    settingsRedirect(
      'error',
      'Stage is required.'
    );
  }

  if (
    probabilityPercent ===
      null ||
    probabilityPercent <
      0 ||
    probabilityPercent >
      100
  ) {
    settingsRedirect(
      'error',
      'Forecast probability must be between 0% and 100%.'
    );
  }

  const supabase =
    await createClient();

  const {
    error,
  } =
    await supabase.rpc(
      'update_crm_stage_probability',
      {
        p_stage:
          stage,
        p_probability:
          probabilityPercent /
          100,
      }
    );

  if (
    error
  ) {
    settingsRedirect(
      'error',
      error.message
    );
  }

  revalidatePath(
    '/settings'
  );

  revalidatePath(
    '/revenue'
  );

  revalidatePath(
    '/dashboard'
  );

  settingsRedirect(
    'notice',
    `${pretty(
      stage
    )} forecast probability updated to ${probabilityPercent}%.`
  );
}


export async function updatePipelineAgingRuleAction(
  formData: FormData
) {
  if (
    useMockData
  ) {
    settingsRedirect(
      'error',
      'Mock mode is active. Settings were not changed.'
    );
  }

  const stage =
    textValue(
      formData,
      'stage'
    );

  const warningHours =
    numberValue(
      formData,
      'warning_hours'
    );

  const stuckHours =
    numberValue(
      formData,
      'stuck_hours'
    );

  if (
    !stage
  ) {
    settingsRedirect(
      'error',
      'Stage is required.'
    );
  }

  if (
    warningHours ===
      null ||
    warningHours <
      0
  ) {
    settingsRedirect(
      'error',
      'Warning threshold must be 0 hours or greater.'
    );
  }

  if (
    stuckHours ===
      null ||
    stuckHours <=
      warningHours
  ) {
    settingsRedirect(
      'error',
      'Stuck threshold must be greater than the warning threshold.'
    );
  }

  const supabase =
    await createClient();

  const {
    error,
  } =
    await supabase.rpc(
      'update_crm_pipeline_aging_rule',
      {
        p_stage:
          stage,
        p_warning_hours:
          warningHours,
        p_stuck_hours:
          stuckHours,
      }
    );

  if (
    error
  ) {
    settingsRedirect(
      'error',
      error.message
    );
  }

  revalidatePath(
    '/settings'
  );

  revalidatePath(
    '/pipeline'
  );

  revalidatePath(
    '/leads'
  );

  revalidatePath(
    '/admissions'
  );

  settingsRedirect(
    'notice',
    `${pretty(
      stage
    )} pipeline aging thresholds updated.`
  );
}


function pretty(
  value: string
) {
  return value
    .replaceAll(
      '_',
      ' '
    )
    .replace(
      /\b\w/g,
      (
        letter
      ) =>
        letter.toUpperCase()
    );
}
