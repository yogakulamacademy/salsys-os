// Data quality, CRM tab for admins (owner-approved mockup, 25 Nov 2026).
// Pure helpers over data_quality_v1.

import type { CourseRef, Msg } from "@/lib/person-checks";

/** mentionedCourse from lib/person-checks, passed in so this file stays dependency-free. */
export type CourseMatcher = (messages: Msg[], courses: CourseRef[]) => { course: CourseRef } | null;

export type DqLead = { leadId: string; name: string; stage: string; channel: string | null; createdAt: string; lastIn: string | null; words: string | null };
export type DqConflict = {
  id: string; leadId: string; personId: string | null; type: string; detectedAt: string | null; candidates: number;
  firstCandidate: string | null; identifierType: string | null; source: string | null; leadName: string; testLead: boolean;
};
export type DataQuality = {
  open: number; noCourse: number; noValue: number; noOwner: number; persons: number; personsVerified: number;
  adSuggestions: Array<{ leadId: string; courseId: string; courseName: string; n: number; total: number; adTitle: string | null }>;
  noCourseLeads: DqLead[];
  noOwnerSample: Array<{ leadId: string; name: string; stage: string; channel: string | null; createdAt: string; course: string | null }>;
  conflicts: DqConflict[];
};

export type FillRow = DqLead & { courseId: string; courseName: string; source: "ad" | "words"; why: string; caution: string | null };

export function isDataQuality(v: unknown): v is DataQuality {
  const d = v as DataQuality | null;
  return Boolean(d && typeof d.open === "number" && Array.isArray(d.adSuggestions) && Array.isArray(d.noCourseLeads) && Array.isArray(d.conflicts));
}

const cleanAd = (t: string | null) => (t ?? "an ad").replace(/^Instagram post:\s*/i, "").replace(/_Group_\d+$/i, "").trim();

/** Course suggestions: the ad they clicked first, then their own words. Everyone else has no clue yet. */
export function courseSuggestions(d: DataQuality, courses: CourseRef[], mentionedCourse: CourseMatcher): { fill: FillRow[]; noClue: DqLead[] } {
  const byAd = new Map(d.adSuggestions.map((s) => [s.leadId, s]));
  const fill: FillRow[] = [];
  const noClue: DqLead[] = [];
  for (const lead of d.noCourseLeads) {
    const ad = byAd.get(lead.leadId);
    const said = lead.words ? mentionedCourse([{ direction: "inbound", body: lead.words, at: lead.createdAt }], courses) : null;
    if (ad) {
      const online = /\bonline\b/i.test(lead.words ?? "") && !/online/i.test(ad.courseName);
      fill.push({
        ...lead, courseId: ad.courseId, courseName: ad.courseName, source: "ad",
        why: `Clicked “${cleanAd(ad.adTitle)}” · ${ad.n} of ${ad.total} from this ad chose it`,
        caution: said && said.course.id !== ad.courseId ? `their messages point to ${said.course.name}` : online ? "they mentioned online" : null,
      });
    } else if (said) {
      fill.push({ ...lead, courseId: said.course.id, courseName: said.course.name, source: "words", why: "Named in their own messages", caution: null });
    } else {
      noClue.push(lead);
    }
  }
  return { fill, noClue };
}

export const pct = (part: number, whole: number) => (whole ? part / whole : 0);

export function pctText(x: number): string {
  const p = x * 100;
  return p > 0 && p < 1 ? `${p.toFixed(1)}%` : `${Math.round(p)}%`;
}

export function dqHeadline(d: DataQuality, fill: number): string {
  const n = (x: number) => x.toLocaleString("en-IN");
  const owners = d.open - d.noOwner;
  const lead = `${n(d.open)} open enquiries: ${n(d.noCourse)} have no course${d.noValue >= d.noCourse * 0.9 ? " (so no value either)" : ""} and ${owners <= 20 ? `only ${n(owners)}` : n(owners)} have an owner.`;
  return fill ? `${lead} ${n(fill)} of the missing courses can be filled from the ad they clicked or what they wrote.` : lead;
}
