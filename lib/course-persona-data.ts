import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fitScore, learnPersona, PROVISIONAL_STAGES, STRONG_STAGES, type FitResult, type PersonaLead, type PersonaTraits } from "@/lib/course-persona";
import type { InterestProfile } from "@/lib/interest-profile";
import { normalizeCountry } from "@/lib/home-command-center";
import { getInterestProfilesForLeads } from "@/lib/interest-profile-data";

export type CoursePersonaRow = {
  id: string;
  course_id: string;
  name: string | null;
  draft_traits: PersonaTraits | Record<string, never>;
  draft_sample_size: number;
  draft_outcome: string | null;
  draft_computed_at: string | null;
  approved_traits: PersonaTraits | null;
  approved_sample_size: number | null;
  approved_at: string | null;
};

/**
 * Re-learn every course's draft persona for one business from its leads.
 * Writes drafts only; approved personas (used for scoring) never change here.
 */
export async function refreshCoursePersonas(admin: SupabaseClient, organizationId: string): Promise<{ courses: number; learned: number }> {
  const stages = [...STRONG_STAGES, ...PROVISIONAL_STAGES];
  const { data: rows, error } = await admin
    .from("leads")
    .select("id, current_stage, interested_course_id, country, geo_country, lead_creation_channel, updated_at")
    .eq("organization_id", organizationId)
    .in("current_stage", stages)
    .not("interested_course_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(600);
  if (error) throw new Error(`Unable to read leads for personas: ${error.message}`);

  const leads = (rows ?? []) as { id: string; current_stage: string; interested_course_id: string; country: string | null; geo_country: string | null; lead_creation_channel: string | null }[];
  // Real conversions first, so they are always profiled.
  const order = (s: string) => ((STRONG_STAGES as readonly string[]).includes(s) ? 0 : 1);
  const profiled = [...leads].sort((a, b) => order(a.current_stage) - order(b.current_stage)).slice(0, 300);
  const profiles = await getInterestProfilesForLeads(admin, organizationId, profiled.map((l) => l.id), { days: 180 });

  const byCourse = new Map<string, PersonaLead[]>();
  for (const l of leads) {
    const list = byCourse.get(l.interested_course_id) ?? [];
    list.push({
      leadId: l.id, courseId: l.interested_course_id, stage: l.current_stage,
      country: normalizeCountry(l.country) ?? normalizeCountry(l.geo_country), channel: l.lead_creation_channel, profile: profiles.get(l.id) ?? null,
    });
    byCourse.set(l.interested_course_id, list);
  }

  let learned = 0;
  const now = new Date().toISOString();
  for (const [courseId, list] of byCourse) {
    const traits = learnPersona(list);
    if (!traits) continue;
    const { error: upsertError } = await admin.from("course_personas").upsert(
      {
        organization_id: organizationId, course_id: courseId,
        draft_traits: traits, draft_sample_size: traits.sampleSize, draft_outcome: traits.outcome,
        draft_computed_at: now, updated_at: now,
      },
      { onConflict: "organization_id,course_id" },
    );
    if (!upsertError) learned += 1;
  }
  return { courses: byCourse.size, learned };
}

/** Personas of one business, with course names. */
export async function listCoursePersonas(client: SupabaseClient, organizationId: string) {
  const [{ data: personas }, { data: courses }] = await Promise.all([
    client.from("course_personas").select("id, course_id, name, draft_traits, draft_sample_size, draft_outcome, draft_computed_at, approved_traits, approved_sample_size, approved_at")
      .eq("organization_id", organizationId),
    client.from("courses").select("id, name").eq("organization_id", organizationId),
  ]);
  const courseName = new Map(((courses ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  return ((personas ?? []) as CoursePersonaRow[])
    .map((p) => ({ ...p, courseName: courseName.get(p.course_id) ?? "Course" }))
    .sort((a, b) => b.draft_sample_size - a.draft_sample_size);
}

/** Approved persona traits by course, for Fit scores. */
export async function getApprovedPersonas(client: SupabaseClient, organizationId: string): Promise<Map<string, PersonaTraits>> {
  const { data } = await client.from("course_personas").select("course_id, approved_traits")
    .eq("organization_id", organizationId).not("approved_traits", "is", null);
  return new Map(((data ?? []) as { course_id: string; approved_traits: PersonaTraits }[]).map((r) => [r.course_id, r.approved_traits]));
}

/**
 * Fit scores for leads against the approved persona of the course they want.
 * Leads with no course, or a course with no approved persona, get none.
 * Scoped to the business. Never throws.
 */
export async function fitForLeads(
  admin: SupabaseClient,
  organizationId: string,
  leadIds: string[],
  profiles: Map<string, InterestProfile>,
): Promise<Map<string, FitResult>> {
  const out = new Map<string, FitResult>();
  if (!leadIds.length) return out;
  try {
    const personas = await getApprovedPersonas(admin, organizationId);
    if (!personas.size) return out;
    const { data } = await admin.from("leads").select("id, interested_course_id, country, geo_country, lead_creation_channel")
      .eq("organization_id", organizationId).in("id", leadIds.slice(0, 300));
    for (const lead of (data ?? []) as { id: string; interested_course_id: string | null; country: string | null; geo_country: string | null; lead_creation_channel: string | null }[]) {
      const persona = lead.interested_course_id ? personas.get(lead.interested_course_id) : null;
      if (!persona) continue;
      out.set(lead.id, fitScore({
        country: normalizeCountry(lead.country) ?? normalizeCountry(lead.geo_country),
        channel: lead.lead_creation_channel,
        profile: profiles.get(lead.id) ?? null,
      }, persona));
    }
  } catch {
    return new Map();
  }
  return out;
}
