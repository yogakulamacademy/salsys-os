// Ideal persona per course and the Fit score (lead intelligence plan, 20 Nov 2026).
// Pure: no I/O.
//
// A persona is learned from the people who reached a good outcome for a course:
// where they are from, how they found you, what they asked, and how they
// behaved on the website. The Fit score compares one lead with it.
//
// Outcome: real conversions (payment pending, won, enrolled) when there are
// enough of them; otherwise "provisional", which also counts qualified and
// high-intent leads. The persona says which one it used.

import type { InterestProfile, TopicKey } from "@/lib/interest-profile";

export const STRONG_STAGES = ["payment_pending", "closed_won", "enrolled"] as const;
export const PROVISIONAL_STAGES = ["qualified", "high_intent"] as const;
export const MIN_STRONG = 10;
export const MIN_SAMPLE = 5;

export type PersonaLead = {
  leadId: string;
  courseId: string | null;
  stage: string;
  country: string | null;
  channel: string | null;
  profile: InterestProfile | null;
};

type Share = { value: string; share: number };

export type PersonaTraits = {
  version: 1;
  outcome: "strong" | "provisional";
  sampleSize: number;
  countries: Share[];
  channels: Share[];
  topics: Share[];
  behaviour: {
    sawPrice: number;        // share of the sample
    cameBack: number;
    readTwoMinutes: number;
    contactedYou: number;
    medianVisits: number;
  };
  websiteSample: number;     // how many of the sample had website data
};

const round = (n: number) => Math.round(n * 100) / 100;

function shares(values: (string | null | undefined)[], top = 5): Share[] {
  const counts = new Map<string, number>();
  let total = 0;
  for (const v of values) {
    if (!v) continue;
    const key = v.trim().toLowerCase();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    total += 1;
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([value, n]) => ({ value, share: round(n / total) }));
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function contacted(p: InterestProfile) {
  return (p.ctaClicks.whatsapp ?? 0) + (p.ctaClicks.call ?? 0) + (p.ctaClicks.contact ?? 0) + (p.ctaClicks.enrol ?? 0) + p.contactPages > 0;
}

/** Learn one course's persona. Returns null when there are too few good outcomes to learn from. */
export function learnPersona(leads: PersonaLead[]): PersonaTraits | null {
  const strong = leads.filter((l) => (STRONG_STAGES as readonly string[]).includes(l.stage));
  const provisional = leads.filter((l) => (PROVISIONAL_STAGES as readonly string[]).includes(l.stage));
  const outcome: PersonaTraits["outcome"] = strong.length >= MIN_STRONG ? "strong" : "provisional";
  const sample = outcome === "strong" ? strong : [...strong, ...provisional];
  if (sample.length < MIN_SAMPLE) return null;

  const withWeb = sample.filter((l) => l.profile?.hasWebsiteData);
  const ratio = (pred: (p: InterestProfile) => boolean) => (withWeb.length ? round(withWeb.filter((l) => pred(l.profile!)).length / withWeb.length) : 0);
  const topicValues: string[] = [];
  for (const l of sample) for (const t of l.profile?.topics ?? []) topicValues.push(t.key);
  const withMessages = sample.filter((l) => (l.profile?.inboundMessages ?? 0) > 0).length || 1;
  const topicCounts = new Map<string, number>();
  for (const key of topicValues) topicCounts.set(key, (topicCounts.get(key) ?? 0) + 1);

  return {
    version: 1,
    outcome,
    sampleSize: sample.length,
    countries: shares(sample.map((l) => l.country)),
    channels: shares(sample.map((l) => l.channel)),
    // Share of people (with messages) who asked about each topic.
    topics: [...topicCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([value, n]) => ({ value, share: round(Math.min(1, n / withMessages)) })),
    behaviour: {
      sawPrice: ratio((p) => p.priceViews > 0 || p.highIntentPages > 0),
      cameBack: ratio((p) => p.returnedAfterDays != null || p.visits >= 2),
      readTwoMinutes: ratio((p) => p.readingMinutes >= 2),
      contactedYou: ratio(contacted),
      medianVisits: median(withWeb.map((l) => l.profile!.visits)),
    },
    websiteSample: withWeb.length,
  };
}

export type FitReason = { text: string; points: number };
export type FitResult = { score: number; band: "strong" | "good" | "some" | "weak"; reasons: FitReason[] };

const shareOf = (list: Share[], value: string | null | undefined) =>
  value ? list.find((s) => s.value === value.trim().toLowerCase())?.share ?? 0 : 0;

/**
 * How closely one lead matches the course persona, 0-100, with the reasons.
 * Each part is scaled by how common that trait is in the persona, so a trait
 * shared by few good outcomes counts little.
 */
export function fitScore(lead: Omit<PersonaLead, "leadId" | "stage" | "courseId">, persona: PersonaTraits): FitResult {
  const reasons: FitReason[] = [];
  const add = (points: number, text: string) => { if (points > 0) reasons.push({ text, points: Math.round(points) }); };
  const top = (list: Share[]) => list[0]?.share || 1;

  // Who they are (35)
  const c = shareOf(persona.countries, lead.country);
  add(20 * (c / top(persona.countries)), `From ${lead.country} like many who joined`);
  const ch = shareOf(persona.channels, lead.channel);
  add(15 * (ch / top(persona.channels)), `Came through ${lead.channel} like many who joined`);

  const p = lead.profile;
  // What they asked (25)
  if (p?.topics.length && persona.topics.length) {
    const asked = new Set(p.topics.map((t) => t.key as string));
    const matched = persona.topics.filter((t) => asked.has(t.value));
    const weight = matched.reduce((s, t) => s + t.share, 0) / Math.max(0.01, persona.topics.slice(0, 3).reduce((s, t) => s + t.share, 0));
    if (matched.length) add(25 * Math.min(1, weight), `Asked what joiners ask: ${matched.slice(0, 2).map((t) => labelTopic(t.value)).join(", ")}`);
  }

  // How they behaved (40), only when both sides have website data
  if (p?.hasWebsiteData && persona.websiteSample >= 3) {
    const b = persona.behaviour;
    if (p.priceViews > 0 || p.highIntentPages > 0) add(12 * b.sawPrice, "Looked at prices, like most who joined");
    if (p.returnedAfterDays != null || p.visits >= 2) add(10 * b.cameBack, "Came back to the website");
    if (p.readingMinutes >= 2) add(8 * b.readTwoMinutes, "Read the course in depth");
    if (contacted(p)) add(10 * b.contactedYou, "Reached out to you");
  }

  reasons.sort((a, b) => b.points - a.points);
  const score = Math.max(0, Math.min(100, reasons.reduce((s, r) => s + r.points, 0)));
  const band = score >= 70 ? "strong" : score >= 45 ? "good" : score >= 25 ? "some" : "weak";
  return { score, band, reasons: reasons.slice(0, 5) };
}

const TOPIC_TEXT: Partial<Record<TopicKey | string, string>> = {
  fees: "fees", dates: "dates", register: "joining", payment: "payment", discount: "discounts",
  accommodation: "stay", online_offline: "online or in person", location: "location",
  certification: "certificate", experience: "experience needed", food: "food", visa: "visa & travel",
};
export const labelTopic = (key: string) => TOPIC_TEXT[key] ?? key.replace(/_/g, " ");

/**
 * One line on what a persona means for sales, from its own numbers.
 * Never suggests offering a discount: discount questions go to a person.
 */
export function personaAdvice(p: PersonaTraits): string {
  const parts: string[] = [];
  const topics = p.topics;
  const share = (key: string) => topics.find((t) => t.value === key)?.share ?? 0;
  const top = topics[0];
  if (top) {
    const pct = Math.round(top.share * 100);
    if (top.value === "certification") parts.push(`Mention the certificate early: ${pct}% ask about it.`);
    else if (top.value === "dates") parts.push(`They decide on dates: send the next batches with the fee (${pct}% ask about dates).`);
    else if (top.value === "online_offline") parts.push(`Say early whether it's online or in person: ${pct}% ask.`);
    else if (top.value === "accommodation") parts.push(`Include the stay options: ${pct}% ask about them.`);
    else parts.push(`Lead with the ${labelTopic(top.value)} in the first reply: ${pct}% ask about it.`);
  }
  const discount = share("discount");
  if (discount >= 0.15) parts.push(`${Math.round(discount * 100)}% ask for a discount: anything beyond the standard offer goes to a person.`);
  else if (topics.length && discount > 0 && discount < 0.1) parts.push("Discount questions are rare here.");
  const ig = p.channels.find((c) => c.value === "instagram")?.share ?? 0;
  if (ig >= 0.8) parts.push("Almost all come through Instagram.");
  return parts.join(" ") || "Not enough detail yet to say more.";
}
