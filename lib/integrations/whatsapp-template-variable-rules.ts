/**
 * Conservative, deterministic variable mappings for the first Yogakulam
 * WhatsApp follow-up templates. These rules never send a message.
 *
 * Meta's {{1}} etc. are positional, not semantic. A changed template
 * body must fail closed until someone reviews its meaning.
 */
export type VerifiedTemplateField = 'lead.first_name' | 'course.name' | 'lead.preferred_month';

export type VerifiedLeadContext = {
  firstName?: string | null;
  displayName?: string | null;
  leadName?: string | null;
  courseName?: string | null;
  preferredMonth?: string | null;
};

export type ResolvableWhatsAppTemplate = {
  name: string;
  language: string;
  category: string;
  headerText: string;
  bodyText: string;
  headerVariableCount: number;
  bodyVariableCount: number;
  supported: boolean;
};

export type VerifiedTemplateResult = {
  ok: boolean;
  mappingSupported: boolean;
  headerValues: string[];
  bodyValues: string[];
  preview: string | null;
  missing: VerifiedTemplateField[];
  reason: string | null;
};

const RULES: Readonly<Record<string, readonly VerifiedTemplateField[]>> = {
  yka_course_enquiry_received_v1: ['lead.first_name', 'course.name'],
  yka_course_details_followup_v1: ['lead.first_name', 'course.name'],
  yka_preferred_month_checkin_v1: ['lead.first_name', 'course.name', 'lead.preferred_month'],
  yka_course_mode_choice_v1: ['lead.first_name', 'course.name'],
  yka_batch_options_available_v1: ['lead.first_name', 'course.name'],
  yka_accommodation_query_followup_v1: ['lead.first_name', 'course.name'],
  yka_decision_support_v1: ['lead.first_name', 'course.name'],
  yka_course_followup_v1: ['lead.first_name', 'course.name'],
};

function validParameter(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.trim();
  if (!clean || clean.length > 256) return null;
  if (/[\u0000-\u001f\u007f]|\{\{|\}\}/.test(clean)) return null;
  return clean;
}

function firstName(lead: VerifiedLeadContext): string | null {
  const candidate = validParameter(lead.firstName)
    || validParameter(lead.displayName)
    || validParameter(lead.leadName);
  if (!candidate || /^(unknown|anonymous|instagram lead|whatsapp lead|lead)$/i.test(candidate)) {
    return null;
  }
  return validParameter(candidate.split(/\s+/)[0]);
}

function preferredMonth(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-(0[1-9]|1[0-2])(?:-\d{2})?$/.test(value)) return null;
  const [year, month] = value.split('-').map(Number);
  if (!year || year < 2020 || year > 2100 || !month) return null;
  const label = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)));
  return validParameter(label);
}

function approvedShape(template: ResolvableWhatsAppTemplate, required: readonly VerifiedTemplateField[]) {
  // Named variables, non-contiguous variables and changed meanings are not supported.
  if (!template.supported || template.category.toUpperCase() !== 'MARKETING') return false;
  if (!/^en(?:_[A-Z]{2})?$/.test(template.language)) return false;
  if (template.headerVariableCount !== 0 || template.bodyVariableCount !== required.length) return false;
  const text = template.bodyText;
  if (!/^\s*Namaste\s+\{\{1\}\}/i.test(text)) return false;
  if (!/(?:about|for|in|considering|regarding)\s+(?:the\s+|your\s+)?\{\{2\}\}/i.test(text)) {
    return false;
  }
  if (required.length === 3 && !/around\s+\{\{3\}\}/i.test(text)) return false;
  const placeholders = [...text.matchAll(/\{\{([^}]+)\}\}/g)].map(match => match[1]);
  if (placeholders.length !== required.length || placeholders.some((v, i) => v !== String(i + 1))) {
    return false;
  }
  return !text.replace(/\{\{[1-3]\}\}/g, '').includes('{{');
}

export function resolveVerifiedTemplateVariables(
  template: ResolvableWhatsAppTemplate,
  lead: VerifiedLeadContext,
): VerifiedTemplateResult {
  const keys = RULES[template.name];
  const unsupported = (reason: string): VerifiedTemplateResult => ({
    ok: false, mappingSupported: false, headerValues: [], bodyValues: [],
    preview: null, missing: [], reason,
  });
  if (!keys) return unsupported('No reviewed mapping exists for this template.');
  if (!approvedShape(template, keys)) {
    return unsupported('The approved template format does not match the reviewed mapping.');
  }

  const values: Record<VerifiedTemplateField, string | null> = {
    'lead.first_name': firstName(lead),
    'course.name': validParameter(lead.courseName),
    'lead.preferred_month': preferredMonth(lead.preferredMonth),
  };
  const missing = keys.filter(key => !values[key]);
  if (missing.length) {
    return {
      ok: false, mappingSupported: true, headerValues: [], bodyValues: [],
      preview: null, missing, reason: 'Required verified CRM fields are missing.',
    };
  }
  const bodyValues = keys.map(key => values[key]!);
  const preview = template.bodyText.replace(/\{\{([1-3])\}\}/g, (_match, index: string) =>
    bodyValues[Number(index) - 1] ?? '',
  );
  if (preview.includes('{{') || preview.includes('}}')) {
    return unsupported('Template contains unresolved placeholders.');
  }
  return {
    ok: true, mappingSupported: true, headerValues: [], bodyValues,
    preview, missing: [], reason: null,
  };
}
