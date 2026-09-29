import Link from 'next/link';
import {
  ArrowRight,
  GitBranch,
  Target,
} from 'lucide-react';

import {
  AttributionWorkspace,
  type AttributionModelRow,
} from '@/components/attribution-workspace';
import { PageHeader } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';


export default async function AttributionPage() {
  const supabase = await createClient();

  const {
    data,
    error,
  } = await supabase
    .from('v_attribution_model_rows')
    .select(`
      lead_id,
      lead_code,
      lead_name,
      created_at,
      current_stage,
      lead_status,
      intent,
      course_id,
      course_name,
      preferred_location,
      country,
      model_name,
      attribution_value,
      medium,
      campaign,
      is_known,
      is_qualified_plus,
      is_enrolled,
      revenue_inr,
      revenue_usd
    `)
    .order('created_at', {
      ascending: false,
    })
    .limit(20000);

  const rows: AttributionModelRow[] =
    (data ?? []).map((row: any) => ({
      leadId: String(row.lead_id ?? ''),
      leadCode: String(row.lead_code ?? ''),
      leadName: String(row.lead_name ?? row.lead_code ?? 'Lead'),
      createdAt: String(row.created_at ?? ''),
      currentStage: String(row.current_stage ?? ''),
      leadStatus: String(row.lead_status ?? ''),
      intent: String(row.intent ?? ''),
      courseId: row.course_id ? String(row.course_id) : null,
      courseName: row.course_name ? String(row.course_name) : null,
      preferredLocation: row.preferred_location
        ? String(row.preferred_location)
        : null,
      country: row.country ? String(row.country) : null,
      modelName: String(row.model_name ?? ''),
      attributionValue: String(row.attribution_value ?? 'Unknown'),
      medium: row.medium ? String(row.medium) : null,
      campaign: row.campaign ? String(row.campaign) : null,
      isKnown: Boolean(row.is_known),
      isQualifiedPlus: Boolean(row.is_qualified_plus),
      isEnrolled: Boolean(row.is_enrolled),
      revenueInr: safeNumber(row.revenue_inr),
      revenueUsd: safeNumber(row.revenue_usd),
    }));

  return (
    <>
      <PageHeader
        eyebrow="Customer journey"
        title="Attribution"
        description="Compare acquisition, lead creation, marketing influence and current conversation channels without overwriting the original source of a lead."
        actions={
          <>
            <Link
              href="/campaigns"
              className="btn-secondary"
            >
              <Target size={15} />
              Campaigns
            </Link>

            <Link
              href="/funnel"
              className="btn-primary"
            >
              <GitBranch size={15} />
              Funnel
              <ArrowRight size={14} />
            </Link>
          </>
        }
      />

      <AttributionWorkspace
        rows={rows}
        loadError={
          error
            ? error.message
            : null
        }
      />
    </>
  );
}


function safeNumber(value: unknown) {
  const number = Number(value ?? 0);

  return Number.isFinite(number)
    ? number
    : 0;
}
