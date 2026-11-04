'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';
import { useMockData } from '@/lib/config';

function textValue(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? '').trim();
  return value || null;
}

function numberValue(formData: FormData, key: string) {
  const raw = textValue(formData, key);

  if (raw === null) {
    return null;
  }

  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function settingsRedirect(
  type: 'notice' | 'error',
  message: string,
): never {
  redirect(`/settings?${type}=${encodeURIComponent(message)}`);
}

async function getCurrentOrganizationId(
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    settingsRedirect('error', 'Unable to resolve the active organization.');
  }

  return requireCurrentOrganizationId(supabase, user.id);
}

export async function updateForecastProbabilityAction(formData: FormData) {
  if (useMockData) {
    settingsRedirect('error', 'Mock mode is active. Settings were not changed.');
  }

  const stage = textValue(formData, 'stage');
  const probabilityPercent = numberValue(formData, 'probability_percent');

  if (!stage) {
    settingsRedirect('error', 'Stage is required.');
  }

  if (
    probabilityPercent === null ||
    probabilityPercent < 0 ||
    probabilityPercent > 100
  ) {
    settingsRedirect(
      'error',
      'Forecast probability must be between 0% and 100%.',
    );
  }

  const supabase = await createClient();
  const organizationId = await getCurrentOrganizationId(supabase);

  const { error } = await supabase.rpc('update_crm_stage_probability_v2', {
    p_organization_id: organizationId,
    p_stage: stage,
    p_probability: probabilityPercent / 100,
  });

  if (error) {
    settingsRedirect('error', error.message);
  }

  revalidatePath('/settings');
  revalidatePath('/revenue');
  revalidatePath('/dashboard');

  settingsRedirect(
    'notice',
    `${pretty(stage)} forecast probability updated to ${probabilityPercent}%.`,
  );
}

export async function updatePipelineAgingRuleAction(formData: FormData) {
  if (useMockData) {
    settingsRedirect('error', 'Mock mode is active. Settings were not changed.');
  }

  const stage = textValue(formData, 'stage');
  const warningHours = numberValue(formData, 'warning_hours');
  const stuckHours = numberValue(formData, 'stuck_hours');

  if (!stage) {
    settingsRedirect('error', 'Stage is required.');
  }

  if (warningHours === null || warningHours < 0) {
    settingsRedirect('error', 'Warning threshold must be 0 hours or greater.');
  }

  if (stuckHours === null || stuckHours <= warningHours) {
    settingsRedirect(
      'error',
      'Stuck threshold must be greater than the warning threshold.',
    );
  }

  const supabase = await createClient();
  const organizationId = await getCurrentOrganizationId(supabase);

  const { error } = await supabase.rpc(
    'update_crm_pipeline_aging_rule_v2',
    {
      p_organization_id: organizationId,
      p_stage: stage,
      p_warning_hours: warningHours,
      p_stuck_hours: stuckHours,
    },
  );

  if (error) {
    settingsRedirect('error', error.message);
  }

  revalidatePath('/settings');
  revalidatePath('/pipeline');
  revalidatePath('/leads');
  revalidatePath('/admissions');

  settingsRedirect('notice', `${pretty(stage)} pipeline aging thresholds updated.`);
}


type ForecastBulkChange = {
  stage: string;
  old_percent: number;
  new_percent: number;
};
type AgingBulkChange = {
  stage: string;
  old_warning_hours: number;
  old_stuck_hours: number;
  warning_hours: number;
  stuck_hours: number;
};

function validBulkNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function validStage(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z_]{2,40}$/.test(value);
}

export async function saveCrmSettingsBulkAction(formData: FormData) {
  if (useMockData) {
    settingsRedirect('error', 'Mock mode is active. Settings were not changed.');
  }

  const raw = formData.get('changes_json');
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 20000) {
    settingsRedirect('error', 'Changes payload is missing or too large.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    settingsRedirect('error', 'Changes payload is not valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    settingsRedirect('error', 'Changes payload must be a settings object.');
  }

  const changeSet = parsed as Record<string, unknown>;
  if (!Array.isArray(changeSet.probabilities) || !Array.isArray(changeSet.aging) ||
      changeSet.probabilities.length > 24 || changeSet.aging.length > 24) {
    settingsRedirect('error', 'Invalid CRM settings change list.');
  }

  const probabilities = changeSet.probabilities as ForecastBulkChange[];
  const aging = changeSet.aging as AgingBulkChange[];
  if (probabilities.length + aging.length === 0) {
    settingsRedirect('notice', 'No CRM rule changes to save.');
  }
  const seenProbabilities = new Set<string>();
  const seenAging = new Set<string>();
  for (const item of probabilities) {
    if (!item || !validStage(item.stage) || seenProbabilities.has(item.stage) ||
        !validBulkNumber(item.old_percent) || !validBulkNumber(item.new_percent) ||
        item.old_percent < 0 || item.old_percent > 100 ||
        item.new_percent < 0 || item.new_percent > 100) {
      settingsRedirect('error', 'Invalid forecast stage or probability.');
    }
    seenProbabilities.add(item.stage);
  }
  for (const item of aging) {
    if (!item || !validStage(item.stage) || seenAging.has(item.stage) ||
        !validBulkNumber(item.old_warning_hours) || !validBulkNumber(item.old_stuck_hours) ||
        !validBulkNumber(item.warning_hours) || !validBulkNumber(item.stuck_hours) ||
        item.old_warning_hours < 0 || item.old_stuck_hours <= item.old_warning_hours ||
        item.warning_hours < 0 || item.stuck_hours <= item.warning_hours) {
      settingsRedirect('error', 'Aging thresholds must be valid; stuck must exceed warning.');
    }
    seenAging.add(item.stage);
  }

  const supabase = await createClient();
  const organizationId = await getCurrentOrganizationId(supabase);
  const { data, error } = await supabase.rpc('update_crm_settings_bulk_v1', {
    p_organization_id: organizationId,
    p_changes: { probabilities, aging },
  });
  if (error) {
    settingsRedirect('error', error.message);
  }
  const saved = data && typeof data === 'object' && !Array.isArray(data)
    ? data as { forecast_saved?: number; aging_saved?: number } : {};
  revalidatePath('/settings');
  revalidatePath('/settings/overview');
  revalidatePath('/pipeline');
  revalidatePath('/leads');
  revalidatePath('/admissions');
  revalidatePath('/revenue');
  revalidatePath('/dashboard');

  settingsRedirect('notice', 'Saved ' +
    String(Number(saved.forecast_saved ?? probabilities.length) + Number(saved.aging_saved ?? aging.length)) +
    ' CRM rule changes. Audit history updated.');
}

function pretty(value: string) {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
