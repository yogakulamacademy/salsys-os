import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseEvidenceForReview,
  summarizeEvidenceReview,
  reviewChoicesForDisplay,
} from '../../lib/knowledge-extraction/evidence-review-plan.ts';

const sample=(status='unreviewed')=>({
  sourceType:'website',
  sourceUrl:'https://sample.example.com/services',
  pageTitle:'Sample Services',
  fetchedAt:'2026-11-06T00:00:00.000Z',
  snapshotSha256:'a'.repeat(64),
  blocks:[
    {id:'b'.repeat(64),quote:'Introduction workshop: $150.',quoteSha256:'c'.repeat(64),
      sourceBlockIndex:1,blockKind:'paragraph',headingPath:['Fees'],reviewStatus:status},
    {id:'d'.repeat(64),quote:'Advanced workshop: $420.',quoteSha256:'e'.repeat(64),
      sourceBlockIndex:2,blockKind:'paragraph',headingPath:['Fees'],reviewStatus:'unreviewed'},
  ],
  skippedBoilerplateBlocks:0,skippedRepeatedBlocks:0,hasContent:true,
});

test('review choices are local candidates/exclusions, never knowledge approval',()=>{
  const evidence=sample();
  let choices={};
  let summary=summarizeEvidenceReview(evidence,choices);
  assert.deepEqual(summary,{total:2,pending:2,candidate:0,excluded:0,publishable:false,canPersist:false});
  choices=chooseEvidenceForReview(evidence,choices,'b'.repeat(64),'candidate');
  choices=chooseEvidenceForReview(evidence,choices,'d'.repeat(64),'excluded');
  summary=summarizeEvidenceReview(evidence,choices);
  assert.deepEqual(summary,{total:2,pending:0,candidate:1,excluded:1,publishable:false,canPersist:false});
  assert.deepEqual(reviewChoicesForDisplay(evidence,choices).map(x=>x.choice),['candidate','excluded']);
  const reset=chooseEvidenceForReview(evidence,choices,'b'.repeat(64),null);
  assert.deepEqual(summarizeEvidenceReview(evidence,reset),{
    total:2,pending:1,candidate:0,excluded:1,publishable:false,canPersist:false});
  assert.equal(choices['b'.repeat(64)],'candidate','previous choices remain unchanged');
});

test('unknown evidence or invalid decisions cannot forge a source-backed review',()=>{
  const evidence=sample();
  const empty={};
  assert.equal(chooseEvidenceForReview(evidence,empty,'f'.repeat(64),'candidate'),empty);
  assert.equal(chooseEvidenceForReview(evidence,empty,'b'.repeat(64),'approved'),empty);
  assert.equal(chooseEvidenceForReview(evidence,empty,'b'.repeat(64),'publish'),empty);
  const forged={['f'.repeat(64)]:'candidate',['b'.repeat(64)]:'excluded'};
  const state=summarizeEvidenceReview(evidence,forged);
  assert.deepEqual(state,{total:2,pending:1,candidate:0,excluded:1,publishable:false,canPersist:false});
});

test('invalid and non-unreviewed source blocks are not eligible for selection',()=>{
  const evidence=sample('approved');
  evidence.blocks[1].quoteSha256='invalid';
  const summary=summarizeEvidenceReview(evidence,{});
  assert.equal(summary.total,0);
  assert.equal(summary.publishable,false);
  assert.equal(summary.canPersist,false);
  assert.deepEqual(reviewChoicesForDisplay(evidence,{}),[]);
});
