// How a lead reached us and what they are looking at: the Instagram ad they
// replied to, or a post/reel/story they shared. Pure helpers so the AI and the
// Inbox can use the same reading. Captions are marketing text: context for
// understanding the question, never approved facts (prices, dates).

export type CourseRef = { id?: string | null; name: string; code?: string | null; category?: string | null };

export type AdSource = {
  kind: "ad";
  adId: string | null;
  title: string; // cleaned ad title, e.g. "✨ Sound Healing Meditation Course…"
  postId: string | null;
};

export type ShareSource = {
  kind: "share";
  mediaType: string; // share | ig_post | ig_reel | reel | image | story_mention | ...
  url: string | null;
  mediaId: string | null;
  caption: string | null; // from the message text or fetched for our own media
};

export type StoryReplySource = { kind: "story_reply"; url: string | null; mediaId: string | null; caption: string | null };

export type SourceEvent = AdSource | ShareSource | StoryReplySource;

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** "Instagram post: ✨ Sound Healing Meditation Course..._Group_1shadow" → "✨ Sound Healing Meditation Course…" */
export function cleanAdTitle(raw: string): string {
  return raw
    .replace(/^instagram (post|reel|video|image|story):\s*/i, "")
    .replace(/_group_\d+(shadow)?$/i, "")
    .replace(/\.{3}$/, "…")
    .trim();
}

/** Read one stored Instagram webhook event (the `messaging` item). */
export function parseInstagramSourceEvent(payload: unknown): SourceEvent | null {
  const event = obj(payload);
  const message = obj(event.message);
  const referral = obj(message.referral ?? event.referral);
  const ads = obj(referral.ads_context_data);
  if (str(referral.ad_id) || Object.keys(ads).length || str(referral.source)?.toUpperCase() === "ADS") {
    const title = str(ads.ad_title);
    return { kind: "ad", adId: str(referral.ad_id), title: title ? cleanAdTitle(title) : "an Instagram ad", postId: str(ads.post_id) };
  }
  const story = obj(obj(message.reply_to).story);
  if (Object.keys(story).length) {
    return { kind: "story_reply", url: str(story.url), mediaId: str(story.id), caption: null };
  }
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  const first = obj(attachments[0]);
  const type = str(first.type);
  if (type) {
    const p = obj(first.payload);
    return {
      kind: "share",
      mediaType: type,
      url: str(p.url),
      mediaId: str(p.ig_post_media_id) ?? str(p.reel_video_id) ?? str(p.id),
      caption: str(p.title),
    };
  }
  return null;
}

/** The CRM stores shares as "Shared an Instagram post\n<caption or url>". */
export function readStoredShareBody(body: string | null | undefined): { isShare: boolean; caption: string | null } {
  const text = (body ?? "").trim();
  const m = /^(?:Shared an Instagram (?:post|reel|image|video|item|story)|\[Instagram (?:ig_story|story_reply|share|ig_reel|image|unsupported|unknown)[^\]]*\])\s*\n?([\s\S]*)$/i.exec(text);
  if (!m) return { isShare: false, caption: null };
  const rest = m[1].trim();
  // A bare link or attachment URL is not something the AI can read.
  if (!rest || /^https?:\/\/\S+$/i.test(rest)) return { isShare: true, caption: null };
  return { isShare: true, caption: rest };
}

/** True when the latest message is only a share we cannot read, so a reply would be a guess. */
export function needsHumanEyes(latestBody: string | null | undefined, fetchedCaption: string | null): boolean {
  const stored = readStoredShareBody(latestBody);
  return stored.isShare && !stored.caption && !fetchedCaption;
}

const COURSE_HINTS: Array<[RegExp, string[]]> = [
  [/sound\s*heal\w*.*(master)|master.*sound/i, ["SOUND-MASTER"]],
  [/sound\s*heal\w*.*level\s*2|level\s*2.*sound/i, ["SOUND-L2"]],
  [/sound\s*heal\w*|singing bowl|sound (bath|meditation)|what if sound/i, ["SOUND-L1", "SOUND-MASTER"]],
  [/face\s*yoga/i, ["FACE-YOGA"]],
  [/kids?\s*yoga/i, ["KIDS-YOGA"]],
  [/online.*(prenatal|postnatal)|(prenatal|postnatal).*online/i, ["ONLINE-PRENATAL"]],
  [/85[- ]?hour|prenatal|postnatal|pregnan|garbh/i, ["85H-PRENATAL", "ONLINE-PRENATAL"]],
  [/kundalini|tantra/i, ["100H-KUNDALINI"]],
  [/500[- ]?(hour|hr|h)\b/i, ["500H-YTT"]],
  [/online.*300|300.*online/i, ["ONLINE-300H"]],
  [/300[- ]?(hour|hr|h)\b/i, ["300H-YTT"]],
  [/online.*200|200.*online|certified international yoga instructor/i, ["ONLINE-200H"]],
  [/200[- ]?(hour|hr|h)\b|24 days|yoga teacher training|ytt\b/i, ["200H-YTT"]],
  [/100[- ]?(hour|hr|h)\b/i, ["100H-YTT"]],
  [/ayurved/i, ["AYURVEDA-RETREAT"]],
  [/nutrition/i, ["NUTRITION"]],
  [/retreat/i, ["YOGA-RETREAT"]],
];

/** Best course guess from ad or post text. Returns null rather than guessing wildly. */
export function courseFromText(text: string | null | undefined, courses: CourseRef[]): CourseRef | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  const byCode = new Map(courses.filter((c) => c.code).map((c) => [String(c.code).toUpperCase(), c]));
  for (const [re, codes] of COURSE_HINTS) {
    if (!re.test(t)) continue;
    for (const code of codes) {
      const hit = byCode.get(code);
      if (hit) return hit;
    }
  }
  // Fall back to a course whose full name appears in the text.
  const lower = t.toLowerCase();
  return courses.find((c) => c.name.length > 6 && lower.includes(c.name.toLowerCase())) ?? null;
}

/** Comparable form of a caption: no emoji, punctuation or extra spaces. */
export function normalizeCaption(text: string): string {
  return text.toLowerCase().replace(/…|\.{3}/g, " ").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

/**
 * Meta's ad title is the start of the boosted post's caption, cut with "…".
 * Find that post among our own captions; needs at least 12 matching characters.
 */
export function matchCaptionByPrefix(adTitle: string, captions: string[]): string | null {
  const prefix = normalizeCaption(cleanAdTitle(adTitle));
  if (prefix.length < 12) return null;
  const hits = captions.filter((c) => normalizeCaption(c).startsWith(prefix));
  return hits.length === 1 ? hits[0] : hits.length > 1 ? hits.sort((a, b) => a.length - b.length)[0] : null;
}

export type LeadSourceContext = {
  ad: (AdSource & { course: CourseRef | null; caption?: string | null }) | null;
  latestShare: (ShareSource | StoryReplySource) & { course: CourseRef | null; readable: boolean } | null;
};

/** One-line summary for people and for the AI prompt. */
export function describeSource(ctx: LeadSourceContext): string | null {
  const parts: string[] = [];
  if (ctx.ad) parts.push(`Came from the Instagram ad "${ctx.ad.title}"${ctx.ad.course ? ` (looks like ${ctx.ad.course.name})` : ""}.`);
  if (ctx.latestShare) {
    const what = ctx.latestShare.kind === "story_reply" ? "replied to a story" : `shared a ${ctx.latestShare.mediaType.replace(/^ig_/, "")}`;
    parts.push(ctx.latestShare.readable
      ? `Latest message: ${what} about "${(ctx.latestShare.caption ?? "").slice(0, 120)}"${ctx.latestShare.course ? ` (looks like ${ctx.latestShare.course.name})` : ""}.`
      : `Latest message: ${what} that we cannot see.`);
  }
  return parts.length ? parts.join(" ") : null;
}

export type CourseFactsSource = "lead" | "message" | "shared_post" | "ad";

/**
 * Which course's batches a draft should use. The course set on the lead wins;
 * otherwise the course named in the lead's latest message, then the post they
 * shared, then the ad they replied to. Null when nothing points to a course.
 */
export function inferCourseForFacts(input: {
  interestedCourseId: string | null;
  latestMessage: string | null;
  sharedCourseId: string | null;
  adCourseId: string | null;
  courses: CourseRef[];
}): { courseId: string; source: CourseFactsSource } | null {
  const known = new Set(input.courses.map((c) => c.id).filter((id): id is string => Boolean(id)));
  if (input.interestedCourseId) return { courseId: input.interestedCourseId, source: "lead" };
  const fromMessage = courseFromText(input.latestMessage, input.courses);
  if (fromMessage?.id) return { courseId: fromMessage.id, source: "message" };
  if (input.sharedCourseId && known.has(input.sharedCourseId)) return { courseId: input.sharedCourseId, source: "shared_post" };
  if (input.adCourseId && known.has(input.adCourseId)) return { courseId: input.adCourseId, source: "ad" };
  return null;
}
