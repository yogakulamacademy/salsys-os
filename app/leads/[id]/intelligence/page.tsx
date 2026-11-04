import Link from "next/link";
import { notFound } from "next/navigation";

import { AILeadInsightPanel } from "@/components/ai-lead-insight-panel";
import { getLead, isMockMode } from "@/lib/data";

export const dynamic = "force-dynamic";

/**
 * C4 full-page lead intelligence review.
 * Never renders unless explicitly enabled AND the staff member can access
 * the lead through the CRM's existing authorization boundary.
 */
export default async function LeadIntelligencePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (
    isMockMode() ||
    process.env.AI_LEAD_INSIGHTS_ENABLED !== "true" ||
    process.env.AI_LEAD_INSIGHTS_UI_ENABLED !== "true"
  ) {
    notFound();
  }

  const lead = await getLead(id);
  if (!lead) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-3 py-4 sm:px-6">
      <Link
        href={`/leads/${encodeURIComponent(id)}`}
        className="inline-flex text-xs font-semibold text-copy-muted hover:text-copy"
      >
        Back to lead profile
      </Link>
      <AILeadInsightPanel leadId={id} />
      <p className="text-xs leading-5 text-copy-muted">
        Internal analysis only. Staff must verify every recommendation
        before taking action.
      </p>
    </div>
  );
}
