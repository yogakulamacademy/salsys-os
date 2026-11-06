import { createHash } from 'node:crypto';
import {
  assessSourceChangeImpact,
  type SourceChangeBinding,
  type HistoricalKnowledgeCitation,
  type SourceChangeImpactOptions,
  type ChangeImpactReason,
  type SourceChangeImpactReport,
} from './source-change-impact';
import type {
  WebsiteSnapshotDeltaReport,
  WebsiteSnapshotDeltaSource,
  WebsiteSnapshotChangeKind,
} from './website-snapshot-delta';

/**
 * KB-04D — UNCOMMITTED human-review planning only.
 *
 * Rebuild KB-04C's guarded report from source inputs rather than trusting a
 * caller-supplied report. Triage choices are not an authorization, not human
 * identity evidence, and never become approved knowledge or persisted audit.
 * The existing knowledge create/approve/archive actions must remain separate.
 */
export type KnowledgeChangeTriageIntent =
  | 'inspect_updated_source'
  | 'retain_existing_pending_verification'
  | 'defer_for_human_review';

export type KnowledgeChangeTriageChoice = {
  changeId: string;
  intent: KnowledgeChangeTriageIntent;
  note: string;
};

export type KnowledgeChangeReviewRow = {
  changeId: string;
  changeKind: WebsiteSnapshotChangeKind;
  prior: WebsiteSnapshotDeltaSource | null;
  current: WebsiteSnapshotDeltaSource | null;
  riskReasons: ChangeImpactReason[];
  potentialPublishedCitationImpact: boolean;
  proposedIntent: KnowledgeChangeTriageIntent | null;
  proposedNote: string | null;
  reviewState: 'local_only_uncommitted';
  humanSourceVerificationCompleted: false;
  reviewerIdentityVerified: false;
  auditedDecisionRecorded: false;
  approvedKnowledgeChanged: false;
  canSubmitForApproval: false;
};

export type KnowledgeChangeReviewGate = {
  id:
    | 'independent_source_and_browser_verification'
    | 'authenticated_tenant_reviewers'
    | 'approved_consent_retention_and_deletion'
    | 'isolated_rls_and_staging_acceptance'
    | 'reviewer_audit_and_atomic_handoff'
    | 'independent_semantic_and_effective_period_review'
    | 'manual_approval_and_production_release';
  state: 'blocked';
};

export type KnowledgeChangeReviewPlan = {
  schemaVersion: 'kb04d-v1';
  state: 'synthetic_uncommitted_review_plan';
  planId: string;
  organizationScope: string;
  verifiedHostnameScope: string;
  reviewAsOf: string;
  rows: KnowledgeChangeReviewRow[];
  counts: {
    totalChanges: number;
    localChoices: number;
    stillUntriaged: number;
    potentiallyAffectedPublishedDocuments: number;
    unmappedChanges: number;
    historicalReferencesNotCovered: number;
    fieldsNeedingSemanticReview: number;
  };
  missingReleaseGates: KnowledgeChangeReviewGate[];
  existingLifecycle: {
    createAction: 'createKnowledgeDocumentAction';
    approvalAction: 'approveKnowledgeDocumentAction';
    archiveAction: 'archiveKnowledgeDocumentAction';
    integration: 'not_connected';
    canInvoke: false;
    directApprovalForbidden: true;
  };
  reviewIdentityAuthenticated: false;
  realSourceVerificationCompleted: false;
  choicesPersisted: false;
  auditTrailWritten: false;
  knowledgeDocumentsChanged: false;
  canStoreEvidence: false;
  canCreateDraft: false;
  canApprove: false;
  canArchive: false;
  canPublish: false;
};

export type KnowledgeChangeReviewPlanResult =
  | { ok: true; plan: KnowledgeChangeReviewPlan }
  | { ok: false; error: string };

const SHA = /^[a-f0-9]{64}$/;
const INTENTS = new Set<KnowledgeChangeTriageIntent>([
  'inspect_updated_source',
  'retain_existing_pending_verification',
  'defer_for_human_review',
]);
const hash = (value: string) =>
  createHash('sha256').update(value, 'utf8').digest('hex');
const GATES: KnowledgeChangeReviewGate['id'][] = [
  'independent_source_and_browser_verification',
  'authenticated_tenant_reviewers',
  'approved_consent_retention_and_deletion',
  'isolated_rls_and_staging_acceptance',
  'reviewer_audit_and_atomic_handoff',
  'independent_semantic_and_effective_period_review',
  'manual_approval_and_production_release',
];

function choicesValid(
  choices: unknown,
  report: SourceChangeImpactReport,
): choices is KnowledgeChangeTriageChoice[] {
  if (!Array.isArray(choices) || choices.length > report.changes.length) {
    return false;
  }
  const changes = new Map(report.changes.map(change=>[change.changeId,change]));
  const seen = new Set<string>();
  for (const item of choices) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const c = item as Record<string, unknown>;
    if (typeof c.changeId !== 'string' || !SHA.test(c.changeId) ||
      seen.has(c.changeId) ||
      typeof c.intent !== 'string' ||
      !INTENTS.has(c.intent as KnowledgeChangeTriageIntent) ||
      typeof c.note !== 'string' || c.note.length > 500 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(c.note)) return false;
    const changed = changes.get(c.changeId);
    if (!changed) return false;
    if (c.intent === 'inspect_updated_source' && !changed.current) return false;
    if (c.intent === 'retain_existing_pending_verification' && !changed.prior) {
      return false;
    }
    seen.add(c.changeId);
  }
  return true;
}

/**
 * This is an OFFLINE planning calculation, not a database authorization.
 * Changes can be triaged in memory, but every release gate remains blocked.
 */
export function prepareKnowledgeChangeReviewPlan(
  deltas: WebsiteSnapshotDeltaReport[],
  bindings: SourceChangeBinding[],
  historical: HistoricalKnowledgeCitation[],
  options: SourceChangeImpactOptions,
  choices: unknown = [],
): KnowledgeChangeReviewPlanResult {
  const assessed=assessSourceChangeImpact(deltas,bindings,historical,options);
  if(!assessed.ok)return {ok:false,error:'change_impact_rejected'};
  const report=assessed.report;
  if(!choicesValid(choices,report)){
    return {ok:false,error:'invalid_local_review_intents'};
  }

  const byId = new Map(choices.map(choice=>[
    choice.changeId,
    {intent:choice.intent,note:choice.note.trim()},
  ]));
  const rows:KnowledgeChangeReviewRow[]=report.changes.map(change=>{
    const choice=byId.get(change.changeId);
    return {
      changeId:change.changeId,
      changeKind:change.changeKind,
      prior:change.prior ? {
        ...change.prior,headingPath:[...change.prior.headingPath],
      } : null,
      current:change.current ? {
        ...change.current,headingPath:[...change.current.headingPath],
      } : null,
      riskReasons:[...change.reasons],
      potentialPublishedCitationImpact:change.reasons.includes(
        'published_citation_potentially_affected',
      ),
      proposedIntent:choice?.intent??null,
      proposedNote:choice?.note||null,
      reviewState:'local_only_uncommitted',
      humanSourceVerificationCompleted:false,
      reviewerIdentityVerified:false,
      auditedDecisionRecorded:false,
      approvedKnowledgeChanged:false,
      canSubmitForApproval:false,
    };
  });
  return {ok:true,plan:{
    schemaVersion:'kb04d-v1',
    state:'synthetic_uncommitted_review_plan',
    planId:hash(JSON.stringify([
      report.organizationScope,report.asOf,
      rows.map(row=>[
        row.changeId,row.prior?.quoteSha256??null,
        row.current?.quoteSha256??null,row.proposedIntent,row.proposedNote,
      ]),
    ])),
    organizationScope:report.organizationScope,
    verifiedHostnameScope:report.verifiedHostnameScope,
    reviewAsOf:report.asOf,
    rows,
    counts:{
      totalChanges:rows.length,
      localChoices:rows.filter(row=>row.proposedIntent!==null).length,
      stillUntriaged:rows.filter(row=>row.proposedIntent===null).length,
      potentiallyAffectedPublishedDocuments:
        report.counts.potentiallyAffectedPublishedDocuments,
      unmappedChanges:report.counts.unboundChanges,
      historicalReferencesNotCovered:report.counts.historicalReferencesNotCovered,
      fieldsNeedingSemanticReview:report.counts.fieldsNeedingReview,
    },
    missingReleaseGates:GATES.map(id=>({id,state:'blocked'})),
    existingLifecycle:{
      createAction:'createKnowledgeDocumentAction',
      approvalAction:'approveKnowledgeDocumentAction',
      archiveAction:'archiveKnowledgeDocumentAction',
      integration:'not_connected',
      canInvoke:false,directApprovalForbidden:true,
    },
    reviewIdentityAuthenticated:false,
    realSourceVerificationCompleted:false,
    choicesPersisted:false,auditTrailWritten:false,
    knowledgeDocumentsChanged:false,
    canStoreEvidence:false,canCreateDraft:false,
    canApprove:false,canArchive:false,canPublish:false,
  }};
}
