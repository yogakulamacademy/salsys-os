import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clusterQuestions, hasPlaceholders, isLeadQuestion, knowledgeTopicOf, parseProposal,
  proposalDedupeKey, proposalSystemPrompt, proposalUserPrompt,
} from '../../lib/knowledge-proposals.ts';

const msg = (id, leadId, body) => ({ id, leadId, conversationId: 'c' + leadId, body, createdAt: '2026-11-10T10:00:00Z' });

test('real lead questions are recognised; statements and shared posts are not', () => {
  for (const q of ['Is there a payment plan?', 'Can i get the curriculum as what is covered in these 5days', 'Sound healing course ka kya plan hai and fee', 'what are the dates for december']) {
    assert.equal(isLeadQuestion(q), true, q);
  }
  for (const s of ['Will let you know', 'Not now', 'Shared an Instagram post\nWhat if just 24 days could transform your practice?', 'ok']) {
    assert.equal(isLeadQuestion(s), false, s);
  }
});

test('questions map to the most specific topic', () => {
  assert.equal(knowledgeTopicOf('Is there a payment plan?'), 'payment_plan');
  assert.equal(knowledgeTopicOf('I would like to explore the installment plan further.'), 'payment_plan');
  assert.equal(knowledgeTopicOf('How much is the fee for 200 hour?'), 'fees');
  assert.equal(knowledgeTopicOf('Is there any course during April month?'), null);
  assert.equal(knowledgeTopicOf('when is the next batch'), 'dates');
  assert.equal(knowledgeTopicOf('Do you provide accommodation and food?'), 'accommodation');
  assert.equal(knowledgeTopicOf('Can i get the curriculum'), 'curriculum');
  assert.equal(knowledgeTopicOf('Is it Yoga Alliance certified?'), 'certification');
});

test('clusters need 3 different leads and keep distinct wordings as evidence', () => {
  const messages = [
    msg('1', 'a', 'Is there a payment plan?'),
    msg('2', 'b', 'Is there a payment plan?'),
    msg('3', 'c', 'Is there a payment plan available?'),
    msg('4', 'c', 'Can I pay in installments?'),
    msg('5', 'd', 'Do you provide accommodation?'),
    msg('6', 'e', 'Do you provide accommodation?'),
  ];
  const clusters = clusterQuestions(messages);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].topic, 'payment_plan');
  assert.equal(clusters[0].leads, 3);
  assert.equal(clusters[0].messages, 4);
  assert.deepEqual(clusters[0].samples.map((s) => s.quote), ['Is there a payment plan?', 'Is there a payment plan available?', 'Can I pay in installments?']);
});

test('gaps block approval and dedupe is per topic per month', () => {
  assert.equal(hasPlaceholders('We offer a plan: [ADD: split and deadlines].'), true);
  assert.equal(hasPlaceholders('We offer a 2-part plan.'), false);
  assert.equal(proposalDedupeKey('payment_plan', new Date('2026-11-17T00:00:00Z')), 'questions:payment_plan:2026-11');
});

test('prompt forbids invented facts and carries evidence', () => {
  const sys = proposalSystemPrompt();
  assert.match(sys, /Never invent facts/);
  assert.match(sys, /\[ADD: /);
  const cluster = clusterQuestions([msg('1', 'a', 'Is there a payment plan?'), msg('2', 'b', 'Is there a payment plan?'), msg('3', 'c', 'Any installment option?')])[0];
  const user = proposalUserPrompt({ cluster, docs: [], teamReplies: [] });
  assert.match(user, /3 different leads/);
  assert.match(user, /"Is there a payment plan\?"/);
  assert.match(user, /\(none captured\)/);
});

test('Claude answers are validated before anything is stored', () => {
  const allowed = new Set(['11111111-1111-1111-1111-111111111111']);
  const base = { target_document_id: '', title: 'Payment plan', category: 'faq', content: 'Payment plan: [ADD: split].', why: '13 leads asked; nothing in knowledge.', expected_effect: 'Drafts can answer.', risk: '' };
  assert.deepEqual(parseProposal({ ...base, action: 'none' }, allowed, 'payment_plan'), { action: 'none' });
  const add = parseProposal({ ...base, action: 'add' }, allowed, 'payment_plan');
  assert.equal(add.action, 'add');
  assert.equal(add.targetDocumentId, null);
  assert.match(add.risk, /Money-related/);
  assert.equal(parseProposal({ ...base, action: 'update', target_document_id: 'not-allowed' }, allowed, 'fees'), null);
  assert.equal(parseProposal({ ...base, action: 'update', target_document_id: [...allowed][0] }, allowed, 'dates').targetDocumentId, [...allowed][0]);
  assert.equal(parseProposal({ ...base, action: 'add', content: 'short' }, allowed, 'dates'), null);
  assert.equal(parseProposal({ ...base, action: 'add', category: 'weird' }, allowed, 'dates').category, 'faq');
  assert.equal(parseProposal('garbage', allowed, 'dates'), null);
});
