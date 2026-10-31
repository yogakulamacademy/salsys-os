import 'server-only';

import {
  previewAudienceRule,
  type AudienceRulePreview,
  type AudienceRulePreviewRule,
} from '@/lib/ad-activation/audience-rule-preview';

const ACTIVE_STAGES = [
  'new',
  'contacted',
  'engaged',
  'qualified',
  'high_intent',
  'payment_pending',
  'nurture',
  'not_now',
] as const;

export type LiveAudienceInsight = {
  id: string;
  name: string;
  description: string;
  matchedPeople: number;
  matchedLeads: number;
  identityUnlinkedLeads: number;
  identityCoveragePct: number;
  generatedAt: string;
  dataTruncated: boolean;
  readiness: 'empty' | 'identity_gap' | 'review_ready';
  readinessLabel: string;
  recommendation: string;
  topSource: string | null;
  topCourse: string | null;
  topLocation: string | null;
  topStage: string | null;
  breakdowns: AudienceRulePreview['breakdowns'];
};

type SegmentDefinition = {
  id: string;
  name: string;
  description: string;
  rule: AudienceRulePreviewRule;
  recommendation: (preview: AudienceRulePreview) => string;
};

const SEGMENTS: readonly SegmentDefinition[] = [
  {
    id: 'recent-active-prospects',
    name: 'Recently active prospects',
    description: 'Open prospects with CRM activity in the last 30 days.',
    rule: {
      id: 'live-recent-active-prospects',
      name: 'Recently active prospects',
      includeStages: [...ACTIVE_STAGES],
      excludeStages: ['enrolled', 'lost', 'unqualified', 'duplicate'],
      maxInteractionAgeDays: 30,
    },
    recommendation: (preview) =>
      preview.matchedPeople > 0
        ? 'Keep acquisition messaging aligned with the courses and locations dominating this active pool.'
        : 'No recent prospect pool is visible. Check acquisition volume and CRM follow-up capture.',
  },
  {
    id: 'high-intent-prospects',
    name: 'High-intent prospects',
    description: 'Qualified, high-intent or payment-pending prospects active in the last 60 days.',
    rule: {
      id: 'live-high-intent-prospects',
      name: 'High-intent prospects',
      includeStages: ['qualified', 'high_intent', 'payment_pending'],
      excludeStages: ['enrolled', 'lost', 'unqualified', 'duplicate'],
      maxInteractionAgeDays: 60,
    },
    recommendation: (preview) =>
      preview.matchedPeople > 0
        ? 'Prioritize sales follow-up first; use retargeting only as support so paid messaging does not compete with active admissions conversations.'
        : 'No high-intent pool is visible right now. Focus on qualification quality before adding retargeting pressure.',
  },
  {
    id: 'mysore-active-prospects',
    name: 'Mysore active prospects',
    description: 'Recent Mysore prospects who remain in an open CRM stage.',
    rule: {
      id: 'live-mysore-active-prospects',
      name: 'Mysore active prospects',
      locationSearch: 'mysore',
      includeStages: [...ACTIVE_STAGES],
      excludeStages: ['enrolled', 'lost', 'unqualified', 'duplicate'],
      maxInteractionAgeDays: 60,
    },
    recommendation: (preview) =>
      preview.matchedPeople > 0
        ? 'Use the next Mysore batch, campus proof and accommodation context as the primary creative angle.'
        : 'No current Mysore audience is visible. Avoid forcing a Mysore-specific campaign until demand reappears.',
  },
  {
    id: '200h-recent-prospects',
    name: '200H recent prospects',
    description: 'Recent prospects whose selected course matches the 200-hour program.',
    rule: {
      id: 'live-200h-recent-prospects',
      name: '200H recent prospects',
      courseSearch: '200',
      includeStages: [...ACTIVE_STAGES],
      excludeStages: ['enrolled', 'lost', 'unqualified', 'duplicate'],
      maxInteractionAgeDays: 90,
    },
    recommendation: (preview) =>
      preview.matchedPeople > 0
        ? 'Segment creative by the leading location/source instead of sending one generic 200H message to everyone.'
        : 'No recent 200H segment is visible. Review course mapping and recent demand before activating a dedicated audience.',
  },
  {
    id: 'online-active-prospects',
    name: 'Online active prospects',
    description: 'Recent prospects whose preferred location indicates online study.',
    rule: {
      id: 'live-online-active-prospects',
      name: 'Online active prospects',
      locationSearch: 'online',
      includeStages: [...ACTIVE_STAGES],
      excludeStages: ['enrolled', 'lost', 'unqualified', 'duplicate'],
      maxInteractionAgeDays: 60,
    },
    recommendation: (preview) =>
      preview.matchedPeople > 0
        ? 'Use schedule flexibility, live-class format and certification proof rather than residential-course messaging.'
        : 'Online demand is not visible in the current CRM slice. Keep this audience dormant until new activity appears.',
  },
  {
    id: 'nurture-reengagement',
    name: 'Nurture & not-now prospects',
    description: 'Leads intentionally held in nurture or not-now stages with activity in the last 180 days.',
    rule: {
      id: 'live-nurture-reengagement',
      name: 'Nurture and not-now prospects',
      includeStages: ['nurture', 'not_now'],
      maxInteractionAgeDays: 180,
    },
    recommendation: (preview) =>
      preview.matchedPeople > 0
        ? 'Use low-pressure re-engagement: upcoming dates, useful course guidance or fresh proof—not urgency-first acquisition ads.'
        : 'There is no meaningful nurture pool to reactivate at the moment.',
  },
  {
    id: 'alumni-progression',
    name: 'Existing students / alumni',
    description: 'People linked to leads currently recorded as enrolled.',
    rule: {
      id: 'live-alumni-progression',
      name: 'Existing students and alumni',
      includeStages: ['enrolled'],
    },
    recommendation: (preview) =>
      preview.matchedPeople > 0
        ? 'Exclude this group from prospect acquisition and use progression messaging only when the next program is genuinely relevant.'
        : 'No enrolled audience is linked strongly enough for progression intelligence yet.',
  },
] as const;

export async function getLiveAudienceIntelligence(organizationId: string) {
  const generatedAt = new Date().toISOString();
  const results = await Promise.all(
    SEGMENTS.map(async (segment): Promise<LiveAudienceInsight> => {
      const result = await previewAudienceRule({ organizationId, rule: segment.rule });

      if (result.sensitiveRuleRejected) {
        return {
          id: segment.id,
          name: segment.name,
          description: segment.description,
          matchedPeople: 0,
          matchedLeads: 0,
          identityUnlinkedLeads: 0,
          identityCoveragePct: 0,
          generatedAt,
          dataTruncated: false,
          readiness: 'empty',
          readinessLabel: 'Rule unavailable',
          recommendation: 'This audience cannot be evaluated because the rule was rejected by the sensitive-category safety gate.',
          topSource: null,
          topCourse: null,
          topLocation: null,
          topStage: null,
          breakdowns: { stage: [], intent: [], course: [], location: [], source: [] },
        };
      }

      const linkedLeads = Math.max(0, result.matchedLeads - result.identityUnlinkedLeads);
      const identityCoveragePct = result.matchedLeads
        ? Math.round((linkedLeads / result.matchedLeads) * 100)
        : 0;
      const readiness = resolveReadiness(result, identityCoveragePct);

      return {
        id: segment.id,
        name: segment.name,
        description: segment.description,
        matchedPeople: result.matchedPeople,
        matchedLeads: result.matchedLeads,
        identityUnlinkedLeads: result.identityUnlinkedLeads,
        identityCoveragePct,
        generatedAt: result.generatedAt,
        dataTruncated: result.dataTruncated,
        readiness,
        readinessLabel: readinessLabel(readiness),
        recommendation: segment.recommendation(result),
        topSource: result.breakdowns.source[0]?.label ?? null,
        topCourse: result.breakdowns.course[0]?.label ?? null,
        topLocation: result.breakdowns.location[0]?.label ?? null,
        topStage: result.breakdowns.stage[0]?.label ?? null,
        breakdowns: result.breakdowns,
      };
    }),
  );

  return {
    generatedAt,
    segments: results,
    totalMatchedPeople: results.reduce((sum, segment) => sum + segment.matchedPeople, 0),
    segmentsWithDemand: results.filter((segment) => segment.matchedPeople > 0).length,
    reviewReadySegments: results.filter((segment) => segment.readiness === 'review_ready').length,
    identityGapSegments: results.filter((segment) => segment.readiness === 'identity_gap').length,
  };
}

function resolveReadiness(preview: AudienceRulePreview, identityCoveragePct: number): LiveAudienceInsight['readiness'] {
  if (preview.matchedPeople === 0) return 'empty';
  if (identityCoveragePct < 75 || preview.identityUnlinkedLeads > 5) return 'identity_gap';
  return 'review_ready';
}

function readinessLabel(readiness: LiveAudienceInsight['readiness']) {
  if (readiness === 'review_ready') return 'Ready for review';
  if (readiness === 'identity_gap') return 'Identity quality needs attention';
  return 'No current audience';
}
