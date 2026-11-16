// Conversation learning v1 — deterministic, tenant-scoped analysis of past
// conversations. It does NOT train or fine-tune a model. It produces
// evidence-counted insights (what leads ask, where they stop, what blocks
// them, what they ask for as offers, when they write) that a manager reviews.
// Only approved insights may later be given to the AI copilot/autopilot as
// playbook context.
//
// Pure functions only: callers load messages for ONE organization and pass
// them in. Nothing here reads the database or calls an AI provider.

export type LearningMessage = {
  conversationId: string;
  direction: 'inbound' | 'outbound';
  body: string | null;
  messageType: string | null;
  createdAt: string; // ISO timestamp
};

export type ConversationOutcome = 'won' | 'payment_pending' | 'lost' | 'open';

export type InsightKind =
  | 'question'
  | 'objection'
  | 'stall_point'
  | 'buying_signal'
  | 'offer_request'
  | 'timing'
  | 'data_gap'
  | 'outcome_driver';

export type LearningInsight = {
  kind: InsightKind;
  key: string;
  label: string;
  conversations: number;
  share: number; // 0..1 of analysed conversations (or of the relevant base)
  examples: string[]; // redacted, free-typed lead messages only
  detail: string;
};

export type LearningResult = {
  conversationsAnalyzed: number;
  messagesAnalyzed: number;
  inboundMessages: number;
  outboundMessages: number;
  conversationsWithTeamReply: number;
  quickButtonShare: number;
  outcomeEvidence: { won: number; paymentPending: number; enoughForOutcomeLearning: boolean };
  insights: LearningInsight[];
};

/** Minimum wins before the analyser reports what drives conversion. */
export const MIN_WINS_FOR_OUTCOME_LEARNING = 20;
/** Minimum conversations an insight needs before it is reported at all. */
export const MIN_INSIGHT_CONVERSATIONS = 3;
const MAX_EXAMPLES = 3;

// Instagram ice-breaker / quick-reply button texts: they show what was tapped,
// not what the lead wrote, so they never become examples.
export const QUICK_BUTTON_TEXTS = new Set(
  [
    'What is the course fee?',
    'How much does the course cost?',
    'What is the course duration?',
    'How do I enroll now?',
    'How do I enroll?',
    'How do I register for the training?',
    'How do I register for training?',
    'How do I register for 200-Hour YTT?',
    'How do I register for 200-Hour YTT in Mysore?',
    'How do I register for this training program?',
    'Is there a certification provided?',
    'Is accommodation included?',
    'Is accommodation provided?',
    'Is there a payment plan?',
    'Hello, can I get more info on this?',
    'What is included in the training kit?',
    'No, not at this time.',
    'No, need more info.',
    'Yes, I am very interested.',
    "Yes, I'm interested.",
    'I need some time to think about it first.',
  ].map((value) => value.toLowerCase()),
);

type Rule = { key: string; label: string; pattern: RegExp };

export const QUESTION_RULES: Rule[] = [
  { key: 'fee', label: 'Course fee', pattern: /\b(fees?|cost|price|charges?|how much|kitna)\b/i },
  { key: 'dates', label: 'Dates, duration & batches', pattern: /\b(duration|dates?|batch(es)?|schedule|timings?|itinerary|timetable|next month|january|february|december|november|jan|feb|dec|nov)\b/i },
  { key: 'register', label: 'How to register', pattern: /\b(register|enrol+|apply|application|admission|book(ing)?)\b/i },
  { key: 'online_offline', label: 'Online or in person', pattern: /\b(online|offline|recorded|recordings?|live class)\b/i },
  { key: 'accommodation', label: 'Accommodation', pattern: /\b(accommodation|accomodation|stay|room|twin|sharing|cottage)\b/i },
  { key: 'location', label: 'Location', pattern: /\b(location|where|address|bangalore|bengaluru|near)\b/i },
  { key: 'certification', label: 'Certification & eligibility', pattern: /\b(certif\w*|alliance|rys|eligib\w*|prerequisite\w*|qualification\w*)\b/i },
  { key: 'curriculum', label: 'Curriculum & kit', pattern: /\b(curriculum|syllabus|modules?|kit|levels?)\b/i },
  { key: 'pregnancy_health', label: 'Pregnancy or health safety', pattern: /\b(pregnan\w*|garbh\w*|cardiac|patient|is it safe)\b/i },
];

export const OBJECTION_RULES: Rule[] = [
  { key: 'timing', label: 'Not now / bad timing', pattern: /\b(not now|later|next year|not at this time|not as of now|can'?t join|cannot join|clash\w*|not feasible|time to think|think about it|get back|let you know|will inform|will check)\b/i },
  { key: 'wants_online', label: 'Wants an online option', pattern: /\b(online)\b/i },
  { key: 'price', label: 'Price too high', pattern: /\b(too much|costly|expensive|afford\w*|not affordable|cost is high|financ\w*)\b/i },
  { key: 'not_interested', label: 'Not interested', pattern: /^(no|nope|no thanks?|not interested|no interest)\b/i },
  { key: 'location', label: 'Too far / wants another city', pattern: /\b(too far|bangalore|bengaluru|in my city|near me)\b/i },
  { key: 'not_teacher', label: 'Wants to learn, not to teach', pattern: /\b(not looking to teach|focused on teaching|teaching academy|self learn\w*|own practice)\b/i },
];

export const OFFER_RULES: Rule[] = [
  { key: 'discount', label: 'Discount', pattern: /\b(discount\w*|offer price|cheaper|concession)\b/i },
  { key: 'installments', label: 'Installments / payment plan', pattern: /\b(instal+ments?|payment plan|emi|partial payment|pay in parts)\b/i },
  { key: 'scholarship', label: 'Scholarship or exchange', pattern: /\b(scholarship|in exchange|instead of paying|volunteer\w*)\b/i },
  { key: 'seasonal', label: 'Seasonal / early-bird offer', pattern: /\b(diwali offer|early.?bird|festival offer|new year offer)\b/i },
];

export const BUYING_SIGNAL_RULES: Rule[] = [
  { key: 'paid', label: 'Says they paid', pattern: /\b(made the payment|i'?ve paid|i have paid|payment (is )?done)\b/i },
  { key: 'ready_to_join', label: 'Ready to join a batch', pattern: /\b(would love to (join|register)|want to join|go ahead|i can join|will join|interested in joining|book (a|my) seat)\b/i },
  { key: 'shared_contact', label: 'Shared a phone number', pattern: /(\+?\d[\d\s-]{8,}\d)/ },
];

const STALL_RULES: Rule[] = [
  { key: 'fee', label: 'After asking the fee', pattern: QUESTION_RULES[0].pattern },
  { key: 'offer', label: 'After asking for a discount or installments', pattern: /\b(discount|instal+ment|payment plan|scholarship|offer|emi)\b/i },
  { key: 'register', label: 'After asking how to register', pattern: QUESTION_RULES[2].pattern },
  { key: 'dates', label: 'After asking about dates', pattern: QUESTION_RULES[1].pattern },
  { key: 'not_now', label: 'After saying "not now"', pattern: OBJECTION_RULES[0].pattern },
  { key: 'said_no', label: 'After saying no', pattern: OBJECTION_RULES[3].pattern },
  { key: 'ok_thanks', label: 'After "ok / thanks" (no next step offered)', pattern: /^(ok(ay)?|thanks?|thank you|sure|yes|👍)\b/i },
];

const PHONE = /\+?\d[\d\s-]{7,}\d/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const HANDLE = /@[\w.]{2,}/g;
const URL = /https?:\/\/\S+/g;

/** Redacts contact details and links, trims to a short example. */
export function redactExample(text: string, max = 120): string {
  const clean = text
    .replace(URL, '[link]')
    .replace(EMAIL, '[email]')
    .replace(PHONE, '[phone]')
    .replace(HANDLE, '[handle]')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export function isQuickButton(text: string): boolean {
  return QUICK_BUTTON_TEXTS.has(text.trim().toLowerCase());
}

function matchKeys(rules: Rule[], text: string): string[] {
  return rules.filter((rule) => rule.pattern.test(text)).map((rule) => rule.key);
}

type Bucket = { conversations: Set<string>; examples: string[] };

function bucketAdd(map: Map<string, Bucket>, key: string, conversationId: string, example?: string) {
  let bucket = map.get(key);
  if (!bucket) {
    bucket = { conversations: new Set(), examples: [] };
    map.set(key, bucket);
  }
  bucket.conversations.add(conversationId);
  if (example && bucket.examples.length < MAX_EXAMPLES && !bucket.examples.includes(example)) {
    bucket.examples.push(example);
  }
}

function toInsights(kind: InsightKind, rules: Rule[], map: Map<string, Bucket>, base: number, detail: (count: number, share: number) => string) {
  const insights: LearningInsight[] = [];
  for (const rule of rules) {
    const bucket = map.get(rule.key);
    const count = bucket?.conversations.size ?? 0;
    if (count < MIN_INSIGHT_CONVERSATIONS || base === 0) continue;
    const share = count / base;
    insights.push({ kind, key: rule.key, label: rule.label, conversations: count, share, examples: bucket?.examples ?? [], detail: detail(count, share) });
  }
  return insights.sort((a, b) => b.conversations - a.conversations);
}

function pct(share: number) {
  return `${Math.round(share * 100)}%`;
}

function hourInZone(iso: string, timeZone: string): { hour: number; weekday: string } | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hour12: false, weekday: 'short' }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  return Number.isFinite(hour) ? { hour: hour % 24, weekday } : null;
}

export function analyzeConversations(
  messages: LearningMessage[],
  options: { outcomes?: Map<string, ConversationOutcome>; timeZone?: string } = {},
): LearningResult {
  const timeZone = options.timeZone ?? 'Asia/Kolkata';
  const byConversation = new Map<string, LearningMessage[]>();
  let inbound = 0;
  let outbound = 0;
  for (const message of messages) {
    if (!message.conversationId) continue;
    if (message.direction === 'inbound') inbound += 1;
    else outbound += 1;
    const list = byConversation.get(message.conversationId) ?? [];
    list.push(message);
    byConversation.set(message.conversationId, list);
  }

  const questions = new Map<string, Bucket>();
  const objections = new Map<string, Bucket>();
  const offers = new Map<string, Bucket>();
  const signals = new Map<string, Bucket>();
  const stalls = new Map<string, Bucket>();
  const hours = new Array<number>(24).fill(0);
  const weekdays = new Map<string, number>();
  let withReply = 0;
  let quickFirst = 0;
  let withText = 0;

  for (const [conversationId, list] of byConversation) {
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const leadTexts = list.filter((m) => m.direction === 'inbound' && (m.messageType ?? 'text') === 'text' && m.body?.trim());
    if (list.some((m) => m.direction === 'outbound')) withReply += 1;
    if (!leadTexts.length) continue;
    withText += 1;
    if (isQuickButton(leadTexts[0].body!)) quickFirst += 1;

    const first = hourInZone(list[0].createdAt, timeZone);
    if (first) {
      hours[first.hour] += 1;
      weekdays.set(first.weekday, (weekdays.get(first.weekday) ?? 0) + 1);
    }

    for (const message of leadTexts) {
      const text = message.body!.trim();
      const example = isQuickButton(text) ? undefined : redactExample(text);
      for (const key of matchKeys(QUESTION_RULES, text)) bucketAdd(questions, key, conversationId, example);
      for (const key of matchKeys(OBJECTION_RULES, text)) bucketAdd(objections, key, conversationId, example);
      for (const key of matchKeys(OFFER_RULES, text)) bucketAdd(offers, key, conversationId, example);
      for (const key of matchKeys(BUYING_SIGNAL_RULES, text)) {
        bucketAdd(signals, key, conversationId, key === 'shared_contact' ? undefined : example);
      }
    }

    // Stall point: the last thing the lead said, when nothing followed from them.
    const last = leadTexts[leadTexts.length - 1].body!.trim();
    const stallKey = STALL_RULES.find((rule) => rule.pattern.test(last))?.key;
    if (stallKey) bucketAdd(stalls, stallKey, conversationId, isQuickButton(last) ? undefined : redactExample(last));
  }

  const base = withText;
  const insights: LearningInsight[] = [
    ...toInsights('question', QUESTION_RULES, questions, base, (n, s) => `${n} conversations (${pct(s)}) asked this.`),
    ...toInsights('stall_point', STALL_RULES, stalls, base, (n, s) => `${n} conversations (${pct(s)}) went quiet right after this.`),
    ...toInsights('objection', OBJECTION_RULES, objections, base, (n, s) => `${n} conversations (${pct(s)}) raised this.`),
    ...toInsights('offer_request', OFFER_RULES, offers, base, (n, s) => `${n} conversations (${pct(s)}) asked for this.`),
    ...toInsights('buying_signal', BUYING_SIGNAL_RULES, signals, base, (n, s) => `${n} conversations (${pct(s)}) showed this signal.`),
  ];

  if (base > 0) {
    const peakHours = hours
      .map((count, hour) => ({ hour, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .sort((a, b) => a.hour - b.hour);
    const topDays = [...weekdays.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
    const eveningShare = hours.slice(18, 24).reduce((a, b) => a + b, 0) / base;
    insights.push({
      kind: 'timing', key: 'when_leads_write', label: 'When new conversations start',
      conversations: base, share: eveningShare, examples: [],
      detail: `Busiest start hours (${timeZone}): ${peakHours.map((p) => `${String(p.hour).padStart(2, '0')}:00`).join(', ')}. ${pct(eveningShare)} start between 18:00 and midnight. Busiest days: ${topDays.map(([d]) => d).join(', ')}.`,
    });
  }

  const totalConversations = byConversation.size;
  if (totalConversations > 0 && withReply / totalConversations < 0.5) {
    insights.push({
      kind: 'data_gap', key: 'team_replies_missing', label: 'Team replies are missing from SalsysOS',
      conversations: totalConversations - withReply, share: 1 - withReply / totalConversations, examples: [],
      detail: `Only ${withReply} of ${totalConversations} conversations contain a team reply. Replies sent from the Instagram or WhatsApp apps are not stored, so the AI cannot yet learn which answers move leads forward.`,
    });
  }

  const outcomes = options.outcomes ?? new Map<string, ConversationOutcome>();
  let won = 0;
  let paymentPending = 0;
  for (const conversationId of byConversation.keys()) {
    const outcome = outcomes.get(conversationId);
    if (outcome === 'won') won += 1;
    if (outcome === 'payment_pending') paymentPending += 1;
  }
  const enoughForOutcomeLearning = won >= MIN_WINS_FOR_OUTCOME_LEARNING && withReply >= MIN_WINS_FOR_OUTCOME_LEARNING;
  if (!enoughForOutcomeLearning) {
    insights.push({
      kind: 'data_gap', key: 'outcomes_missing', label: 'Not enough enrolments to learn what converts',
      conversations: won, share: totalConversations ? won / totalConversations : 0, examples: [],
      detail: `${won} conversation${won === 1 ? '' : 's'} linked to an enrolment (need ${MIN_WINS_FOR_OUTCOME_LEARNING}+ with team replies). Until then, offer timing and "what converts" stay as rules you set, not learned patterns.`,
    });
  } else {
    // With enough wins: compare stall/offer behaviour of won vs not-won conversations.
    for (const [key, bucket] of offers) {
      const askedWon = [...bucket.conversations].filter((id) => outcomes.get(id) === 'won').length;
      const share = askedWon / won;
      if (askedWon >= MIN_INSIGHT_CONVERSATIONS) {
        const rule = OFFER_RULES.find((r) => r.key === key);
        insights.push({ kind: 'outcome_driver', key: `won_after_${key}`, label: `Enrolled after asking: ${rule?.label ?? key}`, conversations: askedWon, share, examples: [], detail: `${pct(share)} of enrolments asked for this first.` });
      }
    }
  }

  return {
    conversationsAnalyzed: totalConversations,
    messagesAnalyzed: messages.length,
    inboundMessages: inbound,
    outboundMessages: outbound,
    conversationsWithTeamReply: withReply,
    quickButtonShare: withText ? quickFirst / withText : 0,
    outcomeEvidence: { won, paymentPending, enoughForOutcomeLearning },
    insights,
  };
}
