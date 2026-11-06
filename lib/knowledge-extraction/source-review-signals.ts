import { createHash } from 'node:crypto';
import type {
  SourceDraftBundle, SourceGroundedDraft, SourceDraftCitation,
} from './source-grounded-drafts';

/**
 * KB-03B: conservative conflict / freshness REVIEW SIGNALS.
 *
 * This module never decides which source is true and never infers that two
 * differently scoped offers, currencies, dates, or policies contradict.
 *
 * Comparison keys are supplied by a separate, manually reviewed mapping:
 * the same program, location, offer, batch and field MUST be explicitly
 * bound before values are compared. These mappings are not learned from
 * arbitrary page text.
 *
 * No I/O, AI calls, storage, approvals, or publishing.
 */

export type ComparisonKind = 'price' | 'date' | 'policy';
export type ComparisonBinding = {
  draftId: string;
  scopeKey: string;
  fieldKey: string;
  kind: ComparisonKind;
};

export type ReviewSignalKind =
  | 'price_difference_review'
  | 'date_difference_review'
  | 'policy_text_variation_review'
  | 'source_age_review';

export type ReviewSignalSource = {
  draftId: string | null;
  sourceUrl: string;
  fetchedAt: string;
  snapshotSha256: string;
  blockId: string | null;
  sourceBlockIndex: number | null;
  exactQuote: string | null;
  quoteSha256: string | null;
};

export type ReviewSignal = {
  id: string;
  kind: ReviewSignalKind;
  scopeKey: string | null;
  fieldKey: string | null;
  comparisonCurrency: 'USD' | 'EUR' | 'GBP' | 'INR' | null;
  message: string;
  sources: ReviewSignalSource[];
  reviewStatus: 'unreviewed';
  manualReviewRequired: true;
  canPublish: false;
};

export type ReviewComparisonIssue = {
  code: 'unsupported_or_ambiguous_value' | 'different_currencies_not_compared';
  draftId: string | null;
  scopeKey: string;
  fieldKey: string;
};

export type ReviewSignalReport = {
  state: 'needs_human_review';
  signals: ReviewSignal[];
  issues: ReviewComparisonIssue[];
  canPublish: false;
  canStore: false;
  sourceTruthDetermined: false;
};

export type ReviewSignalResult =
  | { ok: true; report: ReviewSignalReport }
  | { ok: false; error: string };

export type ReviewSignalOptions = {
  verifiedHostname: string;
  asOf: string;
  /** Explicit review threshold, NOT a storage/retention duration. */
  reviewAgeDays?: number;
};

const HASH = /^[0-9a-f]{64}$/;
const KEY = /^[a-z0-9][a-z0-9:._/-]{1,99}$/;
const MAX_BUNDLES = 30;
const MAX_BINDINGS = 180;
const MAX_SIGNAL_SOURCES = 16;
const MAX_OUTPUT = 150;
const hash = (v:string) => createHash('sha256').update(v,'utf8').digest('hex');

function validSource(url:string,host:string):boolean {
  if(typeof url!=='string'||url.length>2048||typeof host!=='string'||
     host.length>253||!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(host)||
     host.includes('..'))return false;
  try {
    const parsed=new URL(url);
    return parsed.protocol==='https:'&&parsed.username===''&&parsed.password===''&&
      parsed.port===''&&parsed.hostname===host.toLowerCase()&&
      !parsed.hostname.includes('..');
  } catch {return false;}
}

function validDate(value:string):boolean {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const date=new Date(value+'T00:00:00.000Z');
  return Number.isFinite(date.getTime())&&date.toISOString().startsWith(value+'T');
}

function citeMatches(c:SourceDraftCitation,b:SourceDraftBundle):boolean {
  // The bundle has no timestamp of its own: every citation must carry
  // an independently parseable timestamp. URL, snapshot and quote hashes
  // must match the immutable source candidate contract.
  return !!c && c.sourceUrl===b.sourceUrl&&
    typeof c.fetchedAt==='string'&&
    Number.isFinite(Date.parse(c.fetchedAt))&&
    c.snapshotSha256===b.snapshotSha256&&HASH.test(c.blockId)&&
    HASH.test(c.quoteSha256)&&
    Number.isSafeInteger(c.sourceBlockIndex)&&c.sourceBlockIndex>=0&&
    typeof c.exactQuote==='string'&&
    c.exactQuote.length>0&&c.exactQuote.length<=1400&&
    hash(c.exactQuote)===c.quoteSha256&&
    Array.isArray(c.headingPath)&&c.headingPath.length<=6&&
    c.headingPath.every(x=>typeof x==='string'&&x.length<=300)&&
    Number.isFinite(Date.parse(c.fetchedAt));
}

function validDraft(d:SourceGroundedDraft,b:SourceDraftBundle):boolean {
  if(!d||!HASH.test(d.id)||d.reviewStatus!=='unreviewed'||
    d.provenanceStatus!=='source_quote_only'||
    d.manualReviewRequired!==true||d.canPublish!==false)return false;
  if(d.kind==='source_statement') {
    return citeMatches(d.citation,b)&&d.citation.exactQuote===d.statement&&
      hash(JSON.stringify([b.snapshotSha256,'source_statement',d.citation.blockId]))===d.id;
  }
  if(d.kind==='faq_pair') {
    return citeMatches(d.questionCitation,b)&&citeMatches(d.answerCitation,b)&&
      d.question===d.questionCitation.exactQuote&&
      d.answer===d.answerCitation.exactQuote&&
      d.answerCitation.sourceBlockIndex===d.questionCitation.sourceBlockIndex+1&&
      hash(JSON.stringify([b.snapshotSha256,'faq_pair',
        d.questionCitation.blockId,d.answerCitation.blockId]))===d.id;
  }
  return false;
}

function reviewCitation(d:SourceGroundedDraft):SourceDraftCitation {
  return d.kind==='faq_pair' ? d.answerCitation : d.citation;
}

function comparisonText(d:SourceGroundedDraft):string {
  return d.kind==='faq_pair' ? d.answer : d.statement;
}

const currencyMap:Record<string, 'USD'|'EUR'|'GBP'|'INR'> = {
  '$':'USD','US$':'USD','USD':'USD','€':'EUR','EUR':'EUR',
  '£':'GBP','GBP':'GBP','₹':'INR','INR':'INR',
};

function extractPrice(text:string):{currency:'USD'|'EUR'|'GBP'|'INR';value:string}|null {
  const re=/(US\$|USD|EUR|GBP|INR|\$|€|£|₹)\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/gi;
  const values=[...text.matchAll(re)];
  if(values.length!==1)return null;
  const currency=currencyMap[values[0][1].toUpperCase()]??currencyMap[values[0][1]];
  if(!currency)return null;
  const amount=values[0][2].replaceAll(',','');
  const [whole,decimal=''] = amount.split('.');
  if(whole.length>11)return null;
  // No floating-point conversion; compare exact minor-unit representations.
  const value=(BigInt(whole)*BigInt(100)+BigInt((decimal+'00').slice(0,2))).toString();
  return {currency,value};
}

function extractIsoDate(text:string):string|null {
  const matches=[...text.matchAll(/\b(?:19|20|21)\d{2}-\d{2}-\d{2}\b/g)].map(x=>x[0]);
  return matches.length===1&&validDate(matches[0]) ? matches[0] : null;
}

function signalSource(d:SourceGroundedDraft):ReviewSignalSource {
  const c=reviewCitation(d);
  return {
    draftId:d.id,sourceUrl:c.sourceUrl,fetchedAt:c.fetchedAt,
    snapshotSha256:c.snapshotSha256,blockId:c.blockId,
    sourceBlockIndex:c.sourceBlockIndex,exactQuote:c.exactQuote,
    quoteSha256:c.quoteSha256,
  };
}

type Comparable = {
  binding:ComparisonBinding;
  draft:SourceGroundedDraft;
  value:string;
  currency:'USD'|'EUR'|'GBP'|'INR'|null;
};

function buildSignal(
  kind:ReviewSignalKind,scopeKey:string|null,fieldKey:string|null,
  sources:ReviewSignalSource[],currency:ReviewSignal['comparisonCurrency'],
  message:string,
):ReviewSignal {
  const sorted=[...sources].sort((a,b)=>
    (a.sourceUrl+a.snapshotSha256+(a.blockId??'')).localeCompare(
      b.sourceUrl+b.snapshotSha256+(b.blockId??'')));
  return {
    id:hash(JSON.stringify([kind,scopeKey,fieldKey,currency,
      sorted.map(x=>[x.snapshotSha256,x.blockId])])),
    kind,scopeKey,fieldKey,comparisonCurrency:currency,
    message,sources:sorted,reviewStatus:'unreviewed',
    manualReviewRequired:true,canPublish:false,
  };
}

export function analyzeSourceReviewSignals(
  bundles:SourceDraftBundle[],
  bindings:ComparisonBinding[],
  options:ReviewSignalOptions,
):ReviewSignalResult {
  if(!Array.isArray(bundles)||!Array.isArray(bindings)||
    bundles.length>MAX_BUNDLES||bindings.length>MAX_BINDINGS||
    !options||typeof options.asOf!=='string'||
    !Number.isFinite(Date.parse(options.asOf))||
    typeof options.verifiedHostname!=='string'||
    (options.reviewAgeDays!==undefined&&
      (!Number.isSafeInteger(options.reviewAgeDays)||options.reviewAgeDays<1||
       options.reviewAgeDays>3650)))return {ok:false,error:'invalid_comparison_configuration'};

  const now=Date.parse(options.asOf);
  const drafts=new Map<string,SourceGroundedDraft>();
  const sources=new Map<string,SourceDraftBundle>();
  const observations=new Map<string,Set<string>>();

  for(const bundle of bundles) {
    if(!bundle||bundle.state!=='unreviewed_source_candidates'||
      bundle.canStore!==false||bundle.canPublish!==false||
      bundle.aiGenerated!==false||!HASH.test(bundle.snapshotSha256)||
      !validSource(bundle.sourceUrl,options.verifiedHostname)||
      !Array.isArray(bundle.drafts)||bundle.drafts.length>120||
      !Array.isArray(bundle.issues))return {ok:false,error:'invalid_source_bundle'};

    let bundleFetchedAt:string|null=null;
    for(const draft of bundle.drafts) {
      if(!validDraft(draft,bundle))return {ok:false,error:'invalid_source_draft'};
      const citation=reviewCitation(draft);
      if(bundleFetchedAt!==null && bundleFetchedAt!==citation.fetchedAt){
        return {ok:false,error:'inconsistent_source_timestamp'};
      }
      if(draft.kind==='faq_pair'&&
        draft.questionCitation.fetchedAt!==draft.answerCitation.fetchedAt){
        return {ok:false,error:'inconsistent_source_timestamp'};
      }
      bundleFetchedAt=citation.fetchedAt;
      if(Date.parse(citation.fetchedAt)>now+5*60_000){
        return {ok:false,error:'source_timestamp_in_future'};
      }
      // One identity must not resolve to two different records.
      const seen=drafts.get(draft.id);
      if(seen && JSON.stringify(seen)!==JSON.stringify(draft)){
        return {ok:false,error:'duplicate_draft_identity'};
      }
      drafts.set(draft.id,draft);
      sources.set(draft.id,bundle);
    }
  }

  const comparable:Comparable[]=[];
  const issues:ReviewComparisonIssue[]=[];
  const bound=new Set<string>();
  for(const binding of bindings) {
    if(!binding||!HASH.test(binding.draftId)||
      typeof binding.scopeKey!=='string'||!KEY.test(binding.scopeKey)||
      typeof binding.fieldKey!=='string'||!KEY.test(binding.fieldKey)||
      !['price','date','policy'].includes(binding.kind)) {
      return {ok:false,error:'invalid_comparison_binding'};
    }
    const bindingId=JSON.stringify([binding.draftId,binding.scopeKey,
      binding.fieldKey,binding.kind]);
    if(bound.has(bindingId))return {ok:false,error:'duplicate_comparison_binding'};
    bound.add(bindingId);
    const draft=drafts.get(binding.draftId);
    if(!draft)return {ok:false,error:'binding_missing_provenance'};
    const quote=comparisonText(draft);
    let value:string|null=null;
    let currency:Comparable['currency']=null;
    if(binding.kind==='price') {
      const price=extractPrice(quote);
      if(price){value=price.value;currency=price.currency;}
    } else if(binding.kind==='date'){
      value=extractIsoDate(quote);
    } else {
      // Policy text variations are review hints, never contradictions.
      value=quote.replace(/\s+/gu,' ').trim().toLocaleLowerCase('en-US');
    }
    if(!value) {
      issues.push({code:'unsupported_or_ambiguous_value',
        draftId:draft.id,scopeKey:binding.scopeKey,fieldKey:binding.fieldKey});
      continue;
    }
    comparable.push({binding,draft,value,currency});
  }

  const grouped=new Map<string,Comparable[]>();
  for(const item of comparable){
    const key=JSON.stringify([item.binding.kind,item.binding.scopeKey,item.binding.fieldKey]);
    grouped.set(key,[...(grouped.get(key)??[]),item]);
  }

  const signals:ReviewSignal[]=[];
  for(const group of grouped.values()) {
    if(group.length<2)continue;
    if(group.length>MAX_SIGNAL_SOURCES){
      return {ok:false,error:'comparison_group_over_limit'};
    }
    const {kind,scopeKey,fieldKey}=group[0].binding;
    if(kind==='price'){
      const byCurrency=new Map<string,Comparable[]>();
      for(const entry of group){
        const c=entry.currency!;
        byCurrency.set(c,[...(byCurrency.get(c)??[]),entry]);
      }
      if(byCurrency.size>1)issues.push({
        code:'different_currencies_not_compared',
        draftId:null,scopeKey,fieldKey,
      });
      for(const [currency,items] of byCurrency){
        if(items.length<2||new Set(items.map(x=>x.value)).size<2)continue;
        signals.push(buildSignal('price_difference_review',scopeKey,fieldKey,
          items.map(x=>signalSource(x.draft)),
          currency as ReviewSignal['comparisonCurrency'],
          'Different monetary amounts appear for the same explicitly matched scope and currency. Verify room, location, offer, and effective dates.'));
      }
    } else if(new Set(group.map(x=>x.value)).size>1){
      signals.push(buildSignal(
        kind==='date'?'date_difference_review':'policy_text_variation_review',
        scopeKey,fieldKey,
        group.map(x=>signalSource(x.draft)),
        null,
        kind==='date'
          ? 'Different ISO dates appear for the same explicitly matched scope. Verify the effective schedule.'
          : 'The wording of the same explicitly matched policy field differs. Human review must determine whether this is a real policy change.',
      ));
    }
    if(signals.length>MAX_OUTPUT)return {ok:false,error:'review_signal_limit'};
  }

  // Date age is deliberately a user-supplied review threshold, not a
  // retention/deletion policy. Without a threshold, emit no freshness claim.
  if(options.reviewAgeDays!==undefined){
    for(const [draftId,draft] of drafts){
      const cite=reviewCitation(draft);
      const age=now-Date.parse(cite.fetchedAt);
      if(age<0){
        return {ok:false,error:'source_timestamp_in_future'};
      }
      if(age>=options.reviewAgeDays*86400000){
        const bundle=sources.get(draftId)!;
        const key=bundle.sourceUrl+'|'+bundle.snapshotSha256;
        if(!observations.has(key))observations.set(key,new Set());
        observations.get(key)!.add(draftId);
      }
    }
    for(const ids of observations.values()){
      const firstId=[...ids][0],bundle=sources.get(firstId)!;
      const citations=[...ids].slice(0,MAX_SIGNAL_SOURCES)
        .map(id=>signalSource(drafts.get(id)!));
      signals.push(buildSignal('source_age_review',null,null,citations,null,
        'This source snapshot exceeds the explicitly configured review-age threshold. Recheck its current accuracy; this is not a deletion decision.'));
    }
  }
  if(signals.length>MAX_OUTPUT)return {ok:false,error:'review_signal_limit'};

  return {ok:true,report:{
    state:'needs_human_review',
    signals,issues,
    canPublish:false,canStore:false,sourceTruthDetermined:false,
  }};
}
