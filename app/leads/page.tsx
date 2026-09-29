import Link from 'next/link';
import {
  Plus,
} from 'lucide-react';

import {
  LeadsWorkspace,
  type LeadListIntelligence,
} from '@/components/leads-workspace';
import {
  PageHeader,
} from '@/components/ui';
import {
  getLeads,
  isMockMode,
} from '@/lib/data';
import {
  createClient,
} from '@/lib/supabase/server';


type LeadsPageProps = {
  searchParams: Promise<{
    notice?: string;
  }>;
};


export default async function LeadsPage({
  searchParams,
}: LeadsPageProps) {
  const supabase =
    await createClient();

  const [
    leads,
    params,
    intelligenceResult,
  ] = await Promise.all([
    getLeads(),
    searchParams,

    supabase
      .from(
        'v_pipeline_stage_aging'
      )
      .select(`
        lead_id,
        owner_user_id,
        owner_name,
        aging_status,
        stage_entered_at,
        stage_age_hours,
        stage_age_days,
        warning_after_days,
        stuck_after_days,
        days_over_stuck_threshold,
        days_since_last_contact,
        preferred_batch_id,
        batch_code,
        batch_location,
        batch_start_date,
        batch_end_date
      `)
      .order(
        'stage_age_days',
        {
          ascending: false,
        }
      )
      .limit(
        5000
      ),
  ]);

  const mock =
    isMockMode();

  let intelligence: LeadListIntelligence[] =
    [];

  let intelligenceError:
    string |
    null =
    null;

  if (
    intelligenceResult.error
  ) {
    intelligenceError =
      intelligenceResult.error.message;
  } else {
    intelligence =
      (
        intelligenceResult.data ??
        []
      ) as LeadListIntelligence[];
  }

  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="Leads"
        description="Find, filter and triage every prospect across website, Instagram, WhatsApp, paid media and other acquisition channels."
        actions={
          <Link
            href="/leads/new"
            className="btn-primary"
          >
            <Plus
              size={16}
            />
            Add lead
          </Link>
        }
      />

      {params.notice ===
        'mock-create' && (
        <div className="mb-4 rounded-xl border border-orange-100 bg-orange-50 px-4 py-3 text-sm font-medium text-orange-700">
          Mock mode is active, so the test lead was not saved. Switch to Supabase mode when you are ready for persistence.
        </div>
      )}

      {intelligenceError && (
        <div className="mb-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
          Lead list loaded, but owner / stage-aging intelligence could not be loaded: {intelligenceError}
        </div>
      )}

      <LeadsWorkspace
        leads={
          leads
        }
        intelligence={
          intelligence
        }
        mock={
          mock
        }
      />
    </>
  );
}
