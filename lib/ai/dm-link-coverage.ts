/**
 * DM-LINK-02: pure, offline reconciliation of observed link events.
 * No database writes, network requests, cookies, IP lookup or outgoing messages.
 * Each observation must already be bound by independently approved server code
 * to the issued opaque link, tenant and permitted processing purpose.
 */
import {
  evaluateDmLinkVisit,
  type DmLinkVisitInput,
  type VisitEvidenceStatus,
} from './dm-link-intelligence';

export type DmLinkObservation = {
  eventId: string;
  linkId: string;
  evidence: DmLinkVisitInput;
};

export type DmLinkCoverageSummary = {
  state:
    | 'restricted'
    | 'not_observed'
    | 'ambiguous_request'
    | 'observed_country_unknown'
    | 'country_observed'
    | 'conflicting_countries';
  /** Safe for existing attention evaluator; conflict counts as observed. */
  clickStatus: VisitEvidenceStatus;
  /** Network-country evidence only, never a residence or citizenship fact. */
  observedVisitCountry: string | null;
  observedVisitAt: string | null;
  qualifyingVisitCount: number;
  ambiguousRequestCount: number;
  customerResidenceVerified: false;
  pricingEligibility: 'undetermined';
  identityAssurance: 'none' | 'token_link_only';
};

const empty = (state: 'restricted' | 'not_observed'): DmLinkCoverageSummary => ({
  state,
  clickStatus: state === 'restricted' ? 'restricted' : 'none',
  observedVisitCountry: null,
  observedVisitAt: null,
  qualifyingVisitCount: 0,
  ambiguousRequestCount: 0,
  customerResidenceVerified: false,
  pricingEligibility: 'undetermined',
  identityAssurance: 'none',
});

/**
 * The function deliberately rejects mismatched/oversized histories instead of
 * producing misleading "no click" signals from partial or unrelated data.
 * It only derives a country when ALL qualifying observations agree.
 */
export function summarizeDmLinkCoverage(input: {
  organizationId: string;
  linkId: string;
  processingPurposePermitted: boolean;
  events: readonly DmLinkObservation[];
}): DmLinkCoverageSummary {
  if (!input.organizationId || !/^[A-Za-z0-9_-]{8,128}$/.test(input.linkId) ||
      input.processingPurposePermitted !== true || !Array.isArray(input.events) ||
      input.events.length > 100) return empty('restricted');
  const seen = new Map<string, string>();
  let qualifying = 0;
  let ambiguous = 0;
  let unknownCountryVisits = 0;
  let mostRecent = -Infinity;
  let lastObservedAt: string | null = null;
  const countries = new Set<string>();
  for (const item of input.events) {
    if (!item || typeof item.eventId !== 'string' ||
        !/^[A-Za-z0-9_-]{8,128}$/.test(item.eventId) ||
        item.linkId !== input.linkId || !item.evidence ||
        item.evidence.organizationId !== input.organizationId) return empty('restricted');
    const eventFingerprint = JSON.stringify(item);
    const previousFingerprint = seen.get(item.eventId);
    if (previousFingerprint !== undefined) {
      if (previousFingerprint !== eventFingerprint) return empty('restricted');
      continue;
    }
    seen.set(item.eventId, eventFingerprint);
    const result = evaluateDmLinkVisit(item.evidence);
    if (result.status === 'restricted') return empty('restricted');
    if (result.status === 'ambiguous_request') {
      ambiguous++;
      continue;
    }
    if (result.status === 'country_observed' || result.status === 'observed_country_unknown') {
      qualifying++;
      if (result.observedVisitCountry) countries.add(result.observedVisitCountry);
      else unknownCountryVisits++;
      const when = Date.parse(item.evidence.observedAt ?? '');
      if (Number.isFinite(when) && when > mostRecent) {
        mostRecent = when;
        lastObservedAt = item.evidence.observedAt;
      }
    }
  }
  if (!qualifying) return {
    ...empty('not_observed'),
    ...(ambiguous ? {state:'ambiguous_request' as const, clickStatus:'ambiguous_request' as const} : {}),
    ambiguousRequestCount: ambiguous,
  };
  const country = countries.size === 1 && unknownCountryVisits === 0 ? [...countries][0] : null;
  const state = countries.size > 1 ? 'conflicting_countries'
    : country ? 'country_observed' : 'observed_country_unknown';
  return {
    state,
    clickStatus: country && countries.size === 1 ? 'country_observed' : 'observed_country_unknown',
    observedVisitCountry: country,
    observedVisitAt: lastObservedAt,
    qualifyingVisitCount: qualifying,
    ambiguousRequestCount: ambiguous,
    identityAssurance: 'token_link_only',
    customerResidenceVerified: false,
    pricingEligibility: 'undetermined',
  };
}
