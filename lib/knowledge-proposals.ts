// Job 6 — AI-proposed knowledge updates (pure helpers, no I/O).
//
// The proposal job groups the questions leads keep asking, checks them
// against approved knowledge, and asks Claude to propose ONE change per
// topic with what / why / expected effect / risk. Claude may only use facts
// the team itself wrote (team replies, existing knowledge). When a fact is
// missing it must leave an "[ADD: …]" gap for the admin to fill; a proposal
// with gaps cannot be approved until they are filled.

export const KNOWLEDGE_TOPICS = [
  { key: "payment_plan", label: "Payment plans and instalments", re: /\b(payment plan|instal+ments?|emi|pay in (parts|instal+ments?)|part payment|pay later)\b/ },
  { key: "fees", label: "Fees and what they include", re: /\b(fees?|cost|price|how much|kitna|charges?|amount)\b/ },
  { key: "discounts", label: "Discounts and offers", re: /\b(discount|offer|scholarship|early bird|concession|coupon)\b/ },
  { key: "dates", label: "Dates and batches", re: /\b(dates?|batch(es)?|starting|start date|schedule|next (month|batch)|when (is|does|will))\b/ },
  { key: "online", label: "Online or in person", re: /\b(online|offline|zoom|recorded|live class(es)?|in person|in-person)\b/ },
  { key: "accommodation", label: "Accommodation and food", re: /\b(accommodation|accomodation|stay|room|food|meals?|hostel)\b/ },
  { key: "certification", label: "Certification", re: /\b(certificate|certification|certified|yoga alliance|rys|ryt)\b/ },
  { key: "curriculum", label: "Curriculum and daily schedule", re: /\b(syllabus|curriculum|covered|itinerary|daily schedule|timings?|what (will|do) (i|we) learn)\b/ },
  { key: "eligibility", label: "Who can join", re: /\b(beginners?|eligib\w*|prerequisite|age limit|no experience|can i (join|do|attend))\b/ },
  { key: "location", label: "Location and travel", re: /\b(location|address|located|how to reach|airport|railway|nearest)\b/ },
  { key: "refunds", label: "Refunds and cancellations", re: /\b(refund|cancel\w*|reschedul\w*|transfer my (seat|booking))\b/ },
] as const;

export type KnowledgeTopicKey = (typeof KNOWLEDGE_TOPICS)[number]["key"];

/** Topics where a wrong answer costs money or trust; proposals always carry a risk note. */
export const SENSITIVE_TOPICS: ReadonlySet<KnowledgeTopicKey> = new Set(["payment_plan", "fees", "discounts", "refunds"]);

const QUESTION_START = /^(is|are|do|does|what|whats|what's|how|when|where|which|who|why|any|kya|kab|kaise|kitna|please (share|send|tell)|(can|could|will|would|shall) (i|you|u|we|someone|it|there|the|this|my))\b/;

export function isLeadQuestion(body: string | null | undefined): boolean {
  const text = (body || "").trim();
  if (text.length < 6 || text.length > 600) return false;
  if (/^shared an instagram (post|reel)/i.test(text)) return false;
  const lower = text.toLowerCase();
  // Hindi/Hinglish question words usually sit mid-sentence ("fee kitna hai").
  return text.includes("?") || QUESTION_START.test(lower) || /\b(kya|kitna|kitni|kitne|kab|kaise|kaha|kahan)\b/.test(lower);
}

/** The single most specific topic of a question, or null. Order in KNOWLEDGE_TOPICS is priority. */
export function knowledgeTopicOf(body: string): KnowledgeTopicKey | null {
  const t = body.toLowerCase();
  for (const topic of KNOWLEDGE_TOPICS) if (topic.re.test(t)) return topic.key;
  return null;
}

export function topicLabel(key: string): string {
  return KNOWLEDGE_TOPICS.find((t) => t.key === key)?.label ?? key;
}

export type QuestionMessage = { id: string; leadId: string; conversationId: string; body: string; createdAt: string };

export type QuestionCluster = {
  topic: KnowledgeTopicKey;
  label: string;
  leads: number;
  messages: number;
  samples: Array<{ messageId: string; conversationId: string; quote: string; at: string }>;
};

function normalizeQuote(body: string) {
  return body.replace(/\s+/g, " ").trim().slice(0, 220);
}

/** Groups lead questions by topic. Keeps topics asked by at least `minLeads` different leads. */
export function clusterQuestions(messages: QuestionMessage[], minLeads = 3, maxSamples = 8): QuestionCluster[] {
  const byTopic = new Map<KnowledgeTopicKey, { leads: Set<string>; messages: number; samples: QuestionCluster["samples"]; seen: Set<string> }>();
  for (const m of messages) {
    if (!isLeadQuestion(m.body)) continue;
    const topic = knowledgeTopicOf(m.body);
    if (!topic) continue;
    const entry = byTopic.get(topic) ?? { leads: new Set(), messages: 0, samples: [], seen: new Set() };
    entry.leads.add(m.leadId);
    entry.messages += 1;
    const quote = normalizeQuote(m.body);
    const key = quote.toLowerCase();
    // Distinct wording only, so the evidence shows the range of questions.
    if (entry.samples.length < maxSamples && !entry.seen.has(key)) {
      entry.seen.add(key);
      entry.samples.push({ messageId: m.id, conversationId: m.conversationId, quote, at: m.createdAt });
    }
    byTopic.set(topic, entry);
  }
  return [...byTopic.entries()]
    .filter(([, v]) => v.leads.size >= minLeads)
    .map(([topic, v]) => ({ topic, label: topicLabel(topic), leads: v.leads.size, messages: v.messages, samples: v.samples }))
    .sort((a, b) => b.leads - a.leads);
}

export function hasPlaceholders(content: string | null | undefined): boolean {
  return /\[ADD:[^\]]*\]/i.test(content || "");
}

export function proposalDedupeKey(topic: string, now: Date): string {
  // One proposal per topic per month: a rejected idea can come back next month with new evidence.
  return `questions:${topic}:${now.toISOString().slice(0, 7)}`;
}

export type KnowledgeDocBrief = { id: string; title: string; category: string; status: string; excerpt: string };
export type TeamReply = { question: string; reply: string };

export const PROPOSAL_SCHEMA = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["add", "update", "none"] },
    target_document_id: { type: "string" },
    title: { type: "string" },
    category: { type: "string", enum: ["faq", "policy", "general", "sales", "course"] },
    content: { type: "string" },
    why: { type: "string" },
    expected_effect: { type: "string" },
    risk: { type: "string" },
  },
  required: ["action", "target_document_id", "title", "category", "content", "why", "expected_effect", "risk"],
  additionalProperties: false,
} as const;

export function proposalSystemPrompt(): string {
  return [
    "You maintain the sales knowledge base of a yoga teacher-training academy.",
    "You propose at most ONE change per request and a human admin approves it.",
    "Hard rules:",
    "- Never invent facts: prices, dates, payment terms, refund rules, locations, accommodation, certification details.",
    "- Only state a fact if it appears in TEAM REPLIES or EXISTING KNOWLEDGE below. Lead questions are not facts.",
    "- Where a fact is needed but not given, write a gap exactly like [ADD: what the admin must fill in].",
    "- If an existing APPROVED item already answers these questions well, answer action \"none\".",
    "- If a DRAFT item covers the topic, answer action \"none\" (the admin should review that draft instead).",
    "- Use \"update\" only to fix or extend an APPROVED item; put its id in target_document_id. Otherwise target_document_id is \"\".",
    "- content is written as the knowledge item itself: short, factual, question-and-answer friendly, no marketing language.",
    "- why: one or two sentences citing how many leads asked and what was missing.",
    "- expected_effect: what will change in AI drafts and for leads.",
    "- risk: what could go wrong if the text is wrong or outdated; \"\" if none.",
    "Answer only with the JSON the schema asks for.",
  ].join("\n");
}

export function proposalUserPrompt(input: {
  cluster: QuestionCluster;
  docs: KnowledgeDocBrief[];
  teamReplies: TeamReply[];
}): string {
  const { cluster, docs, teamReplies } = input;
  const questions = cluster.samples.map((s) => `- "${s.quote}"`).join("\n");
  const knowledge = docs.length
    ? docs.map((d) => `[${d.id}] (${d.status}, ${d.category}) ${d.title}: ${d.excerpt}`).join("\n")
    : "(none)";
  const replies = teamReplies.length
    ? teamReplies.map((r) => `Lead: "${r.question}"\nTeam: "${r.reply}"`).join("\n\n")
    : "(none captured)";
  return [
    `TOPIC: ${cluster.label}`,
    `${cluster.leads} different leads asked about this in the last 14 days (${cluster.messages} messages). Examples:`,
    questions,
    "",
    "EXISTING KNOWLEDGE (id, status, category, title: excerpt):",
    knowledge,
    "",
    "TEAM REPLIES to similar questions:",
    replies,
  ].join("\n");
}

export type ParsedProposal =
  | { action: "none" }
  | { action: "add" | "update"; targetDocumentId: string | null; title: string; category: string; content: string; why: string; expectedEffect: string; risk: string };

/** Validates Claude's answer against what the database will accept. Returns null if unusable. */
export function parseProposal(raw: unknown, allowedTargets: Set<string>, topic: KnowledgeTopicKey): ParsedProposal | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const s = (k: string) => (typeof r[k] === "string" ? (r[k] as string).trim() : "");
  const action = s("action");
  if (action === "none") return { action: "none" };
  if (action !== "add" && action !== "update") return null;
  const target = s("target_document_id");
  if (action === "update" && !allowedTargets.has(target)) return null;
  const title = s("title").slice(0, 180);
  const content = s("content").slice(0, 8000);
  const why = s("why").slice(0, 1200);
  const expectedEffect = s("expected_effect").slice(0, 800);
  let risk = s("risk").slice(0, 800);
  if (!title || content.length < 10 || why.length < 10 || expectedEffect.length < 10) return null;
  if (SENSITIVE_TOPICS.has(topic) && !risk) risk = "Money-related answer: confirm the figures and terms are current before approving.";
  const categories = ["faq", "policy", "general", "sales", "course"];
  return {
    action,
    targetDocumentId: action === "update" ? target : null,
    title,
    category: categories.includes(s("category")) ? s("category") : "faq",
    content,
    why,
    expectedEffect,
    risk,
  };
}

export const KIND_LABELS: Record<string, string> = { add: "New", update: "Update", retire: "Retire" };
