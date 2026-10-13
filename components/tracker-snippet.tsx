import { TrackerSnippetClient } from '@/components/tracker-snippet-client';
import { TrackingInstallationPanel } from '@/components/tracking-installation-panel';
import { getTrackingInstallation } from '@/lib/tracking-data';

export async function TrackerSnippet() {
  const installation = await getTrackingInstallation();

  return (
    <>
      <TrackingInstallationPanel installation={installation} />
      <TrackerSnippetClient
        publicKey={installation.publicKey}
        site={installation.site}
        legacyCompat={installation.legacyCompat}
      />
    </>
  );
}
