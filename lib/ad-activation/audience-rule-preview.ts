import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type { Channel, IntentLevel, LeadStage } from '@/types/crm';

export type AudienceRulePreviewRule = {
  id: string;
  name: string;
  courseSearch?: string;
  locationSearch?: string;
  includeStages?: LeadStage[];
  excludeStages?: LeadStage[];
  includeIntents?: IntentLevel[];
  includeChannels?: Channel[];
  maxInteractionAgeDays?: number;
};

export type AudienceRulePreviewBreakdown = Array<{ label: string; count: number }>;

export type AudienceRulePreview = {
  ruleId: string;
  ruleName: string;
  generatedAt: string;
  matchedLeads: number;
  matchedPeople: number;
  identityUnlinkedLeads: number;
  dataTruncated: boolean;
  readOnly: true;
  writesPerformed: 0;
  exportableIdentifiersReturned: false;
  sensitiveRuleRejected: false;
  breakdowns: {
    stage: AudienceRulePreviewBreakdown;
    intent: AudienceRulePreviewBreakdown;
    course: AudienceRulePreviewBreakdown;
    location: AudienceRulePreviewBreakdown;
    source: AudienceRulePreviewBreakdown;
  };
};

export type AudienceRulePreviewRejected = {
  ruleId: string;
  ruleName: string;
  generatedAt: string;
  readOnly: true;
  writesPerformed: 0;
  exportableIdentifiersReturned: false;
  sensitiveRuleRejected: true;
  reason: 'sensitive_audience_rule';
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

type CourseRow = { id: string; code: string | null; name: string };
type PersonLeadRow = { lead_id: string; person_id: string };
type AttributionRow = { lead_id: string; first_touch_source: string | null };

const PAGE_SIZE = 1000;
const HARD_ROW_LIMIT = 20000;
const SENSITIVE_RULE_PATTERN = /\b(?:pregnan\w*|prenatal|postnatal|fertility|medical|health|diagnos\w*|condition|disease|symptom|medication|therapy|treatment)\b/i;

export const SAFE_AUDIENCE_PREVIEW_RULES: readonly AudienceRulePreviewRule[] = Object.freeze([
  {
    id: 'mysore-active-prospects',
    name: 'Mysore active prospects',
    locationSearch: 'mysore',
    includeStages: ['new', 'contacted', 'engaged', 'qualified', 'high_intent', 'payment_pending', 'nurture', 'not_now'],
    excludeStages: ['enrolled', 'lost', 'unqualified', 'duplicate'],
    maxInteractionAgeDays: 60,
  },
  {
    id: '200h-recent-prospects',
    name: '200H recent prospects',
    courseSearch: '200',
    includeStages: ['new', 'contacted', 'engaged', 'qualified', 'high_intent', 'payment_pending', 'nurture', 'not_now'],
    excludeStages: ['enrolled', 'lost', 'unqualified', 'duplicate'],
    maxInteractionAgeDays: 90,
  },
  {
    id: 'online-active-prospects',
    name: 'Online active prospects',
    locationSearch: 'online',
    includeStages: ['new', 'contacted', 'engaged', 'qualified', 'high_intent', 'payment_pending', 'nurture', 'not_now'],
    excludeStages: ['enrolled', 'lost', 'unqualified', 'duplicate'],
    maxInteractionAgeDays: 60,
  },
  {
    id: 'alumni-progression',
    name: 'Alumni progression',
    includeStages: ['enrolled'],
  },
]);

export function findSafeAudiencePreviewRule(ruleId: string | null | undefined) {
  const normalized = String(ruleId ?? '').trim();
  return SAFE_AUDIENCE_PREVIEW_RULES.find((rule) => rule.id === normalized) ?? SAFE_AUDIENCE_PREVIEW_RULES[0];
}

export async function previewAudienceRule(input: {
  organizationId: string;
  rule: AudienceRulePreviewRule;
}): Promise<AudienceRulePreview | AudienceRulePreviewRejected> {
  const organizationId = input.organizationId.trim();
  if (!organizationId) throw new Error('organizationId is required for audience preview.');

  const sensitiveInput = [input.rule.name, input.rule.courseSearch, input.rule.locationSearch]
    .filter(Boolean)
    .join(' ');
  if (SENSITIVE_RULE_PATTERN.test(sensitiveInput)) {
    return rejected(input.rule);
  }

  const admin = createAdminClient();
  const courseResult = await admin
    .from('courses')
    .select('id,code,name')
    .eq('organization_id', organizationId);
  if (courseResult.error) throw new Error(`Audience preview course lookup failed: ${courseResult.error.message}`);

  const courses = (courseResult.data ?? []) as CourseRow[];
  const courseIds = resolveCourseIds(courses, input.rule.courseSearch);
  if (input.rule.courseSearch && courseIds.length === 0) {
    return emptyPreview(input.rule);
  }

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

    if (input.rule.includeStages?.length) query = query.in('current_stage', input.rule.includeStages);
    if (input.rule.includeIntents?.length) query = query.in('intent', input.rule.includeIntents);
    if (courseIds.length) query = query.in('interested_course_id', courseIds);
    if (input.rule.locationSearch) query = query.ilike('preferred_location', `%${escapeLike(input.rule.locationSearch)}%`);
    if (input.rule.includeChannels?.length) query = query.in('lead_creation_channel', input.rule.includeChannels);

    const page = await query;
    if (page.error) throw new Error(`Audience preview lead lookup failed: ${page.error.message}`);
    const rows = (page.data ?? []) as LeadRow[];
    leads.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
    if (from >= HARD_ROW_LIMIT) dataTruncated = true;
  }

  const filtered = leads.filter((lead) => matchesInMemoryRules(lead, input.rule));
  const leadIds = filtered.map((lead) => lead.id);
  const [personLinks, attribution] = await Promise.all([
    fetchPersonLinks(admin, organizationId, leadIds),
    fetchAttribution(admin, organizationId, leadIds),
  ]);

  const personByLead = new Map(personLinks.map((row) => [row.lead_id, row.person_id]));
  const sourceByLead = new Map(attribution.map((row) => [row.lead_id, row.first_touch_source]));
  const courseById = new Map(courses.map((course) => [course.id, course.name]));
  const people = new Set<string>();
  let unlinked = 0;

  for (const lead of filtered) {
    const personId = personByLead.get(lead.id);
    if (personId) people.add(personId);
    else unlinked += 1;
  }

  return {
    ruleId: input.rule.id,
    ruleName: input.rule.name,
    generatedAt: new Date().toISOString(),
    matchedLeads: filtered.length,
    matchedPeople: people.size,
    identityUnlinkedLeads: unlinked,
    dataTruncated,
    readOnly: true,
    writesPerformed: 0,
    exportableIdentifiersReturned: false,
    sensitiveRuleRejected: false,
    breakdowns: {
      stage: breakdown(filtered.map((lead) => lead.current_stage)),
      intent: breakdown(filtered.map((lead) => lead.intent)),
      course: breakdown(filtered.map((lead) => safeBreakdownLabel(courseById.get(lead.interested_course_id ?? '') ?? 'No course'))),
      location: breakdown(filtered.map((lead) => lead.preferred_location?.trim() || 'No location')),
      source: breakdown(filtered.map((lead) => sourceByLead.get(lead.id)?.trim() || lead.lead_creation_channel || 'Unknown')),
    },
  };
}

function rejected(rule: AudienceRulePreviewRule): AudienceRulePreviewRejected {
  return {
    ruleId: rule.id,
    ruleName: rule.name,
    generatedAt: new Date().toISOString(),
    readOnly: true,
    writesPerformed: 0,
    exportableIdentifiersReturned: false,
    sensitiveRuleRejected: true,
    reason: 'sensitive_audience_rule',
  };
}

function emptyPreview(rule: AudienceRulePreviewRule): AudienceRulePreview {
  return {
    ruleId: rule.id,
    ruleName: rule.name,
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

function resolveCourseIds(courses: CourseRow[], search?: string) {
  const needle = String(search ?? '').trim().toLowerCase();
  if (!needle) return [];
  return courses
    .filter((course) => `${course.code ?? ''} ${course.name}`.toLowerCase().includes(needle))
    .map((course) => course.id);
}

function matchesInMemoryRules(lead: LeadRow, rule: AudienceRulePreviewRule) {
  if (rule.excludeStages?.includes(lead.current_stage)) return false;
  if (rule.maxInteractionAgeDays != null) {
    const cutoff = Date.now() - rule.maxInteractionAgeDays * 86400000;
    const activity = latestTimestamp([
      lead.last_inbound_at,
      lead.last_outbound_at,
      lead.last_contacted_at,
      lead.created_at,
    ]);
    if (activity < cutoff) return false;
  }
  return true;
}

function latestTimestamp(values: Array<string | null>) {
  return values.reduce((latest, value) => {
    if (!value) return latest;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) && parsed > latest ? parsed : latest;
  }, 0);
}

function safeBreakdownLabel(value: string) {
  return SENSITIVE_RULE_PATTERN.test(value) ? 'Sensitive category suppressed' : value;
}

function breakdown(values: string[]): AudienceRulePreviewBreakdown {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 8);
}

async function fetchPersonLinks(admin: ReturnType<typeof createAdminClient>, organizationId: string, leadIds: string[]) {
  if (!leadIds.length) return [] as PersonLeadRow[];
  const rows: PersonLeadRow[] = [];
  for (const ids of chunk(leadIds, 500)) {
    const result = await admin
      .from('person_leads')
      .select('lead_id,person_id')
      .eq('organization_id', organizationId)
      .in('lead_id', ids);
    if (result.error) throw new Error(`Audience preview identity lookup failed: ${result.error.message}`);
    rows.push(...((result.data ?? []) as PersonLeadRow[]));
  }
  return rows;
}

async function fetchAttribution(admin: ReturnType<typeof createAdminClient>, organizationId: string, leadIds: string[]) {
  if (!leadIds.length) return [] as AttributionRow[];
  const rows: AttributionRow[] = [];
  for (const ids of chunk(leadIds, 500)) {
    const result = await admin
      .from('lead_attribution')
      .select('lead_id,first_touch_source')
      .eq('organization_id', organizationId)
      .in('lead_id', ids);
    if (result.error) throw new Error(`Audience preview attribution lookup failed: ${result.error.message}`);
    rows.push(...((result.data ?? []) as AttributionRow[]));
  }
  return rows;
}

function chunk<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, '\\$&');
}
