import type { ReactNode } from 'react';

import { ExecutiveDecisionBrief } from '@/components/marketing/executive-decision-brief';
import { TrackingSourceInspectorGrid } from '@/components/marketing/tracking-source-inspector-grid';
import { getTrackingPlatformWorkspace } from '@/lib/tracking-platform-data';

export default async function MarketingTrackingSourcesLayout({ children }: { children: ReactNode }) {
  const workspace = await getTrackingPlatformWorkspace();
  const total = workspace.sources.length;
  const healthy = workspace.sources.filter((source) => source.healthStatus === 'healthy').length;
  const idle = workspace.sources.filter((source) => source.healthStatus === 'idle').length;
  const unhealthy = workspace.sources.filter((source) => ['misconfigured', 'degraded'].includes(source.healthStatus)).length;
  const notLive = workspace.sources.filter((source) => ['not_live', 'inactive'].includes(source.healthStatus)).length;
  const coverage = total > 0 ? (healthy / total) * 100 : null;
  const priority = workspace.sources.find((source) => ['misconfigured', 'degraded'].includes(source.healthStatus))
    ?? workspace.sources.find((source) => source.healthStatus === 'idle')
    ?? workspace.sources.find((source) => ['not_live', 'inactive'].includes(source.healthStatus))
    ?? null;

  const title = total === 0
    ? 'Tracking sources are not configured yet.'
    : unhealthy > 0
      ? `${unhealthy} tracking source${unhealthy === 1 ? '' : 's'} need configuration attention.`
      : idle > 0
        ? `${idle} source${idle === 1 ? '' : 's'} are configured but currently idle.`
        : healthy === total
          ? 'All configured tracking sources are healthy.'
          : 'Tracking coverage is only partially live.';

  const summary = priority
    ? `${priority.name} is the highest-priority source to review. Downstream acquisition, attribution and conversion views should be treated as partial where this source is expected to contribute evidence.`
    : total > 0
      ? 'Accepted source events are reaching the canonical Salsys measurement pipeline. Continue monitoring freshness and privacy configuration before using the data for budget decisions.'
      : 'Create a website, commerce or mobile source before treating first-party measurement as complete.';

  return (
    <div className="space-y-4">
      <ExecutiveDecisionBrief
        eyebrow="Measurement health brief"
        title={title}
        summary={summary}
        confidenceLabel={coverage === null ? 'Coverage unknown' : `${coverage.toFixed(0)}% healthy`}
        confidenceDetail="Source health is based on accepted events, processing state, privacy configuration and SDK provenance. A configured source is not considered healthy until real evidence arrives."
        signals={[
          {
            label: 'Configured',
            value: total.toLocaleString('en-IN'),
            detail: 'Website, commerce and mobile sources registered in this workspace.',
            tone: total > 0 ? 'neutral' : 'watch',
          },
          {
            label: 'Healthy now',
            value: healthy.toLocaleString('en-IN'),
            detail: 'Sources with accepted recent event evidence.',
            tone: total > 0 && healthy === total ? 'positive' : healthy > 0 ? 'neutral' : 'watch',
          },
          {
            label: 'Idle / not live',
            value: (idle + notLive).toLocaleString('en-IN'),
            detail: 'Configured sources without sufficiently recent live evidence.',
            tone: idle + notLive > 0 ? 'watch' : 'positive',
          },
          {
            label: 'Misconfigured',
            value: unhealthy.toLocaleString('en-IN'),
            detail: 'Sources with configuration or processing evidence that needs attention.',
            tone: unhealthy > 0 ? 'risk' : 'positive',
          },
        ]}
        actions={priority ? [{ label: 'Review source health', href: '#source-inspector', detail: `Inspect ${priority.name}` }] : []}
      />

      <div id="source-inspector">
        <TrackingSourceInspectorGrid
          sources={workspace.sources.map((source) => ({
            id: source.id,
            name: source.name,
            platform: source.platform ?? source.sourceSystem ?? source.sourceType,
            hostname: source.hostname,
            healthStatus: source.healthStatus,
            events24h: source.events24h,
            events7d: source.events7d,
            visitors7d: source.visitors7d,
            sessions7d: source.sessions7d,
            acceptedEventCount: source.acceptedEventCount,
            duplicateEventCount: source.duplicateEventCount,
            rejectedEventCount: source.rejectedEventCount,
            lastSeenAt: source.lastSeenAt,
            sdkName: source.sdkName,
            sdkVersion: source.sdkVersion,
            privacyNoticeVersion: source.privacyNoticeVersion,
          }))}
        />
      </div>

      {children}
    </div>
  );
}
