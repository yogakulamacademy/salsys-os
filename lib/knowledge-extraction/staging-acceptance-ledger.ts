import type { EvidenceReadinessResult } from './evidence-lifecycle-readiness';
import type { RefreshPreflight } from './website-refresh-preflight';
import type { HumanReviewHandoffPacket } from './human-review-handoff';

/**
 * KB-04E: ISOLATED-STAGING RELEASE EVIDENCE LEDGER, NOT a release gate API.
 *
 * A caller can record *claims* about external staging tests. Those claims
 * are never independently checked here, so even a complete and internally
 * consistent ledger NEVER permits crawling, storing, AI calls, knowledge
 * mutations, or deployment. The actual verifier must be separately built
 * with real authenticated staging and independent audit evidence.
 *
 * There are no network, database, filesystem, provider, or scheduling calls.
 */
export const STAGING_SCENARIOS = [
  {
    id:'ownership_expiry_denies',
    group:'ownership_and_consent',
    label:'Expired or revoked domain ownership blocks new source reads',
    expected:'deny',
  },
  {
    id:'consent_missing_denies',
    group:'ownership_and_consent',
    label:'Missing or wrong-purpose consent blocks evidence and monitoring',
    expected:'deny',
  },
  {
    id:'consent_withdrawal_stops_queued',
    group:'ownership_and_consent',
    label:'Consent withdrawal prevents queued and in-flight follow-on jobs',
    expected:'deny',
  },
  {
    id:'tenant_a_cannot_read_b',
    group:'tenant_isolation',
    label:'Tenant A cannot read tenant B source or knowledge evidence',
    expected:'deny',
  },
  {
    id:'tenant_a_cannot_write_b',
    group:'tenant_isolation',
    label:'Tenant A cannot mutate tenant B evidence or approval state',
    expected:'deny',
  },
  {
    id:'retention_expiry_erases',
    group:'retention_and_audit',
    label:'Approved retention expiry deletes source quotes and derived data',
    expected:'delete',
  },
  {
    id:'deletion_rehearsal_audited',
    group:'retention_and_audit',
    label:'Deletion and withdrawal events are independently audit-reconciled',
    expected:'audit',
  },
  {
    id:'unauthenticated_reviewer_denied',
    group:'approval_and_versions',
    label:'Unauthenticated or non-admin review claims cannot approve knowledge',
    expected:'deny',
  },
  {
    id:'stale_document_version_denied',
    group:'approval_and_versions',
    label:'A stale version cannot overwrite an updated approved document',
    expected:'deny',
  },
  {
    id:'existing_workflow_only',
    group:'approval_and_versions',
    label:'Any future human approval uses the existing audited workflow',
    expected:'audit',
  },
  {
    id:'ssrf_dns_redirect_robots_denied',
    group:'network_and_operations',
    label:'Unsafe IP/DNS, redirects, robots denials and off-host fetches fail closed',
    expected:'deny',
  },
  {
    id:'quota_and_emergency_stop',
    group:'network_and_operations',
    label:'Rate limits, concurrency and emergency stop prevent further work',
    expected:'deny',
  },
  {
    id:'browser_visible_text_reconciled',
    group:'source_and_semantics',
    label:'Browser-rendered visibility and original source quotes reconcile',
    expected:'reconcile',
  },
  {
    id:'model_ungrounded_answer_denied',
    group:'source_and_semantics',
    label:'Real-provider unsupported or hallucinated claims are not approved',
    expected:'deny',
  },
  {
    id:'historical_citation_coverage',
    group:'source_and_semantics',
    label:'All historical references and changed sources reconcile or remain held',
    expected:'reconcile',
  },
  {
    id:'isolated_staging_rollback',
    group:'operational_release',
    label:'Isolated staging, audit monitoring and rollback rehearsal are witnessed',
    expected:'audit',
  },
] as const;

export type StagingScenario = (typeof STAGING_SCENARIOS)[number];
export type StagingScenarioId = StagingScenario['id'];
export type StagingScenarioOutcome = StagingScenario['expected'];
export type StagingScenarioGroup = StagingScenario['group'];

/**
 * A detached audit evidence digest is a pointer, NOT verified evidence.
 * Never pass raw customer data, login tokens, quotes or secret credentials.
 */
export type StagingScenarioClaim = {
  scenarioId: StagingScenarioId;
  organizationId: string;
  runId: string;
  executedAt: string;
  evidenceSha256: string;
  observedOutcome: StagingScenarioOutcome;
  reportedBy: string;
  evidenceOrigin: 'self_reported_isolated_staging';
};

export type AcceptanceLedgerInput = {
  organizationId: string;
  asOf: string;
  claims: StagingScenarioClaim[];
  /** Upstream pure contracts; not permission tokens. */
  evidenceReadiness: EvidenceReadinessResult | null;
  refreshPreflight: RefreshPreflight | null;
  humanReview: HumanReviewHandoffPacket | null;
};

export type AcceptanceScenarioRow = {
  id: StagingScenarioId;
  group: StagingScenarioGroup;
  label: string;
  expected: StagingScenarioOutcome;
  status: 'missing'|'claimed_needs_independent_verification'|'contradictory_claim';
  evidenceSha256: string | null;
  executedAt: string | null;
};

export type AcceptanceLedgerReport = {
  schemaVersion: 'kb04e-v1';
  status: 'blocked_pending_independent_staging_acceptance';
  organizationScope: string;
  evaluatedAt: string;
  rows: AcceptanceScenarioRow[];
  totals:{
    required:number;
    missing:number;
    claimedButUnverified:number;
    contradictory:number;
  };
  upstreamContractStatus:{
    evidenceDiagnosticOnly:'missing'|'non_authorizing';
    refreshDiagnosticOnly:'missing'|'non_authorizing';
    reviewerHandoffDiagnosticOnly:'missing'|'non_authorizing';
  };
  parentProvenanceIndependentlyVerified: false;
  externalStagingResultsIndependentlyVerified: false;
  tenantIsolationIndependentlyVerified: false;
  consentWithdrawalIndependentlyVerified: false;
  retentionAndDeletionIndependentlyVerified: false;
  releaseApprovalIndependentlyVerified: false;
  canCrawl: false;
  canStoreEvidence: false;
  canCallAIProvider: false;
  canCreateKnowledge: false;
  canApproveKnowledge: false;
  canPublish: false;
  canMerge: false;
  canDeploy: false;
};

export type AcceptanceLedgerResult =
  | {ok:true;report:AcceptanceLedgerReport}
  | {ok:false;error:string};

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA=/^[a-f0-9]{64}$/;
const RUN_ID=/^[a-z0-9][a-z0-9._-]{5,95}$/;

function strictTime(value:unknown):number|null{
  if(typeof value!=='string'||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value))return null;
  const t=Date.parse(value);
  if(!Number.isFinite(t))return null;
  const [prefix,ms='']=value.slice(0,-1).split('.');
  return new Date(t).toISOString()===prefix+'.'+ms.padEnd(3,'0')+'Z'?t:null;
}

function safeParents(input:AcceptanceLedgerInput):boolean {
  const e=input.evidenceReadiness;
  if(e!==null&&(
    !e||!['blocked','eligible_for_review_only'].includes(e.state)||
    e.canStoreEvidence!==false||e.canStoreRawHtml!==false||
    e.canPublishKnowledge!==false||!Number.isSafeInteger(e.total)||
    !Number.isSafeInteger(e.satisfied)||e.satisfied>e.total||
    e.satisfied<0||!Array.isArray(e.gates)||
    e.gates.length!==e.total||
    e.gates.some(g=>!['blocked','satisfied'].includes(g.status))
  ))return false;
  const r=input.refreshPreflight;
  if(r!==null&&(
    !r||r.schemaVersion!=='kb04b-v1'||
    !['blocked','reviewable_in_isolated_staging_only'].includes(r.status)||
    r.evidenceVerifiedAtExecution!==false||r.canEnqueue!==false||
    r.canCrawl!==false||r.canStore!==false||r.canSyncKnowledge!==false||
    r.canApprove!==false||r.canPublish!==false||!Array.isArray(r.gates)||
    !Number.isSafeInteger(r.total)||r.gates.length!==r.total||
    !Number.isSafeInteger(r.satisfied)||r.satisfied<0||
    r.satisfied>r.total
  ))return false;
  const h=input.humanReview;
  if(h!==null&&(
    !h||h.schemaVersion!=='kb04d-v1'||
    h.state!=='synthetic_non_authorizing_handoff'||
    h.organizationScope!==input.organizationId||
    !SHA.test(h.packetId)||!SHA.test(h.sourceAcceptancePacketId)||
    h.intendedExistingWorkflow?.create!=='createKnowledgeDocumentAction'||
    h.intendedExistingWorkflow?.approve!=='approveKnowledgeDocumentAction'||
    h.intendedExistingWorkflow?.connected!==false||
    h.intendedExistingWorkflow?.invoked!==false||
    h.annotationsStored!==false||h.existingKnowledgeModified!==false||
    h.canStore!==false||h.canCreate!==false||
    h.canApprove!==false||h.canPublish!==false||
    !h.requirements||Object.values(h.requirements).some(v=>v!==false)||
    !Array.isArray(h.rows)||h.rows.length>120||
    h.rows.some(row=>row.approved!==false||row.canWrite!==false||
      row.needsRealHumanApproval!==true)
  ))return false;
  return true;
}

/** Pure review of self-reported TEST CLAIMS, never an acceptance decision. */
export function assessStagingAcceptanceLedger(
  input:AcceptanceLedgerInput,
):AcceptanceLedgerResult{
  if(!input||!UUID.test(input.organizationId??'')||
    !Array.isArray(input.claims)||input.claims.length>STAGING_SCENARIOS.length||
    !safeParents(input)){
    return {ok:false,error:'invalid_acceptance_context'};
  }
  const now=strictTime(input.asOf);
  if(now===null)return {ok:false,error:'invalid_acceptance_time'};
  const declared=new Map<StagingScenarioId,StagingScenarioClaim>();
  for(const c of input.claims){
    if(!c||!UUID.test(c.organizationId)||c.organizationId!==input.organizationId||
      !STAGING_SCENARIOS.some(g=>g.id===c.scenarioId)||
      declared.has(c.scenarioId)||!RUN_ID.test(c.runId??'')||
      !['deny','delete','audit','reconcile'].includes(c.observedOutcome)||
      !SHA.test(c.evidenceSha256??'')||
      !UUID.test(c.reportedBy??'')||
      c.evidenceOrigin!=='self_reported_isolated_staging'){
      return {ok:false,error:'invalid_or_duplicate_claim'};
    }
    const executed=strictTime(c.executedAt);
    if(executed===null||executed>now||
      now-executed>90*24*60*60*1000){
      return {ok:false,error:'invalid_or_stale_claim_time'};
    }
    declared.set(c.scenarioId,c);
  }
  const rows:AcceptanceScenarioRow[]=STAGING_SCENARIOS.map(g=>{
    const c=declared.get(g.id);
    return {
      id:g.id,group:g.group,label:g.label,expected:g.expected,
      status:!c?'missing':c.observedOutcome===g.expected
        ?'claimed_needs_independent_verification':'contradictory_claim',
      evidenceSha256:c?.evidenceSha256??null,
      executedAt:c?.executedAt??null,
    };
  });
  const result:AcceptanceLedgerReport={
    schemaVersion:'kb04e-v1',
    status:'blocked_pending_independent_staging_acceptance',
    organizationScope:input.organizationId,
    evaluatedAt:input.asOf,
    rows,
    totals:{
      required:rows.length,
      missing:rows.filter(r=>r.status==='missing').length,
      claimedButUnverified:rows.filter(r=>
        r.status==='claimed_needs_independent_verification').length,
      contradictory:rows.filter(r=>r.status==='contradictory_claim').length,
    },
    upstreamContractStatus:{
      evidenceDiagnosticOnly:input.evidenceReadiness===null?'missing':'non_authorizing',
      refreshDiagnosticOnly:input.refreshPreflight===null?'missing':'non_authorizing',
      reviewerHandoffDiagnosticOnly:input.humanReview===null?'missing':'non_authorizing',
    },
    parentProvenanceIndependentlyVerified:false,
    externalStagingResultsIndependentlyVerified:false,
    tenantIsolationIndependentlyVerified:false,
    consentWithdrawalIndependentlyVerified:false,
    retentionAndDeletionIndependentlyVerified:false,
    releaseApprovalIndependentlyVerified:false,
    canCrawl:false,canStoreEvidence:false,canCallAIProvider:false,
    canCreateKnowledge:false,canApproveKnowledge:false,canPublish:false,
    canMerge:false,canDeploy:false,
  };
  return {ok:true,report:result};
}
