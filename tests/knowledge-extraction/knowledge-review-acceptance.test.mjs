import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {prepareWebsiteEvidence} from '../../lib/knowledge-extraction/website-evidence.ts';
import {prepareSourceGroundedDrafts} from '../../lib/knowledge-extraction/source-grounded-drafts.ts';
import {analyzeSourceReviewSignals} from '../../lib/knowledge-extraction/source-review-signals.ts';
import {buildAIDraftingRequest} from '../../lib/knowledge-extraction/ai-draft-contract.ts';

// Node22 strip-types cannot resolve extensionless TS imports. Copy the actual
// production modules into a disposable test directory with explicit .ts
// extension imports. Nothing in the production app is changed for tests.
const root=new URL('../../lib/knowledge-extraction/',import.meta.url);
const temp=await mkdtemp(join(root.pathname,'.kb03e-acceptance-test-'));
const filenames=[
  'ai-draft-contract.ts',
  'ai-grounding-evaluation.ts',
  'knowledge-review-acceptance.ts',
];
for(const name of filenames){
  let source=await readFile(new URL(name,root),'utf8');
  if(name==='ai-grounding-evaluation.ts'){
    source=source.replace("from './ai-draft-contract'",
      "from './ai-draft-contract.ts'");
  }
  if(name==='knowledge-review-acceptance.ts'){
    source=source.replace("from './ai-draft-contract'",
      "from './ai-draft-contract.ts'");
    source=source.replace("from './ai-grounding-evaluation'",
      "from './ai-grounding-evaluation.ts'");
  }
  await writeFile(join(temp,name),source,'utf8');
}
const {prepareSyntheticKnowledgeReviewAcceptance}=await import(
  pathToFileURL(join(temp,'knowledge-review-acceptance.ts')).href);
test.after(async()=>rm(temp,{recursive:true,force:true}));

const HOST='sample.example.com';
const AS_OF='2026-11-06T12:00:00Z';

function source(path,price,date='2026-11-06T10:00:00Z'){
  const p=prepareWebsiteEvidence({
    verifiedSeedUrl:'https://'+HOST+'/',
    sourceUrl:'https://'+HOST+'/'+path,
    pageTitle:'Synthetic workshop',
    fetchedAt:date,
    blocks:[
      {kind:'h1',text:'Workshops'},
      {kind:'h2',text:'Introduction workshop fees'},
      {kind:'paragraph',text:'Introduction workshop fee is '+price+'.'},
      {kind:'h2',text:'Questions'},
      {kind:'faq_question',text:'Can I reschedule?'},
      {kind:'faq_answer',text:'Rescheduling requests must be submitted before the event.'},
    ],
  });
  assert.equal(p.ok,true);
  const d=prepareSourceGroundedDrafts(p.evidence,HOST);
  assert.equal(d.ok,true);
  return d.bundle;
}

function build(){
  const current=source('workshops','$150');
  const archived=source('previous-workshops','$175','2026-09-01T10:00:00Z');
  const e=buildAIDraftingRequest([current],HOST);
  assert.equal(e.ok,true);
  const request=e.request;
  const priceSource=request.evidence.find(item=>
    item.exactAnswerQuote==='Introduction workshop fee is $150.');
  const faqSource=request.evidence.find(item=>
    item.originalQuestion==='Can I reschedule?');
  assert.ok(priceSource);
  assert.ok(faqSource);
  const response={
    schemaVersion:'kb03c-v1',requestId:request.requestId,
    proposals:[
      {
        kind:'faq',sourceDraftId:priceSource.sourceDraftId,
        question:'What is the introduction workshop fee?',
        answer:priceSource.exactAnswerQuote,
      },
      {
        kind:'faq',sourceDraftId:faqSource.sourceDraftId,
        question:'Can I reschedule?',
        answer:faqSource.exactAnswerQuote,
      },
    ],
  };
  const currentPrice=current.drafts.find(d=>
    d.kind==='source_statement'&&d.statement==='Introduction workshop fee is $150.');
  const olderPrice=archived.drafts.find(d=>
    d.kind==='source_statement'&&d.statement==='Introduction workshop fee is $175.');
  assert.ok(currentPrice&&olderPrice);
  const comparison=analyzeSourceReviewSignals(
    [current,archived],
    [
      {draftId:currentPrice.id,kind:'price',scopeKey:'program:introduction',fieldKey:'fee'},
      {draftId:olderPrice.id,kind:'price',scopeKey:'program:introduction',fieldKey:'fee'},
    ],
    {verifiedHostname:HOST,asOf:AS_OF,reviewAgeDays:30},
  );
  assert.equal(comparison.ok,true);
  assert.equal(comparison.report.signals.length,2);
  return {request,response,comparison:comparison.report,current,archived};
}

test('complete synthetic evidence -> FAQ -> conflict -> review packet does not approve anything',()=>{
  const {request,response,comparison}=build();
  const result=prepareSyntheticKnowledgeReviewAcceptance(
    request,response,{asOf:AS_OF,reviewAgeDays:30},comparison);
  assert.equal(result.ok,true);
  const packet=result.packet;
  assert.equal(packet.schemaVersion,'kb03e-v1');
  assert.equal(packet.state,'synthetic_read_only_review');
  assert.equal(packet.requestId,request.requestId);
  assert.equal(packet.verifiedHostnameScope,HOST);
  assert.match(packet.packetId,/^[a-f0-9]{64}$/);
  assert.deepEqual(packet.counts,{
    proposals:2,held:1,needsHumanReview:2,
  });
  assert.equal(packet.rows[0].exactSourceAnswer,'Introduction workshop fee is $150.');
  assert.equal(packet.rows[0].suggestedQuestion,'What is the introduction workshop fee?');
  assert.equal(packet.rows[0].reviewOutcome,'hold_for_resolution');
  assert.ok(packet.rows[0].warningReasons.includes('unresolved_source_difference'));
  assert.equal(packet.rows[0].sourceUrl,'https://sample.example.com/workshops');
  assert.equal(packet.rows[0].answerQuoteSha256,
    request.evidence[0].answerCitation.quoteSha256);
  assert.equal(packet.rows[1].reviewOutcome,'manual_review_required');
  assert.equal(packet.rows[1].originalQuestion,'Can I reschedule?');
  assert.ok(packet.rows.every(x=>
    x.reviewerDecision==='not_recorded'&&
    x.reviewStatus==='unreviewed'&&
    x.canApprove===false&&x.canPublish===false&&
    x.sourceTruthVerified===false&&x.semanticsVerified===false));
  assert.deepEqual(Object.values(packet.requiredGates),Array(7).fill(false));
  assert.deepEqual([
    packet.aiProviderWasCalled,packet.dataWasStored,packet.canStore,
    packet.canApprove,packet.canPublish,packet.handoff.allowedToInvoke,
  ],Array(6).fill(false));
  assert.equal(packet.handoff.integrationStatus,'not_connected');
});

test('missing independent conflict comparison is a hold, never an implicit green light',()=>{
  const {request,response}=build();
  const result=prepareSyntheticKnowledgeReviewAcceptance(
    request,response,{asOf:AS_OF,reviewAgeDays:30});
  assert.equal(result.ok,true);
  assert.equal(result.packet.counts.held,2);
  assert.ok(result.packet.rows.every(x=>
    x.warningReasons.includes('source_difference_review_not_supplied')));
});

test('altered source answer, invented price, approval claims and duplicate proposals are rejected',()=>{
  const {request,response,comparison}=build();
  const changes=[
    draft=>{draft.proposals[0].answer='Introduction workshop fee is $999.';},
    draft=>{draft.proposals[0].approved=true;},
    draft=>{draft.proposals[0].question='Is the workshop $500?';},
    draft=>{draft.proposals[0].sourceDraftId='0'.repeat(64);},
    draft=>{draft.proposals.push(draft.proposals[0]);},
    draft=>{draft.publish=true;},
  ];
  for(const change of changes){
    const invalid=structuredClone(response);change(invalid);
    assert.deepEqual(prepareSyntheticKnowledgeReviewAcceptance(
      request,invalid,{asOf:AS_OF,reviewAgeDays:30},comparison),
      {ok:false,error:'untrusted_ai_response_rejected'});
  }
});

test('tampered request provenance, forged review signals and invalid evaluation settings fail',()=>{
  const {request,response,comparison}=build();
  const modified=structuredClone(request);
  modified.evidence[0].answerCitation.exactQuote='Different price';
  assert.deepEqual(prepareSyntheticKnowledgeReviewAcceptance(
    modified,response,{asOf:AS_OF,reviewAgeDays:30},comparison),
    {ok:false,error:'untrusted_ai_response_rejected'});
  const forged=structuredClone(comparison);
  forged.canPublish=true;
  assert.deepEqual(prepareSyntheticKnowledgeReviewAcceptance(
    request,response,{asOf:AS_OF,reviewAgeDays:30},forged),
    {ok:false,error:'grounding_evaluation_rejected'});
  assert.deepEqual(prepareSyntheticKnowledgeReviewAcceptance(
    request,response,{asOf:'not-a-date'},comparison),
    {ok:false,error:'grounding_evaluation_rejected'});
});

test('simulated packet identity is deterministic and changes with assessment time',()=>{
  const {request,response,comparison}=build();
  const a=prepareSyntheticKnowledgeReviewAcceptance(
    request,response,{asOf:AS_OF,reviewAgeDays:30},comparison);
  const b=prepareSyntheticKnowledgeReviewAcceptance(
    request,response,{asOf:AS_OF,reviewAgeDays:30},comparison);
  assert.deepEqual(a,b);
  assert.equal(a.ok,true);
  const next=prepareSyntheticKnowledgeReviewAcceptance(
    request,response,{asOf:'2026-11-07T12:00:00Z',reviewAgeDays:30},comparison);
  assert.equal(next.ok,true);
  assert.notEqual(a.packet.packetId,next.packet.packetId);
});

test('no proposals yields an empty, nonpublishable packet',()=>{
  const {request,comparison}=build();
  const result=prepareSyntheticKnowledgeReviewAcceptance(
    request,{schemaVersion:'kb03c-v1',requestId:request.requestId,proposals:[]},
    {asOf:AS_OF,reviewAgeDays:30},comparison);
  assert.equal(result.ok,true);
  assert.deepEqual(result.packet.rows,[]);
  assert.deepEqual(result.packet.counts,{proposals:0,held:0,needsHumanReview:0});
  assert.equal(result.packet.canPublish,false);
  assert.equal(result.packet.handoff.allowedToInvoke,false);
});
