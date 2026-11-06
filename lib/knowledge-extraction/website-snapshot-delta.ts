import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import type {
  PreparedWebsiteEvidence, SourceEvidenceBlock,
} from './website-evidence';

/**
 * KB-04A: conservative, deterministic comparison of TWO pre-authorized
 * website-evidence snapshots for the SAME exact verified HTTPS page.
 *
 * This cannot prove that either snapshot came from a live website or that
 * a difference is truthful. It never fetches, persists, schedules re-crawls,
 * changes approved knowledge or calls an AI model.
 */
export type WebsiteSnapshotDeltaSource = {
  sourceUrl: string;
  fetchedAt: string;
  snapshotSha256: string;
  blockId: string;
  sourceBlockIndex: number;
  blockKind: SourceEvidenceBlock['blockKind'];
  headingPath: string[];
  exactQuote: string;
  quoteSha256: string;
};

export type WebsiteSnapshotChangeKind = 'added' | 'removed' | 'modified';
export type WebsiteSnapshotChange = {
  id: string;
  kind: WebsiteSnapshotChangeKind;
  prior: WebsiteSnapshotDeltaSource | null;
  current: WebsiteSnapshotDeltaSource | null;
  reviewStatus: 'unreviewed';
  requiresHumanReview: true;
  canApprove: false;
  canPublish: false;
};
export type WebsiteSnapshotIssue =
  | 'page_title_changed'
  | 'ambiguous_text_alignment'
  | 'stylesheet_and_runtime_visibility_not_verified'
  | 'source_authenticity_not_reverified';

export type WebsiteSnapshotDeltaReport = {
  schemaVersion: 'kb04a-v1';
  state: 'unverified_snapshot_comparison';
  sourceUrl: string;
  verifiedHostnameScope: string;
  priorFetchedAt: string;
  currentFetchedAt: string;
  priorSnapshotSha256: string;
  currentSnapshotSha256: string;
  counts: {
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
  };
  changes: WebsiteSnapshotChange[];
  issues: WebsiteSnapshotIssue[];
  sourceAuthenticityVerified: false;
  renderedVisibilityVerified: false;
  liveWebsiteChangeConfirmed: false;
  approvalStatus: 'unreviewed';
  canStore: false;
  canScheduleCrawl: false;
  canApprove: false;
  canPublish: false;
};
export type WebsiteSnapshotDeltaResult =
  | { ok: true; report: WebsiteSnapshotDeltaReport }
  | { ok: false; error: string };

const SHA=/^[a-f0-9]{64}$/;
const MAX_BLOCKS=180;
const MAX_CHANGES=360;
const kinds=new Set(['paragraph','list_item','table_row','faq_question','faq_answer']);
const sha=(v:string)=>createHash('sha256').update(v,'utf8').digest('hex');

function validScope(url:string,host:string):boolean {
  if(typeof url!=='string'||url.length>2048||typeof host!=='string'||
    host.length>253||! /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(host)||
    host.includes('..'))return false;
  try {
    const parsed=new URL(url);
    return parsed.protocol==='https:'&&parsed.hostname===host.toLowerCase()&&
      !parsed.username&&!parsed.password&&!parsed.port&&
      !isIP(parsed.hostname)&&!parsed.search&&!parsed.hash&&
      !parsed.hostname.includes('..');
  }catch{return false;}
}

function validEvidence(e:PreparedWebsiteEvidence,host:string):boolean {
  if(!e||e.sourceType!=='website'||!validScope(e.sourceUrl,host)||
    !SHA.test(e.snapshotSha256)||!Array.isArray(e.blocks)||
    e.blocks.length>MAX_BLOCKS||e.hasContent!==(e.blocks.length>0)||
    typeof e.pageTitle!=='string'||e.pageTitle.length>300||
    typeof e.fetchedAt!=='string'||!Number.isFinite(Date.parse(e.fetchedAt))||
    !Number.isSafeInteger(e.skippedBoilerplateBlocks)||
    !Number.isSafeInteger(e.skippedRepeatedBlocks)||
    e.skippedBoilerplateBlocks<0||e.skippedRepeatedBlocks<0)return false;

  let previous=-1;
  const ids=new Set<string>();
  let total=0;
  for(const b of e.blocks){
    if(!b||typeof b!=='object'||!SHA.test(b.id)||
      !SHA.test(b.quoteSha256)||ids.has(b.id)||
      !kinds.has(b.blockKind)||b.reviewStatus!=='unreviewed'||
      typeof b.quote!=='string'||!b.quote.trim()||
      b.quote.length>6000||
      sha(b.quote)!==b.quoteSha256||
      !Number.isSafeInteger(b.sourceBlockIndex)||
      b.sourceBlockIndex<0||b.sourceBlockIndex>250||
      b.sourceBlockIndex<=previous||
      sha(JSON.stringify([e.snapshotSha256,b.sourceBlockIndex,b.blockKind,b.quote]))!==b.id||
      !Array.isArray(b.headingPath)||b.headingPath.length>6||
      b.headingPath.some(h=>typeof h!=='string'||!h.trim()||h.length>300))return false;
    total+=b.quote.length;
    if(total>100000)return false;
    previous=b.sourceBlockIndex;
    ids.add(b.id);
  }
  return true;
}

function source(e:PreparedWebsiteEvidence,b:SourceEvidenceBlock):WebsiteSnapshotDeltaSource {
  return {
    sourceUrl:e.sourceUrl,fetchedAt:e.fetchedAt,
    snapshotSha256:e.snapshotSha256,blockId:b.id,
    sourceBlockIndex:b.sourceBlockIndex,blockKind:b.blockKind,
    headingPath:[...b.headingPath],exactQuote:b.quote,
    quoteSha256:b.quoteSha256,
  };
}
function key(b:SourceEvidenceBlock):string {
  return JSON.stringify([b.headingPath,b.blockKind]);
}

function change(
  kind:WebsiteSnapshotChangeKind,
  prior:WebsiteSnapshotDeltaSource|null,
  current:WebsiteSnapshotDeltaSource|null,
):WebsiteSnapshotChange {
  return {
    id:sha(JSON.stringify([kind,prior?.snapshotSha256,prior?.blockId,
      current?.snapshotSha256,current?.blockId])),
    kind,prior,current,reviewStatus:'unreviewed',
    requiresHumanReview:true,canApprove:false,canPublish:false,
  };
}

/**
 * Exact same quote in matching heading/kind is unchanged regardless of
 * unrelated block re-ordering. Only ONE unmatched prior and ONE unmatched
 * current quote within a group may be called "modified". Ambiguous 1:N or
 * N:M alignment stays explicit additions/removals; it is never guessed.
 */
export function compareWebsiteEvidenceSnapshots(
  prior:PreparedWebsiteEvidence,
  current:PreparedWebsiteEvidence,
  verifiedHostname:string,
):WebsiteSnapshotDeltaResult {
  if(!validEvidence(prior,verifiedHostname)||
    !validEvidence(current,verifiedHostname)){
    return {ok:false,error:'invalid_snapshot_provenance'};
  }
  if(prior.sourceUrl!==current.sourceUrl){
    return {ok:false,error:'different_page_scope'};
  }
  if(Date.parse(current.fetchedAt)<=Date.parse(prior.fetchedAt)){
    return {ok:false,error:'nonmonotonic_snapshot_time'};
  }

  const groups=new Map<string,{
    old:SourceEvidenceBlock[];
    next:SourceEvidenceBlock[];
  }>();
  for(const b of prior.blocks){
    const k=key(b);
    if(!groups.has(k))groups.set(k,{old:[],next:[]});
    groups.get(k)!.old.push(b);
  }
  for(const b of current.blocks){
    const k=key(b);
    if(!groups.has(k))groups.set(k,{old:[],next:[]});
    groups.get(k)!.next.push(b);
  }

  const changes:WebsiteSnapshotChange[]=[];
  const issues:WebsiteSnapshotIssue[]=[
    'stylesheet_and_runtime_visibility_not_verified',
    'source_authenticity_not_reverified',
  ];
  if(prior.pageTitle!==current.pageTitle)issues.push('page_title_changed');
  let unchanged=0;
  let ambiguous=false;
  for(const {old,next} of groups.values()){
    const used=new Set<number>();
    const oldUnmatched:SourceEvidenceBlock[]=[];
    for(const o of old){
      const i=next.findIndex((n,index)=>!used.has(index)&&
        n.quoteSha256===o.quoteSha256&&n.quote===o.quote);
      if(i<0)oldUnmatched.push(o);
      else {used.add(i);unchanged++;}
    }
    const nextUnmatched=next.filter((_,i)=>!used.has(i));
    if(oldUnmatched.length===1&&nextUnmatched.length===1){
      changes.push(change('modified',
        source(prior,oldUnmatched[0]),source(current,nextUnmatched[0])));
    }else{
      if(oldUnmatched.length>0&&nextUnmatched.length>0)ambiguous=true;
      for(const o of oldUnmatched)changes.push(change('removed',source(prior,o),null));
      for(const n of nextUnmatched)changes.push(change('added',null,source(current,n)));
    }
    if(changes.length>MAX_CHANGES)return {ok:false,error:'delta_output_limit'};
  }
  if(ambiguous)issues.push('ambiguous_text_alignment');

  changes.sort((a,b)=>{
    const ix=(c:WebsiteSnapshotChange)=>c.current?.sourceBlockIndex??
      c.prior?.sourceBlockIndex??0;
    return ix(a)-ix(b)||a.id.localeCompare(b.id);
  });
  return {ok:true,report:{
    schemaVersion:'kb04a-v1',
    state:'unverified_snapshot_comparison',
    sourceUrl:current.sourceUrl,
    verifiedHostnameScope:verifiedHostname,
    priorFetchedAt:prior.fetchedAt,
    currentFetchedAt:current.fetchedAt,
    priorSnapshotSha256:prior.snapshotSha256,
    currentSnapshotSha256:current.snapshotSha256,
    counts:{
      added:changes.filter(c=>c.kind==='added').length,
      removed:changes.filter(c=>c.kind==='removed').length,
      modified:changes.filter(c=>c.kind==='modified').length,
      unchanged,
    },
    changes,issues,
    sourceAuthenticityVerified:false,
    renderedVisibilityVerified:false,
    liveWebsiteChangeConfirmed:false,
    approvalStatus:'unreviewed',
    canStore:false,canScheduleCrawl:false,canApprove:false,canPublish:false,
  }};
}
