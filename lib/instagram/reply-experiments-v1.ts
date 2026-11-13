import { createHash } from 'node:crypto';

/**
 * Internal Instagram DM reply suggestions, NOT WhatsApp/Meta-approved templates.
 * Human-initiated customer conversations only. This catalog has no send path.
 */
export type InstagramExperimentId =
  | 'enquiry' | 'followup' | 'fees' | 'batch'
  | 'mode' | 'rooms' | 'register' | 'reengage';
export type InstagramVariantId = 'A' | 'B';

export type InstagramReplyExperiment = {
  id: InstagramExperimentId;
  title: string;
  purpose: string;
  control: string;
  challenger: string;
};

export const INSTAGRAM_REPLY_EXPERIMENTS: readonly InstagramReplyExperiment[] = [
  {
    id: 'enquiry', title: 'New enquiry', purpose: 'Dates versus needs-first qualification',
    control: 'Namaste {{1}}, thanks for your interest in {{2}}. Would you like the upcoming batch dates? Reply DATES or STOP to opt out.',
    challenger: 'Namaste {{1}}, about {{2}}, what would you like to know first: fees, schedule, or certificate? Reply FEES, SCHEDULE, or CERTIFICATE. Reply STOP to opt out.',
  },
  {
    id: 'followup', title: 'Course questions', purpose: 'Open question versus guided clarification',
    control: 'Namaste {{1}}, following up on your questions about {{2}}. Is there anything else you would like to clarify? Reply here or STOP to opt out.',
    challenger: 'Namaste {{1}}, about {{2}}, what needs clarification: fees, schedule, or certification? Reply FEES, SCHEDULE, or CERTIFICATE. Reply STOP to opt out.',
  },
  {
    id: 'fees', title: 'Fees', purpose: 'Offer a breakdown versus identify cost concerns',
    control: 'Namaste {{1}}, regarding fees for {{2}}, would a complete fee breakdown help? Reply FEES or STOP to opt out.',
    challenger: 'Namaste {{1}}, regarding {{2}}, which cost detail matters most: total fees, accommodation, or payment options? Reply TOTAL, ROOM, or PAYMENT. Reply STOP to opt out.',
  },
  {
    id: 'batch', title: 'Batch planning', purpose: 'Offer dates versus ask preferred month',
    control: 'Namaste {{1}}, for {{2}}, would you like the next batch dates? Reply DATES or STOP to opt out.',
    challenger: 'Namaste {{1}}, for {{2}}, which starting month would suit you? Reply with a month or STOP to opt out.',
  },
  {
    id: 'mode', title: 'Training format', purpose: 'Explicit course mode versus location preference',
    control: 'Namaste {{1}}, for {{2}}, would online or residential training work better? Reply ONLINE or RESIDENTIAL. Reply STOP to opt out.',
    challenger: 'Namaste {{1}}, for {{2}}, would you prefer studying from home or training in India? Reply HOME or INDIA. Reply STOP to opt out.',
  },
  {
    id: 'rooms', title: 'Accommodation', purpose: 'Offer room details versus identify accommodation priorities',
    control: 'Namaste {{1}}, for {{2}}, would you like private and shared accommodation details? Reply ROOMS or STOP to opt out.',
    challenger: 'Namaste {{1}}, for your stay during {{2}}, what matters most: privacy, budget, or facilities? Reply PRIVACY, BUDGET, or FACILITIES. Reply STOP to opt out.',
  },
  {
    id: 'register', title: 'Registration', purpose: 'Offer steps versus identify decision blocker',
    control: 'Namaste {{1}}, for {{2}}, should I share the registration steps? Reply REGISTER or STOP to opt out.',
    challenger: 'Namaste {{1}}, about {{2}}, what would help you decide: fees, dates, or course content? Reply FEES, DATES, or CONTENT. Reply STOP to opt out.',
  },
  {
    id: 'reengage', title: 'Still interested', purpose: 'Information check versus decision timing',
    control: 'Namaste {{1}}, regarding {{2}}, would updated information help you plan? Reply YES or STOP to opt out.',
    challenger: 'Namaste {{1}}, for {{2}}, would you like to continue planning now or revisit later? Reply CONTINUE or LATER. Reply STOP to opt out.',
  },
] as const;

export type InstagramVerifiedContext = {
  firstName?: string | null;
  displayName?: string | null;
  leadName?: string | null;
  courseName?: string | null;
};

export type InstagramExperimentResolution =
  | { ok: true; experimentId: InstagramExperimentId; variantId: InstagramVariantId; body: string }
  | { ok: false; reason: 'experiment_unknown' | 'lead_name_missing' | 'course_name_missing' | 'unsafe_template_body' };

function clean(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 180 || /[\u0000-\u001f\u007f]|\{\{|\}\}/.test(trimmed)) return null;
  return trimmed;
}

function verifiedFirstName(context: InstagramVerifiedContext): string | null {
  const name = clean(context.firstName) || clean(context.displayName) || clean(context.leadName);
  if (!name || /^(instagram lead|unknown|anonymous|customer|lead)$/i.test(name)) return null;
  return clean(name.split(/\s+/)[0]);
}

export function assignedInstagramVariant(
  organizationId: string,
  leadId: string,
  experimentId: InstagramExperimentId,
): InstagramVariantId {
  const checksum = createHash('sha256')
    .update('instagram-ab-v1:' + organizationId + ':' + leadId + ':' + experimentId)
    .digest();
  return checksum[0] % 2 === 0 ? 'A' : 'B';
}

export function resolveInstagramExperiment(input: {
  organizationId: string;
  leadId: string;
  experimentId: string;
  context: InstagramVerifiedContext;
}): InstagramExperimentResolution {
  const experiment = INSTAGRAM_REPLY_EXPERIMENTS.find(item => item.id === input.experimentId);
  if (!experiment) return { ok: false, reason: 'experiment_unknown' };

  const name = verifiedFirstName(input.context);
  const course = clean(input.context.courseName);
  if (!name) return { ok: false, reason: 'lead_name_missing' };
  if (!course) return { ok: false, reason: 'course_name_missing' };

  const variantId = assignedInstagramVariant(input.organizationId, input.leadId, experiment.id);
  const source = variantId === 'A' ? experiment.control : experiment.challenger;
  const body = source.replace(/\{\{1\}\}/g, name).replace(/\{\{2\}\}/g, course);

  if (body.includes('{{') || body.includes('}}') || new TextEncoder().encode(body).length > 1000) {
    return { ok: false, reason: 'unsafe_template_body' };
  }
  return { ok: true, experimentId: experiment.id, variantId, body };
}

export type InstagramIntentSignal =
  | 'opt_out' | 'pricing' | 'batch_dates' | 'training_mode' | 'accommodation'
  | 'registration' | 'certification' | 'course_content' | 'payment_options'
  | 'later' | 'general_question';

export function detectExplicitInstagramIntent(message: string): InstagramIntentSignal[] {
  if (typeof message !== 'string' || message.length > 3000) return [];
  const normalized = message.trim().toLowerCase();
  if (!normalized) return [];
  if (/^(?:stop|unsubscribe|opt\s*out|do not message(?: me)?|don['’]t message(?: me)?|please stop messaging(?: me)?)[.!\s]*$/i.test(normalized)) {
    return ['opt_out'];
  }
  const matches: Array<[InstagramIntentSignal, RegExp]> = [
    ['pricing', /\b(fees?|price|pricing|cost|total|budget)\b/i],
    ['batch_dates', /\b(dates?|start|schedule|timing|month|january|february|march|april|may|june|july|august|september|october|november|december)\b/i],
    ['training_mode', /\b(online|residential|offline|home|india)\b/i],
    ['accommodation', /\b(rooms?|accommodation|shared|private|privacy|facilities|stay)\b/i],
    ['registration', /\b(register|registration|enrol|enroll|booking|book|apply)\b/i],
    ['certification', /\b(certificate|certification|yoga alliance|accreditation)\b/i],
    ['course_content', /\b(curriculum|content|syllabus|subjects|anatomy|philosophy)\b/i],
    ['payment_options', /\b(payment|upi|paypal|wise|instalment|installment|deposit)\b/i],
    ['later', /\b(later|next year|not now|postpone)\b/i],
  ];
  const signals = matches.filter(([, pattern]) => pattern.test(normalized)).map(([signal]) => signal);
  return signals.length ? signals : ['general_question'];
}
