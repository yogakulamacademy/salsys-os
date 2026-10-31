import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type { Channel, IntentLevel, LeadStage } from '@/types/crm';

export type CustomAudienceFilters = {
  course: string;
  location: string;
  stage: string;
  intent: string;
  source: string;
  channel: string;
  recency: string;
};

export type CustomAudienceBuilderOptions = {
  courses: string[];
  locations: string[];
  sources: string[];
  stages: LeadStage[];
  intents: IntentLevel[];
  channels: Channel[];
  recencyDays: number[];
};

export type CustomAudiencePreview = {
  generatedAt: string;
  matchedLeads: number;
  matchedPeople: number;
  identityUnlinkedLeads: number;
  dataTruncated: boolean;
  readOnly: true;
  writesPerformed: 0;
  exportableIdentifiersReturned: false;
  sensitiveRuleRejected: boolean;
  reason?: 'sensitive_audience_rule';
  breakdowns: {
    stage: Array<{ label: string; count: number }>;
    intent: Array<{ label: string; count: number }>;
    course: Array<{ label: string; count: number }>;
    location: Array<{ label: string; count: number }>;
    source: Array<{ label: string; count: number }>;
  };
};

type LeadRow = {
  id: string;
  current_stage: LeadStage;
  intent: IntentLevel;
  interested_course_id: string | null;
  preferred_location: string | null;
  lead_creation_channel: Channel | null;
  last_contacted_at: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  created_at: string;
};

type CourseRow = { id: string; name: string | null };
type AttributionRow = { lead_id: string; first_touch_source: string | null };
type PersonLeadRow = { lead_id: string; person_id: string };

const PAGE_SIZE = 1000;
const HARD_ROW_LIMIT = 20000;
export const CUSTOM_AUDIENCE_STAGES: LeadStage[] = ['new','contacted','engaged','qualified','high_intent','payment_pending','enrolled','nurture','not_now','lost','unqualified','duplicate'];
export const CUSTOM_AUDIENCE_INTENTS: IntentLevel[] = ['unknown','low','medium','high','very_high'];
export const CUSTOM_AUDIENCE_CHANNELS: Channel[] = ['website','instagram','whatsapp','email','phone','meta_lead_form','other'];
export const CUSTOM_AUDIENCE_RECENCY_DAYS = [7, 14, 30, 60, 90, 180, 365];
export const CUSTOM_AUDIENCE_SENSITIVE_PATTERN = /\b(?:pregnan\w*|prenatal|postnatal|fertility|medical|health|diagnos\w*|condition|medication|disease|symptom|therapy|treatment|disability|mental\s*health|addiction|sexual|religion|race|ethnic\w*|politic\w*)\b/i;

export function customAudienceFiltersFromSearchParams(params: URLSearchParams): CustomAudienceFilters {
  return {
    course: clean(params.get('course')),
    location: clean(params.get('location')),
    stage: clean(params.get('stage')),
    intent: clean(params.get('intent')),
    source: clean(params.get('source')),
    channel: clean(params.get('channel')),
    recency: clean(params.get('recency')),
  };
}

export function hasCustomAudienceFilters(filters: CustomAudienceFilters) {
  return Object.values(filters).some(Boolean);
}

export async function loadCustomAudienceBuilderOptions(organizationId: string): Promise<CustomAudienceBuilderOptions> {
  const admin = createAdminClient();
  const [courseResult, locationResult, sourceResult] = await Promise.all([
    admin.from('courses').select('name').eq('organization_id', organizationId).eq('active', true).order('name').limit(500),
    admin.from('leads').select('preferred_location').eq('organization_id', organizationId).neq('status', 'archived').not('preferred_location', 'is', null).limit(2000),
    admin.from('lead_attribution').select('first_touch_source').eq('organization_id', organizationId).not('first_touch_source', 'is', null).limit(2000),
  ]);
  const error = courseResult.error ?? locationResult.error ?? sourceResult.error;
  if (error) throw new Error(`Custom audience options failed: ${error.message}`);

  return {
    courses: safeUnique((courseResult.data ?? []).map((row: { name: string | null }) => row.name)),
    locations: safeUnique((locationResult.data ?? []).map((row: { preferred_location: string | null }) => row.preferred_location)),
    sources: safeUnique((sourceResult.data ?? []).map((row: { first_touch_source: string | null }) => row.first_touch_source)),
    stages: CUSTOM_AUDIENCE_STAGES,
    intents: CUSTOM_AUDIENCE_INTENTS,
    channels: CUSTOM_AUDIENCE_CHANNELS,
    recencyDays: CUSTOM_AUDIENCE_RECENCY_DAYS,
  };
}

export async function previewCustomAudience(input: { organizationId: string; filters: CustomAudienceFilters }): Promise<CustomAudiencePreview> {
  const organizationId = input.organizationId.trim();
  if (!organizationId) throw new Error('organizationId is required.');
  const filters = normalizeFilters(input.filters);
  if ([filters.course, filters.location, filters.source].some((value) => CUSTOM_AUDIENCE_SENSITIVE_PATTERN.test(value))) {
    return rejectedPreview();
  }

  const admin = createAdminClient();
  const coursesResult = await admin.from('courses').select('id,name').eq('organization_id', organizationId);
  if (coursesResult.error) throw new Error(`Custom audience course lookup failed: ${coursesResult.error.message}`);
  const courses = (coursesResult.data ?? []) as CourseRow[];
  const safeCourses = courses.filter((course) => !CUSTOM_AUDIENCE_SENSITIVE_PATTERN.test(String(course.name ?? '')));
  const courseById = new Map(safeCourses.map((course) => [course.id, course.name ?? 'No course']));
  const courseNeedle = filters.course.toLowerCase();
  const courseIds = courseNeedle
    ? safeCourses.filter((course) => String(course.name ?? '').toLowerCase().includes(courseNeedle)).map((course) => course.id)
    : [];
  if (courseNeedle && courseIds.length === 0) return emptyPreview();

  const leads: LeadRow[] = [];
  let from = 0;
  let dataTruncated = false;
  while (from < HARD_ROW_LIMIT) {
    let query = admin
      .from('leads')
      .select('id,current_stage,intent,interested_course_id,preferred_location,lead_creation_channel,last_contacted_at,last_inbound_at,last_outbound_at,created_at')
      .eq('organization_id', organizationId)
      .neq('status', 'archived')
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (filters.stage) query = query.eq('current_stage', filters.stage as LeadStage);
    if (filters.intent) query = query.eq('intent', filters.intent as IntentLevel);
    if (filters.channel) query = query.eq('lead_creation_channel', filters.channel as Channel);
    if (courseIds.length) query = query.in('interested_course_id', courseIds);
    if (filters.location) query = query.ilike('preferred_location', `%${escapeLike(filters.location)}%`);
    const page = await query;
    if (page.error) throw new Error(`Custom audience lead lookup failed: ${page.error.message}`);
    const rows = (page.data ?? []) as LeadRow[];
    leads.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
    if (from >= HARD_ROW_LIMIT) dataTruncated = true;
  }

  const recencyDays = Number(filters.recency);
  const cutoff = CUSTOM_AUDIENCE_RECENCY_DAYS.includes(recencyDays) ? Date.now() - recencyDays * 86400000 : null;
  const candidateLeads = cutoff == null ? leads : leads.filter((lead) => latestTimestamp(lead) >= cutoff);
  const attribution = await fetchAttribution(admin, organizationId, candidateLeads.map((lead) => lead.id));
  const sourceByLead = new Map(attribution.map((row) => [row.lead_id, row.first_touch_source]));
  const sourceNeedle = filters.source.toLowerCase();
  const matchedLeads = sourceNeedle
    ? candidateLeads.filter((lead) => String(sourceByLead.get(lead.id) ?? '').toLowerCase().includes(sourceNeedle))
    : candidateLeads;
  const personLinks = await fetchPersonLinks(admin, organizationId, matchedLeads.map((lead) => lead.id));
  const personByLead = new Map(personLinks.map((row) => [row.lead_id, row.person_id]));
  const people = new Set<string>();
  let unlinked = 0;
  for (const lead of matchedLeads) {
    const personId = personByLead.get(lead.id);
    if (personId) people.add(personId);
    else unlinked += 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    matchedLeads: matchedLeads.length,
    matchedPeople: people.size,
    identityUnlinkedLeads: unlinked,
    dataTruncated,
    readOnly: true,
    writesPerformed: 0,
    exportableIdentifiersReturned: false,
    sensitiveRuleRejected: false,
    breakdowns: {
      stage: breakdown(matchedLeads.map((lead) => lead.current_stage)),
      intent: breakdown(matchedLeads.map((lead) => lead.intent)),
      course: breakdown(matchedLeads.map((lead) => safeLabel(courseById.get(lead.interested_course_id ?? '') ?? 'No course'))),
      location: breakdown(matchedLeads.map((lead) => safeLabel(lead.preferred_location ?? 'No location'))),
      source: breakdown(matchedLeads.map((lead) => safeLabel(sourceByLead.get(lead.id) ?? 'Unknown source'))),
    },
  };
}

function normalizeFilters(filters: CustomAudienceFilters): CustomAudienceFilters {
  return {
    course: clean(filters.course),
    location: clean(filters.location),
    stage: CUSTOM_AUDIENCE_STAGES.includes(filters.stage as LeadStage) ? filters.stage : '',
    intent: CUSTOM_AUDIENCE_INTENTS.includes(filters.intent as IntentLevel) ? filters.intent : '',
    source: clean(filters.source),
    channel: CUSTOM_AUDIENCE_CHANNELS.includes(filters.channel as Channel) ? filters.channel : '',
    recency: CUSTOM_AUDIENCE_RECENCY_DAYS.includes(Number(filters.recency)) ? String(Number(filters.recency)) : '',
  };
}

function rejectedPreview(): CustomAudiencePreview {
  return { ...emptyPreview(), sensitiveRuleRejected: true, reason: 'sensitive_audience_rule' };
}

function emptyPreview(): CustomAudiencePreview {
  return {
    generatedAt: new Date().toISOString(),
    matchedLeads: 0,
    matchedPeople: 0,
    identityUnlinkedLeads: 0,
    dataTruncated: false,
    readOnly: true,
    writesPerformed: 0,
    exportableIdentifiersReturned: false,
    sensitiveRuleRejected: false,
    breakdowns: { stage: [], intent: [], course: [], location: [], source: [] },
  };
}

function safeUnique(values: Array<string | null | undefined>) {
  return [...new Set(values.map(clean).filter((value) => value && !CUSTOM_AUDIENCE_SENSITIVE_PATTERN.test(value)))].sort((a, b) => a.localeCompare(b)).slice(0, 100);
}

function safeLabel(value: string) {
  return CUSTOM_AUDIENCE_SENSITIVE_PATTERN.test(value) ? 'Sensitive category suppressed' : value;
}

function clean(value: string | null | undefined) {
  return String(value ?? '').trim().slice(0, 80);
}

function latestTimestamp(lead: LeadRow) {
  return [lead.last_inbound_at, lead.last_outbound_at, lead.last_contacted_at, lead.created_at].reduce((latest, value) => {
    if (!value) return latest;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) && parsed > latest ? parsed : latest;
  }, 0);
}

function breakdown(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 8);
}

async function fetchAttribution(admin: ReturnType<typeof createAdminClient>, organizationId: string, leadIds: string[]) {
  const rows: AttributionRow[] = [];
  for (const ids of chunk(leadIds, 500)) {
    const result = await admin.from('lead_attribution').select('lead_id,first_touch_source').eq('organization_id', organizationId).in('lead_id', ids);
    if (result.error) throw new Error(`Custom audience attribution lookup failed: ${result.error.message}`);
    rows.push(...((result.data ?? []) as AttributionRow[]));
  }
  return rows;
}

async function fetchPersonLinks(admin: ReturnType<typeof createAdminClient>, organizationId: string, leadIds: string[]) {
  const rows: PersonLeadRow[] = [];
  for (const ids of chunk(leadIds, 500)) {
    const result = await admin.from('person_leads').select('lead_id,person_id').eq('organization_id', organizationId).in('lead_id', ids);
    if (result.error) throw new Error(`Custom audience identity lookup failed: ${result.error.message}`);
    rows.push(...((result.data ?? []) as PersonLeadRow[]));
  }
  return rows;
}

function chunk<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
  return chunks;
}

function escapeLike(value: string) {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}
