import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import type { PreparedWebsiteEvidence, SourceEvidenceBlock } from './website-evidence';

/**
 * KB-03A: source-grounded, deterministic candidate preparation.
 *
 * This is NOT an AI model or a semantic fact extractor. It copies exact source
 * quotes and pairs only explicitly adjacent FAQ question/answer blocks. It
 * does not fetch, store, approve, prompt a model, or publish anything.
 * The verified hostname is supplied separately by an already-authorized
 * caller; evidence source URLs cannot prove their own domain ownership.
 */

export type SourceDraftRisk =
  | 'pricing_or_amounts'
  | 'dates_and_schedule'
  | 'policy_or_eligibility'
  | 'sensitive_claim_review';

export type SourceDraftCitation = {
  sourceUrl: string;
  fetchedAt: string;
  snapshotSha256: string;
  blockId: string;
  sourceBlockIndex: number;
  quoteSha256: string;
  headingPath: string[];
  exactQuote: string;
};

type BaseDraft = {
  id: string;
  reviewStatus: 'unreviewed';
  provenanceStatus: 'source_quote_only';
  risks: SourceDraftRisk[];
  manualReviewRequired: true;
  canPublish: false;
};

export type SourceGroundedDraft =
  | (BaseDraft & {
      kind: 'source_statement';
      statement: string;
      citation: SourceDraftCitation;
    })
  | (BaseDraft & {
      kind: 'faq_pair';
      question: string;
      answer: string;
      questionCitation: SourceDraftCitation;
      answerCitation: SourceDraftCitation;
    });

export type SourceDraftIssue = {
  code:
    | 'unpaired_question'
    | 'orphan_answer'
    | 'faq_question_not_interrogative'
    | 'faq_answer_too_long'
    | 'source_quote_too_long';
  sourceBlockIndex: number;
  blockId: string;
};

export type SourceDraftBundle = {
  state: 'unreviewed_source_candidates';
  sourceUrl: string;
  snapshotSha256: string;
  drafts: SourceGroundedDraft[];
  issues: SourceDraftIssue[];
  canStore: false;
  canPublish: false;
  aiGenerated: false;
};

export type SourceDraftResult =
  | { ok: true; bundle: SourceDraftBundle }
  | { ok: false; error: string };

const HASH=/^[a-f0-9]{64}$/;
const MAX_BLOCKS=180;
const MAX_DRAFTS=120;
const MAX_ISSUES=180;
const MAX_SINGLE_QUOTE=1400;
const MAX_QUESTION=240;
const kinds=new Set(['paragraph','list_item','table_row','faq_question','faq_answer']);

const hash=(value: string) => createHash('sha256').update(value,'utf8').digest('hex');

function risksFor(...quotes: string[]): SourceDraftRisk[] {
  const value=quotes.join('\n');
  const result:SourceDraftRisk[]=[];
  if(/[$€£₹¥]|\b(?:USD|EUR|GBP|INR|fees?|prices?|discounts?|costs?|tuition)\b/i.test(value))
    result.push('pricing_or_amounts');
  if(/\b(?:20\d{2}|dates?|time|hours?|days?|weeks?|months?|calendar|batch|schedule|starts?|ends?)\b/i.test(value))
    result.push('dates_and_schedule');
  if(/\b(?:refund|cancell?ation|reschedul|polic(?:y|ies)|eligib|certificat|requirement|guarantee|terms?)\w*/i.test(value))
    result.push('policy_or_eligibility');
  if(/\b(?:medical|health|pregnan|doctor|diagnos|therap|treatment|legal|financial|safety)\w*/i.test(value))
    result.push('sensitive_claim_review');
  return result;
}

function validSource(url: string, verifiedHostname: string): boolean {
  if(typeof url!=='string'||url.length>2048||
    typeof verifiedHostname!=='string'||verifiedHostname.length>253||
    !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(verifiedHostname)||
    verifiedHostname.includes('..'))return false;
  try {
    const parsed=new URL(url);
    return parsed.protocol==='https:'&& !parsed.username && !parsed.password &&
      !parsed.port && parsed.hostname===verifiedHostname.toLowerCase() &&
      !isIP(parsed.hostname) && !parsed.hostname.includes('..') &&
      /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(parsed.hostname);
  } catch {return false;}
}

function validBlock(block: SourceEvidenceBlock, previousIndex:number, ids:Set<string>): boolean {
  if(!block|| typeof block!=='object'||!HASH.test(block.id??'')||
    !HASH.test(block.quoteSha256??'')||ids.has(block.id)||
    block.reviewStatus!=='unreviewed'||!kinds.has(block.blockKind)||
    typeof block.quote!=='string'||!block.quote.trim()||
    block.quote.length>6000|| hash(block.quote)!==block.quoteSha256 ||
    !Number.isSafeInteger(block.sourceBlockIndex)||block.sourceBlockIndex<0||
    block.sourceBlockIndex>250||block.sourceBlockIndex<=previousIndex||
    !Array.isArray(block.headingPath)||block.headingPath.length>6||
    block.headingPath.some(x=>typeof x!=='string'||!x.trim()||x.length>300))return false;
  return true;
}

function citation(evidence:PreparedWebsiteEvidence,block:SourceEvidenceBlock):SourceDraftCitation {
  return {
    sourceUrl:evidence.sourceUrl,
    fetchedAt:evidence.fetchedAt,
    snapshotSha256:evidence.snapshotSha256,
    blockId:block.id,
    sourceBlockIndex:block.sourceBlockIndex,
    quoteSha256:block.quoteSha256,
    headingPath:[...block.headingPath],
    exactQuote:block.quote,
  };
}

function sameHeadings(a:SourceEvidenceBlock,b:SourceEvidenceBlock):boolean {
  return a.headingPath.length===b.headingPath.length &&
    a.headingPath.every((x,i)=>x===b.headingPath[i]);
}

function issue(
  issues:SourceDraftIssue[],code:SourceDraftIssue['code'],block:SourceEvidenceBlock,
) {
  if(issues.length<MAX_ISSUES)issues.push({
    code, sourceBlockIndex:block.sourceBlockIndex,blockId:block.id,
  });
}

/** Never infer or paraphrase an answer; unanswered FAQ questions remain issues. */
export function prepareSourceGroundedDrafts(
  evidence:PreparedWebsiteEvidence,
  verifiedHostname:string,
):SourceDraftResult {
  if(!evidence||evidence.sourceType!=='website'||
    !validSource(evidence.sourceUrl,verifiedHostname)||
    !HASH.test(evidence.snapshotSha256??'')||
    typeof evidence.fetchedAt!=='string'|| !Number.isFinite(Date.parse(evidence.fetchedAt))||
    !Array.isArray(evidence.blocks)||evidence.blocks.length>MAX_BLOCKS||
    evidence.hasContent!==(evidence.blocks.length>0)) {
    return {ok:false,error:'invalid_source_evidence'};
  }
  const ids=new Set<string>();
  let last=-1;
  for(const block of evidence.blocks) {
    if(!validBlock(block,last,ids))return {ok:false,error:'invalid_source_block_provenance'};
    last=block.sourceBlockIndex;ids.add(block.id);
  }

  const drafts:SourceGroundedDraft[]=[];
  const issues:SourceDraftIssue[]=[];
  for(let i=0;i<evidence.blocks.length;i++){
    const block=evidence.blocks[i];
    if(block.blockKind==='faq_question') {
      const next=evidence.blocks[i+1];
      if(!block.quote.trim().endsWith('?') || block.quote.length>MAX_QUESTION){
        issue(issues,'faq_question_not_interrogative',block);
        continue;
      }
      // Must be the immediately next original source block, not merely a
      // nearby answer on another page, within a different section or row.
      if(!next||next.blockKind!=='faq_answer'||
        next.sourceBlockIndex!==block.sourceBlockIndex+1||!sameHeadings(block,next)){
        issue(issues,'unpaired_question',block);
        continue;
      }
      if(next.quote.length>MAX_SINGLE_QUOTE) {
        issue(issues,'faq_answer_too_long',next);
        i++; // matched but unusable; do not present an orphan answer
        continue;
      }
      const questionCitation=citation(evidence,block);
      const answerCitation=citation(evidence,next);
      drafts.push({
        id:hash(JSON.stringify([evidence.snapshotSha256,'faq_pair',block.id,next.id])),
        kind:'faq_pair',question:block.quote,answer:next.quote,
        questionCitation,answerCitation,
        risks:risksFor(block.quote,next.quote),
        reviewStatus:'unreviewed',provenanceStatus:'source_quote_only',
        manualReviewRequired:true,canPublish:false,
      });
      i++;
      continue;
    }
    if(block.blockKind==='faq_answer') {
      issue(issues,'orphan_answer',block);
      continue;
    }
    if(block.quote.length>MAX_SINGLE_QUOTE) {
      issue(issues,'source_quote_too_long',block);
      continue;
    }
    drafts.push({
      id:hash(JSON.stringify([evidence.snapshotSha256,'source_statement',block.id])),
      kind:'source_statement',statement:block.quote,
      citation:citation(evidence,block),
      risks:risksFor(block.quote),
      reviewStatus:'unreviewed',provenanceStatus:'source_quote_only',
      manualReviewRequired:true,canPublish:false,
    });
    if(drafts.length>MAX_DRAFTS)return {ok:false,error:'draft_candidate_limit'};
  }
  return {
    ok:true,bundle:{
      state:'unreviewed_source_candidates',
      sourceUrl:evidence.sourceUrl,snapshotSha256:evidence.snapshotSha256,
      drafts,issues,
      canStore:false,canPublish:false,aiGenerated:false,
    },
  };
}
