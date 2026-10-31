import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type { LiveAudienceInsight } from '@/lib/marketing/live-audience-intelligence';

export type AudienceTrend = {
  previousPeople: number | null;
  deltaPeople: number | null;
  deltaPct: number | null;
  direction: 'up' | 'down' | 'stable' | 'unavailable';
  comparedTo: string | null;
};

type SnapshotRow = {
  segment_key: string;
  matched_people: number | string | null;
  captured_on: string;
  captured_at: string;
};

export async function getAudienceTrendMap(
  organizationId: string,
  segments: LiveAudienceInsight[],
): Promise<Record<string, AudienceTrend>> {
  const unavailable = Object.fromEntries(
    segments.map((segment) => [segment.id, emptyTrend()]),
  );

  try {
    const admin = createAdminClient() as any;
    const todayUtc = new Date().toISOString().slice(0, 10);
    const result = await admin
      .from('marketing_audience_snapshots')
      .select('segment_key,matched_people,captured_on,captured_at')
      .eq('organization_id', organizationId)
      .lt('captured_on', todayUtc)
      .order('captured_on', { ascending: false })
      .order('captured_at', { ascending: false })
      .limit(Math.max(50, segments.length * 14));

    if (result.error) return unavailable;

    const firstBySegment = new Map<string, SnapshotRow>();
    for (const row of (result.data ?? []) as SnapshotRow[]) {
      if (!firstBySegment.has(row.segment_key)) firstBySegment.set(row.segment_key, row);
    }

    return Object.fromEntries(
      segments.map((segment) => {
        const previous = firstBySegment.get(segment.id);
        if (!previous) return [segment.id, emptyTrend()];
        const previousPeople = safeNumber(previous.matched_people);
        const deltaPeople = segment.matchedPeople - previousPeople;
        const deltaPct = previousPeople > 0
          ? Math.round((deltaPeople / previousPeople) * 1000) / 10
          : segment.matchedPeople > 0
            ? 100
            : 0;
        return [segment.id, {
          previousPeople,
          deltaPeople,
          deltaPct,
          direction: deltaPeople > 0 ? 'up' : deltaPeople < 0 ? 'down' : 'stable',
          comparedTo: previous.captured_at,
        } satisfies AudienceTrend];
      }),
    );
  } catch {
    return unavailable;
  }
}

export async function captureAudienceSnapshots(
  organizationId: string,
  segments: LiveAudienceInsight[],
) {
  const admin = createAdminClient() as any;
  const capturedAt = new Date().toISOString();
  const capturedOn = capturedAt.slice(0, 10);
  const rows = segments.map((segment) => ({
    organization_id: organizationId,
    segment_key: segment.id,
    captured_on: capturedOn,
    matched_people: segment.matchedPeople,
    matched_leads: segment.matchedLeads,
    identity_coverage_pct: segment.identityCoveragePct,
    top_source: segment.topSource,
    top_course: segment.topCourse,
    top_location: segment.topLocation,
    top_stage: segment.topStage,
    data_truncated: segment.dataTruncated,
    captured_at: capturedAt,
  }));

  const result = await admin
    .from('marketing_audience_snapshots')
    .upsert(rows, { onConflict: 'organization_id,segment_key,captured_on' });

  if (result.error) throw new Error(`Audience intelligence snapshot failed: ${result.error.message}`);
  return { capturedAt, capturedOn, rows: rows.length };
}

function emptyTrend(): AudienceTrend {
  return {
    previousPeople: null,
    deltaPeople: null,
    deltaPct: null,
    direction: 'unavailable',
    comparedTo: null,
  };
}

function safeNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
