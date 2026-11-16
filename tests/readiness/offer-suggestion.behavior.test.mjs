import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CONFIDENCE_CAP_LOW_EVIDENCE,
  draftOffer,
  needsManagerApproval,
  offerAmount,
  offerMessage,
  scoreOfferConfidence,
} from '../../lib/offer-suggestion.ts';

const base = { channel: 'whatsapp', courseKnown: false, waitingMinutes: 10, replyWindowOpen: true, learnedEnrolments: 17 };
const inb = (body) => ({ direction: 'inbound', body });
const out = (body) => ({ direction: 'outbound', body });

test('a greeting alone is unlikely and gets no offer draft', () => {
  const c = scoreOfferConfidence({ ...base, messages: [inb('Hlw')] });
  assert.equal(c.verdict, 'unlikely');
  assert.ok(c.factors.some((f) => f.key === 'greeting_only'));
  assert.equal(draftOffer({ ...base, messages: [inb('Hlw')] }, c), null);
});

test('price + booking intent in a two-way chat is likely, with every factor explained', () => {
  const ctx = { ...base, courseKnown: true, messages: [inb('What is the fee for January?'), out('25,000'), inb('Is there an early-bird? I want to join')] };
  const c = scoreOfferConfidence(ctx);
  assert.equal(c.verdict, 'likely');
  assert.equal(c.percent, 35 + 20 + 15 + 10 + 5);
  assert.deepEqual(c.factors.map((f) => f.key).sort(), ['asked_price', 'course_known', 'two_way', 'wants_to_book'].sort());
  const d = draftOffer(ctx, c);
  assert.ok(d);
  assert.ok(d.reasons.length > 0);
});

test('confidence is capped while evidence is low, and uncapped with 20+ enrolments', () => {
  const messages = [inb('Fee? I am a certified yoga teacher, want to book'), inb('package price for both courses?')];
  const low = scoreOfferConfidence({ ...base, courseKnown: true, waitingMinutes: 3000, messages });
  assert.ok(low.percent <= CONFIDENCE_CAP_LOW_EVIDENCE);
  assert.match(low.evidenceLabel, /Low evidence/);
  const high = scoreOfferConfidence({ ...base, courseKnown: true, waitingMinutes: 3000, messages, learnedEnrolments: 40 });
  assert.match(high.evidenceLabel, /Based on 40 enrolments/);
  assert.ok(high.percent >= low.percent);
});

test('closed reply window lowers confidence', () => {
  const open = scoreOfferConfidence({ ...base, messages: [inb('What is the fee?')] });
  const closed = scoreOfferConfidence({ ...base, replyWindowOpen: false, messages: [inb('What is the fee?')] });
  assert.equal(open.percent - closed.percent, 15);
});

test('draft type follows what the lead asked for', () => {
  const pkg = { ...base, messages: [inb('Do you offer a package price for both courses back to back?'), inb('fee?')] };
  assert.equal(draftOffer(pkg, scoreOfferConfidence(pkg)).kind, 'package_price');
  const parts = { ...base, messages: [inb('Can I pay in installments?'), inb('fee?')] };
  const p = draftOffer(parts, scoreOfferConfidence(parts));
  assert.equal(p.kind, 'pay_to_book');
  assert.equal(p.discountPercent, 0);
});

test('learned tactic rates are quoted in the reasons when approved', () => {
  const ctx = { ...base, messages: [inb('What is the fee?'), inb('discount?')], learnedTactics: { offer: { with: 0.2, without: 0.02 }, part_payment: { with: 0.25, without: 0.05 } } };
  const c = scoreOfferConfidence(ctx);
  assert.match(c.factors.find((f) => f.key === 'asked_price').label, /20% vs 2%/);
  assert.ok(draftOffer(ctx, c).reasons.some((r) => /25% vs 5%/.test(r)));
});

test('money, manager threshold and customer message', () => {
  assert.equal(offerAmount(25000, 20), 20000);
  assert.equal(offerAmount(25000, 90), 12500); // clamped to 50%
  assert.equal(needsManagerApproval(20), false);
  assert.equal(needsManagerApproval(21), true);
  const msg = offerMessage({ firstName: 'Priya', courseLabel: 'Online 200-Hour TTC', basePrice: 25000, currency: 'INR', discountPercent: 20, depositText: '₹10,000 to book', validHours: 48 });
  assert.match(msg, /Namaste Priya/);
  assert.match(msg, /₹20,000/);
  assert.match(msg, /instead of ₹25,000/);
  assert.match(msg, /valid for 2 days/);
});

test('database enforces approval rules and never sends', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20261116160000_lead_offer_proposals_v1.sql', import.meta.url), 'utf8');
  assert.match(sql, /enable row level security/);
  assert.match(sql, /is_organization_member\(p_organization_id\)/);
  assert.match(sql, /v_needs_manager and not public\.can_manage_organization/);
  assert.match(sql, /Enter the course price before approving/);
  assert.match(sql, /lead_offer_proposals_approved_complete/);
  assert.doesNotMatch(sql, /grant (insert|update|delete)[^;]*lead_offer_proposals[^;]*to authenticated/i);
  assert.doesNotMatch(sql, /send_whatsapp|messages\b.*insert/i);
});

test('the Inbox only shows offers behind a flag and approval only fills the reply box', () => {
  const page = readFileSync(new URL('../../app/conversations/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /AI_OFFERS_ENABLED === "true"/);
  const card = readFileSync(new URL('../../components/inbox-offer-card.tsx', import.meta.url), 'utf8');
  assert.match(card, /crm:copilot-draft/);
  assert.doesNotMatch(card, /sendWhatsAppMessageAction|sendInstagramMessageAction/);
  const actions = readFileSync(new URL('../../app/conversations/offer-actions.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(actions, /send(WhatsApp|Instagram)|createAdminClient/);
});
