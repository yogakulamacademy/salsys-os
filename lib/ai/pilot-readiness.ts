/**
 * C5 pilot readout: explicitly separate machine-observable readiness from
 * human approval. Neither this module nor its consumers can enable AI.
 */
export type PilotPrerequisiteState = 'ready' | 'disabled' | 'review_required';

export type PilotPrerequisite = {
  key: string;
  title: string;
  state: PilotPrerequisiteState;
  detail: string;
};

export type PilotGateInputs = {
  generationEnabled: boolean;
  uiEnabled: boolean;
  quotasEnabled: boolean;
  feedbackEnabled: boolean;
  usageLedgerEnabled: boolean;
  modelConfigured: boolean;
  signingKeyConfigured: boolean;
  tenantOptedIn: boolean;
  quotaPolicyPresent: boolean;
  governanceApprovalPresent: boolean;
};

export function pilotPrerequisites(input: PilotGateInputs): PilotPrerequisite[] {
  return [
    {
      key: 'model',
      title: 'Claude model configuration',
      state: input.modelConfigured ? 'ready' : 'disabled',
      detail: input.modelConfigured ? 'A server-only model key and model identifier are configured.' : 'Server-only Claude configuration is incomplete.',
    },
    {
      key: 'generation',
      title: 'AI generation switch',
      state: input.generationEnabled ? 'ready' : 'disabled',
      detail: input.generationEnabled ? 'Generation switch configured.' : 'The global generation switch is off.',
    },
    {
      key: 'ui',
      title: 'Staff interface switch',
      state: input.uiEnabled ? 'ready' : 'disabled',
      detail: input.uiEnabled ? 'Staff UI is configured.' : 'Staff UI is hidden.',
    },
    {
      key: 'quotas',
      title: 'Usage reservation switch',
      state: input.quotasEnabled ? 'ready' : 'disabled',
      detail: input.quotasEnabled ? 'Server quota checks are configured.' : 'Server quota checks are disabled; generation fails closed.',
    },
    {
      key: 'tenant',
      title: 'Organization opt-in',
      state: input.tenantOptedIn && input.quotaPolicyPresent ? 'ready' : 'disabled',
      detail: input.tenantOptedIn ? 'Tenant has an enabled policy.' : 'No enabled tenant policy. AI requests are denied.',
    },
    {
      key: 'governance-approval',
      title: 'Documented pilot release approval',
      state: input.governanceApprovalPresent ? 'ready' : 'disabled',
      detail: input.governanceApprovalPresent
        ? 'An unexpired, nonrevoked privacy/retention/budget/quality approval record is present.'
        : 'No complete and current governance approval is recorded. Generation is denied in the database.',
    },
    {
      key: 'provider-usage',
      title: 'Provider request monitoring',
      state: input.usageLedgerEnabled ? 'ready' : 'disabled',
      detail: input.usageLedgerEnabled
        ? 'Request receipts and provider token measurements are configured.'
        : 'Request-level usage tracking is disabled; Claude calls must fail closed.',
    },
    {
      key: 'feedback',
      title: 'Review receipts and signing',
      state: input.feedbackEnabled && input.signingKeyConfigured ? 'ready' : 'disabled',
      detail: input.feedbackEnabled && input.signingKeyConfigured
        ? 'Metadata receipt capture and signing are configured.'
        : 'Feedback capture and/or keyed signing is not configured.',
    },
    {
      key: 'privacy',
      title: 'Privacy, consent and retention',
      state: 'review_required',
      detail: 'Consent and record-retention approval cannot be inferred from environment flags.',
    },
    {
      key: 'quality',
      title: 'Live evidence and staff QA',
      state: 'review_required',
      detail: 'Authorized staff must inspect real responses and supporting citations before a pilot.',
    },
    {
      key: 'cost',
      title: 'Spending alerts and budget review',
      state: 'review_required',
      detail: 'Attempt limits are present, but provider spend alerts and financial controls need manual verification.',
    },
  ];
}

export function observedPilotState(items: readonly PilotPrerequisite[]): 'blocked' | 'review_required' {
  return items.some(i => i.state === 'disabled') ? 'blocked' : 'review_required';
}

export function pilotRate(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) ||
      numerator < 0 || denominator <= 0 || numerator > denominator) return null;
  return Math.round(1000 * numerator / denominator) / 10;
}

export function daysAgoIso(now: Date, days: number): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}
