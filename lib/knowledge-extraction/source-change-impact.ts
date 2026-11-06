import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import type {
  WebsiteSnapshotDeltaReport, WebsiteSnapshotChange,
  WebsiteSnapshotDeltaSource,
} from './website-snapshot-delta';

/**
 * KB-04C: conservative change-impact REVIEW hints only.
 *
 * Semantic equivalence is NEVER inferred from two different pages, headings,
 * URLs, dates, or prices. The caller must supply an explicitly reviewed
 * comparison binding for each quote. The function has no I/O and cannot
 * alter an approved knowledge document, retrieve content, or publish.
 */
export type ChangeFieldKind = 'price' | 'date' | 'policy' | 'other';
export type ChangeQuoteSide = 'prior' | 'current';

export type SourceChangeBinding = {
  organizationId: string;
  changeId: string;
  side: ChangeQuoteSide;
  scopeKey: string;
  fieldKey: string;
  kind: ChangeFieldKind;
  /** Explicit REVIEW annotations, not verified legal/effective dates. */
  effectiveFrom: string | null;
  effectiveUntil: string | null;
};

export type HistoricalKnowledgeCitation = {
  organizationId: string;
  documentId: string;
  version: number;
  state: 'published' | 'superseded' | 'archived';
  sourceUrl: string;
  snapshotSha256: string;
  blockId: string;
  quoteSha256: string;
};

export type SourceChangeImpactOptions = {
  organizationId: string;
  verifiedHostname: string;
  asOf: string;
  /** Review threshold, NOT a data-retention or deletion period. */
  reviewAgeDays: number;
};

export type ChangeImpactReason =
  | 'source_authenticity_unverified'
  | 'semantic_binding_missing'
  | 'source_quote_removed'
  | 'published_citation_potentially_affected'
  | 'current_snapshot_review_age_exceeded';

export type ChangeImpactItem = {
  changeId: string;
  changeKind: WebsiteSnapshotChange['kind'];
  prior: WebsiteSnapshotDeltaSource | null;
  current: WebsiteSnapshotDeltaSource | null;
  reasons: ChangeImpactReason[];
  reviewStatus: 'unreviewed';
  needsHumanReview: true;
  suggestedAutomaticSuppression: true;
  actualKnowledgeSuppressed: false;
  canUpdateKnowledge: false;
};

export type TemporalReviewReason =
  | 'unverified_effective_period'
  | 'possible_overlapping_periods'
  | 'nonoverlapping_periods_not_a_conflict'
  | 'same_quotation_not_independent_confirmation'
  | 'single_source_not_confirmed';

export type FieldReview = {
  scopeKey: string;
  fieldKey: string;
  kind: ChangeFieldKind;
  reason: TemporalReviewReason;
  citations: Array<{
    changeId: string;
    side: ChangeQuoteSide;
    source: WebsiteSnapshotDeltaSource;
    effectiveFrom: string | null;
    effectiveUntil: string | null;
  }>;
  needsHumanReview: true;
  canSelectCurrentTruth: false;
};

export type SourceChangeImpactReport = {
  schemaVersion: 'kb04c-v1';
  state: 'synthetic_change_impact_review';
  organizationScope: string;
  verifiedHostnameScope: string;
  asOf: string;
  changes: ChangeImpactItem[];
  fieldReviews: FieldReview[];
  counts: {
    changes: number;
    unboundChanges: number;
    potentiallyAffectedPublishedDocuments: number;
    historicalReferencesNotCovered: number;
    fieldsNeedingReview: number;
  };
  sourceTruthDetermined: false;
  semanticMappingVerifiedBySystem: false;
  websiteOwnershipVerifiedBySystem: false;
  evidenceStored: false;
  publishedKnowledgeModified: false;
  canFetch: false;
  canStore: false;
  canSuppressPublishedKnowledge: false;
  canApprove: false;
  canPublish: false;
};

export type SourceChangeImpactResult =
  | { ok: true; report: SourceChangeImpactReport }
  | { ok: false; error: string };

const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY = /^[a-z0-9][a-z0-9:._/-]{1,99}$/;
const kinds = new Set<ChangeFieldKind>(['price','date','policy','other']);
const quoteKinds = new Set(['paragraph','list_item','table_row','faq_question','faq_answer']);
const hash = (v:string) => createHash('sha256').update(v,'utf8').digest('hex');

function isoTime(v:unknown):number|null {
  if(typeof v!=='string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(v))return null;
  const n=Date.parse(v);
  if(!Number.isFinite(n))return null;
  const [prefix,ms='']=v.slice(0,-1).split('.');
  return new Date(n).toISOString()===prefix+'.'+ms.padEnd(3,'0')+'Z'?n:null;
}
function dateOnly(v:string|null):number|null {
  if(v===null)return null;
  if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return null;
  const n=Date.parse(v+'T00:00:00.000Z');
  return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===v?n:null;
}
function validUrl(u:unknown,host:string):boolean {
  if(typeof u!=='string'||u.length>2048)return false;
  try {
    const p=new URL(u);
    return p.protocol==='https:'&&p.hostname===host&&!p.port&&
      !p.username&&!p.password&&!p.search&&!p.hash&&p.href===u;
  }catch{return false;}
}
function validSource(
  s:WebsiteSnapshotDeltaSource|null,delta:WebsiteSnapshotDeltaReport,
  side:ChangeQuoteSide,
):boolean {
  if(s===null)return true;
  if(!s||!validUrl(s.sourceUrl,delta.verifiedHostnameScope)||
    s.sourceUrl!==delta.sourceUrl ||
    s.fetchedAt!==(side==='prior'?delta.priorFetchedAt:delta.currentFetchedAt)||
    s.snapshotSha256!==(side==='prior'?
      delta.priorSnapshotSha256:delta.currentSnapshotSha256)||
    !HASH.test(s.blockId)||!HASH.test(s.quoteSha256)||
    !quoteKinds.has(s.blockKind)||
    !Number.isSafeInteger(s.sourceBlockIndex)||
    s.sourceBlockIndex<0||s.sourceBlockIndex>250||
    typeof s.exactQuote!=='string'||!s.exactQuote.trim()||
    s.exactQuote.length>6000||hash(s.exactQuote)!==s.quoteSha256||
    !Array.isArray(s.headingPath)||s.headingPath.length>6||
    s.headingPath.some(h=>typeof h!=='string'||!h.trim()||h.length>300))return false;
  return hash(JSON.stringify([
    s.snapshotSha256,s.sourceBlockIndex,s.blockKind,s.exactQuote,
  ]))===s.blockId;
}
function validDelta(d:WebsiteSnapshotDeltaReport,host:string,now:number):boolean {
  if(!d||d.schemaVersion!=='kb04a-v1'||
    d.state!=='unverified_snapshot_comparison'||
    d.verifiedHostnameScope!==host||!validUrl(d.sourceUrl,host)||
    !HASH.test(d.priorSnapshotSha256)||!HASH.test(d.currentSnapshotSha256)||
    d.sourceAuthenticityVerified!==false||
    d.renderedVisibilityVerified!==false||
    d.liveWebsiteChangeConfirmed!==false||
    d.approvalStatus!=='unreviewed'||d.canStore!==false||
    d.canScheduleCrawl!==false||d.canApprove!==false||d.canPublish!==false||
    !Array.isArray(d.issues)||
    !d.issues.includes('source_authenticity_not_reverified')||
    !Array.isArray(d.changes)||d.changes.length>360||
    !d.counts||!Number.isSafeInteger(d.counts.unchanged)||
    d.counts.unchanged<0)return false;
  const a=isoTime(d.priorFetchedAt),b=isoTime(d.currentFetchedAt);
  if(a===null||b===null||a>=b||b>now)return false;
  const seen=new Set<string>();
  const count={added:0,removed:0,modified:0};
  for(const c of d.changes){
    if(!c||!HASH.test(c.id)||seen.has(c.id)||
      !['added','removed','modified'].includes(c.kind)||
      c.reviewStatus!=='unreviewed'||c.requiresHumanReview!==true||
      c.canApprove!==false||c.canPublish!==false||
      !validSource(c.prior,d,'prior')||!validSource(c.current,d,'current')||
      (c.kind==='added'&&(!c.current||c.prior!==null))||
      (c.kind==='removed'&&(!c.prior||c.current!==null))||
      (c.kind==='modified'&&(!c.current||!c.prior)))return false;
    if(c.id!==hash(JSON.stringify([
      c.kind,c.prior?.snapshotSha256,c.prior?.blockId,
      c.current?.snapshotSha256,c.current?.blockId,
    ])))return false;
    seen.add(c.id);
    count[c.kind]++;
  }
  return count.added===d.counts.added&&count.removed===d.counts.removed&&
    count.modified===d.counts.modified;
}
function sourceKey(s:WebsiteSnapshotDeltaSource):string {
  return JSON.stringify([s.sourceUrl,s.snapshotSha256,s.blockId,s.quoteSha256]);
}
function intervalsOverlap(a:SourceChangeBinding,b:SourceChangeBinding):boolean {
  // All four boundaries are already validated; intervals are [from,until).
  return dateOnly(a.effectiveFrom)!<dateOnly(b.effectiveUntil)! &&
    dateOnly(b.effectiveFrom)!<dateOnly(a.effectiveUntil)!;
}

/**
 * Explicit comparison mapping can span multiple pages on the same host,
 * but cannot certify semantic equivalence, provenance or current truth.
 * All published knowledge remains unchanged.
 */
export function assessSourceChangeImpact(
  deltas:WebsiteSnapshotDeltaReport[],
  bindings:SourceChangeBinding[],
  historical:HistoricalKnowledgeCitation[],
  options:SourceChangeImpactOptions,
):SourceChangeImpactResult {
  if(!options||!UUID.test(options.organizationId??'')||
    typeof options.verifiedHostname!=='string'||
    options.verifiedHostname.length>253||
    !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(options.verifiedHostname)||
    options.verifiedHostname.includes('..')||isIP(options.verifiedHostname)||
    !Number.isSafeInteger(options.reviewAgeDays)||
    options.reviewAgeDays<1||options.reviewAgeDays>3650||
    !Array.isArray(deltas)||deltas.length<1||deltas.length>25||
    !Array.isArray(bindings)||bindings.length>360||
    !Array.isArray(historical)||historical.length>200)return {
      ok:false,error:'invalid_change_impact_input',
    };
  const now=isoTime(options.asOf);
  if(now===null)return {ok:false,error:'invalid_as_of'};
  const changeMap=new Map<string,{change:WebsiteSnapshotChange;delta:WebsiteSnapshotDeltaReport}>();
  const seenReports=new Set<string>();
  for(const d of deltas){
    if(!validDelta(d,options.verifiedHostname,now))return {
      ok:false,error:'invalid_change_report',
    };
    const reportKey=JSON.stringify([d.sourceUrl,d.priorSnapshotSha256,
      d.currentSnapshotSha256,d.priorFetchedAt,d.currentFetchedAt]);
    if(seenReports.has(reportKey))return {ok:false,error:'duplicate_change_report'};
    seenReports.add(reportKey);
    for(const c of d.changes){
      if(changeMap.has(c.id))return {ok:false,error:'duplicate_change_identity'};
      changeMap.set(c.id,{change:c,delta:d});
    }
  }
  const bound=new Map<string,SourceChangeBinding>();
  const grouped=new Map<string,Array<{
    binding:SourceChangeBinding;source:WebsiteSnapshotDeltaSource;
  }>>();
  const kindsByField=new Map<string,ChangeFieldKind>();
  for(const b of bindings){
    if(!b||b.organizationId!==options.organizationId||
      !HASH.test(b.changeId)||!['prior','current'].includes(b.side)||
      typeof b.scopeKey!=='string'||!KEY.test(b.scopeKey)||
      typeof b.fieldKey!=='string'||!KEY.test(b.fieldKey)||
      !kinds.has(b.kind)||
      (b.effectiveFrom!==null&&dateOnly(b.effectiveFrom)===null)||
      (b.effectiveUntil!==null&&dateOnly(b.effectiveUntil)===null)||
      (b.effectiveFrom!==null&&b.effectiveUntil!==null&&
        dateOnly(b.effectiveFrom)!>=dateOnly(b.effectiveUntil)!)){
      return {ok:false,error:'invalid_semantic_binding'};
    }
    const entry=changeMap.get(b.changeId);
    const s=entry?.change[b.side];
    if(!s)return {ok:false,error:'binding_missing_source_quote'};
    const ref=b.changeId+':'+b.side;
    if(bound.has(ref))return {ok:false,error:'duplicate_or_ambiguous_binding'};
    const fieldKey=JSON.stringify([b.scopeKey,b.fieldKey]);
    const previousKind=kindsByField.get(fieldKey);
    if(previousKind&&previousKind!==b.kind)return {
      ok:false,error:'incompatible_field_types',
    };
    kindsByField.set(fieldKey,b.kind);
    bound.set(ref,b);
    grouped.set(fieldKey,[...(grouped.get(fieldKey)??[]),{binding:b,source:s}]);
  }
  const historySeen=new Set<string>();
  const affectedDocuments=new Set<string>();
  const historicalKeys=new Set<string>();
  const oldKeys=new Set<string>();
  for(const {change} of changeMap.values())if(change.prior)oldKeys.add(sourceKey(change.prior));
  let unlinkedHistory=0;
  for(const h of historical){
    if(!h||h.organizationId!==options.organizationId||
      !UUID.test(h.documentId)||!Number.isSafeInteger(h.version)||h.version<1||
      !['published','superseded','archived'].includes(h.state)||
      !validUrl(h.sourceUrl,options.verifiedHostname)||
      !HASH.test(h.snapshotSha256)||!HASH.test(h.blockId)||
      !HASH.test(h.quoteSha256))return {
        ok:false,error:'invalid_historical_reference',
      };
    const identity=JSON.stringify([h.documentId,h.version,h.sourceUrl,
      h.snapshotSha256,h.blockId,h.quoteSha256]);
    if(historySeen.has(identity))return {ok:false,error:'duplicate_historical_version'};
    historySeen.add(identity);
    const key=JSON.stringify([h.sourceUrl,h.snapshotSha256,h.blockId,h.quoteSha256]);
    if(!oldKeys.has(key)){unlinkedHistory++;continue;}
    if(h.state==='published'){
      historicalKeys.add(key);
      affectedDocuments.add(h.documentId);
    }
  }
  const items:ChangeImpactItem[]=[];
  let unboundChanges=0;
  for(const {change,delta} of changeMap.values()){
    const mapped=(change.prior&&bound.has(change.id+':prior'))||
      (change.current&&bound.has(change.id+':current'));
    const reasons:ChangeImpactReason[]=['source_authenticity_unverified'];
    if(!mapped){reasons.push('semantic_binding_missing');unboundChanges++;}
    if(change.kind==='removed')reasons.push('source_quote_removed');
    if(change.prior&&historicalKeys.has(sourceKey(change.prior))){
      reasons.push('published_citation_potentially_affected');
    }
    if(now-Date.parse(delta.currentFetchedAt)>=options.reviewAgeDays*86400000){
      reasons.push('current_snapshot_review_age_exceeded');
    }
    items.push({
      changeId:change.id,changeKind:change.kind,
      prior:change.prior,current:change.current,reasons,
      reviewStatus:'unreviewed',needsHumanReview:true,
      suggestedAutomaticSuppression:true,
      actualKnowledgeSuppressed:false,canUpdateKnowledge:false,
    });
  }
  items.sort((a,b)=>a.changeId.localeCompare(b.changeId));
  const fieldReviews:FieldReview[]=[];
  for(const [key,entries] of grouped){
    if(entries.length>30)return {ok:false,error:'field_group_over_limit'};
    const sorted=[...entries].sort((a,b)=>
      (a.source.sourceUrl+a.source.blockId).localeCompare(
        b.source.sourceUrl+b.source.blockId));
    const quotes=new Set(sorted.map(x=>x.source.exactQuote));
    let reason:TemporalReviewReason;
    if(sorted.length===1)reason='single_source_not_confirmed';
    else if(quotes.size===1)reason='same_quotation_not_independent_confirmation';
    else if(sorted.some(x=>x.binding.effectiveFrom===null||
      x.binding.effectiveUntil===null))reason='unverified_effective_period';
    else {
      let overlap=false;
      for(let i=0;i<sorted.length;i++)for(let j=i+1;j<sorted.length;j++){
        if(intervalsOverlap(sorted[i].binding,sorted[j].binding))overlap=true;
      }
      reason=overlap?'possible_overlapping_periods':
        'nonoverlapping_periods_not_a_conflict';
    }
    const [scopeKey,fieldKey]=JSON.parse(key) as [string,string];
    fieldReviews.push({
      scopeKey,fieldKey,kind:sorted[0].binding.kind,reason,
      citations:sorted.map(x=>({
        changeId:x.binding.changeId,side:x.binding.side,source:x.source,
        effectiveFrom:x.binding.effectiveFrom,
        effectiveUntil:x.binding.effectiveUntil,
      })),
      needsHumanReview:true,canSelectCurrentTruth:false,
    });
  }
  fieldReviews.sort((a,b)=>a.scopeKey.localeCompare(b.scopeKey)||
    a.fieldKey.localeCompare(b.fieldKey));
  return {ok:true,report:{
    schemaVersion:'kb04c-v1',state:'synthetic_change_impact_review',
    organizationScope:options.organizationId,
    verifiedHostnameScope:options.verifiedHostname,
    asOf:options.asOf,changes:items,fieldReviews,
    counts:{
      changes:items.length,unboundChanges,
      potentiallyAffectedPublishedDocuments:affectedDocuments.size,
      historicalReferencesNotCovered:unlinkedHistory,
      fieldsNeedingReview:fieldReviews.length,
    },
    sourceTruthDetermined:false,
    semanticMappingVerifiedBySystem:false,
    websiteOwnershipVerifiedBySystem:false,
    evidenceStored:false,publishedKnowledgeModified:false,
    canFetch:false,canStore:false,canSuppressPublishedKnowledge:false,
    canApprove:false,canPublish:false,
  }};
}
