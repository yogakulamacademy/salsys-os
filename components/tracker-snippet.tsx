import { TrackerSnippetClient } from '@/components/tracker-snippet-client';
import { getTrackingInstallation } from '@/lib/tracking-data';

export async function TrackerSnippet() {
  const installation = await getTrackingInstallation();

  return (
    <TrackerSnippetClient
      publicKey={installation.publicKey}
      site={installation.site}
      legacyCompat={installation.legacyCompat}
    />
  );
}
