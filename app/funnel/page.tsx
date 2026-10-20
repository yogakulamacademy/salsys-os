import Link from "next/link";
import { RefreshCw, Sparkles } from "lucide-react";

import { FunnelIntelligenceWorkspace } from "@/components/funnel-intelligence-workspace";
import { PageHeader } from "@/components/ui";
import { getFunnelIntelligenceWorkspace } from "@/lib/funnel-intelligence-data";

export default async function FunnelPage() {
  const workspace = await getFunnelIntelligenceWorkspace();

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Intelligence"
        title="Funnel Intelligence"
        description="Discover where prospects convert, drop off, and need attention."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/commercial-intelligence" className="btn-secondary">
              <Sparkles size={15} />
              Ask Salsys
            </Link>
            <Link href="/re-engaged" className="btn-secondary">
              <RefreshCw size={15} />
              Lead activity
            </Link>
          </div>
        }
      />

      <FunnelIntelligenceWorkspace workspace={workspace} />
    </div>
  );
}
