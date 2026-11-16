import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  isWhatsAppBusinessAiReport,
  parseWhatsAppBusinessAiReport,
  readZipTextEntries,
} from '../../lib/chat-export-import.ts';
import { analyzeConversations } from '../../lib/conversation-learning.ts';

const zip = readFileSync(new URL('../fixtures/whatsapp-ai-report-sample.zip', import.meta.url));

test('zip reader extracts text entries from a deflated export', () => {
  const files = readZipTextEntries(zip);
  assert.equal(files.length, 26);
  assert.ok(files.some((f) => f.name === 'settings.txt'));
  assert.equal(isWhatsAppBusinessAiReport(files), true);
  assert.throws(() => readZipTextEntries(Buffer.from('not a zip')), /Not a zip/);
});

test('parser keeps both sides, drops quoted Context lines, skips test chats and detects payment', () => {
  const parsed = parseWhatsAppBusinessAiReport(readZipTextEntries(zip));
  assert.equal(parsed.conversations, 24);
  assert.equal(parsed.skippedTestConversations, 1);
  assert.equal([...parsed.outcomes.values()].filter((v) => v === 'won').length, 4);
  assert.ok(parsed.messages.some((m) => m.direction === 'outbound'));
  assert.equal(parsed.messages.some((m) => m.body?.startsWith('Next batch') && m.direction === 'inbound'), false);
  assert.equal(parsed.faqs.length, 2);
  assert.equal(parsed.faqs[0].question, 'Do you offer online courses?');
});

test('exports without timestamps never produce a timing insight', () => {
  const parsed = parseWhatsAppBusinessAiReport(readZipTextEntries(zip));
  const result = analyzeConversations(parsed.messages, { outcomes: parsed.outcomes });
  assert.equal(result.insights.some((i) => i.kind === 'timing'), false);
  assert.equal(result.conversationsWithTeamReply, 24);
});

test('our-side stall points are found when the lead goes quiet after our message', () => {
  const parsed = parseWhatsAppBusinessAiReport(readZipTextEntries(zip));
  const result = analyzeConversations(parsed.messages, { outcomes: parsed.outcomes });
  const afterQuestion = result.insights.find((i) => i.kind === 'stall_point' && i.key === 'our_question');
  assert.ok(afterQuestion, 'expected "went quiet after we asked a question"');
  // Too few enrolments: no tactic claims are made.
  assert.equal(result.insights.some((i) => i.kind === 'outcome_driver'), false);
});
